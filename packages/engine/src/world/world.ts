import { PortalSystem, isPortalActionBusy } from "../simulation/portals";
import { FluidSystem, planFluidChanges, isLavaBlock, isWaterBlock } from "../simulation/fluids";
import { FireSystem } from "../simulation/fire";
import { GravelHarvestResolver } from "../ownership/gravel-harvest";
import { AIR, blockId, isKnownBlockId, isOpaque } from "../catalog/blocks";
import { WORLD_BORDER } from "../core/math";
import { MAX_LIGHT, emission, relightBlock, spread, type LightAccess } from "./light";
import { CHUNK_SIZE, Chunk, WORLD_HEIGHT, chunkKey, toChunkCoord, toLocalCoord } from "./chunk";
import { TerrainGenerator, type GeneratorVersion } from "./generator";
import { NetherGenerator } from "./nether-generator";
import { isDimensionId, type DimensionId } from "../core/dimensions";

export type BlockEdit = [x: number, y: number, z: number, id: number];
export interface WorldCellSnapshot { x:number;y:number;z:number;id:number;revision:number;chunk:Chunk }
export interface BlockSourceLease {valid():boolean;commit(finalize?:()=>void):boolean;release():void}
export type ChunkListener = (cx: number, cz: number) => void;
export type BlockListener = (x: number, y: number, z: number, id: number) => void;

/**
 * Infinite world made of lazily generated chunks. Player edits are tracked separately
 * so a world can be saved as (seed, edits) and regenerated deterministically.
 */
export class World {
  readonly generator: TerrainGenerator | NetherGenerator;
  readonly gravelHarvests = new GravelHarvestResolver(this);
  readonly fires = new FireSystem(this);
  readonly fluids = new FluidSystem(this);
  readonly portals = new PortalSystem(this);
  private readonly cellRevisions = new Map<string,number>();
  private batchBusy = false;
  private sourceLease:symbol|undefined;
  private sourceLeaseDepth=0;
  get blockSourceLeaseBusy():boolean{return this.sourceLeaseDepth>0;}
  private loadingChunks=0;
  private readonly pendingBlockNotifications=new Map<string,BlockEdit>();
  private readonly pendingChunkNotifications=new Set<string>();
  private readonly chunks = new Map<string, Chunk>();
  private readonly edits = new Map<string, Map<number, number>>();
  private readonly listeners = new Set<ChunkListener>();
  private readonly blockListeners = new Set<BlockListener>();
  /** Chunks whose light changed during the current update (to re-mesh them). */
  private readonly lightTouched = new Set<string>();
  private lastPeek: Chunk | undefined;
  private mutationVersion = 0;
  /** Monotonic real-cell change identity, including same-ID remove/reinsert cycles. */
  get blockMutationVersion(): number { return this.mutationVersion; }

  /** Light accessors over loaded chunks only (never generates terrain). */
  private readonly lightAccess: LightAccess = {
    get: (x, y, z) => {
      const c = this.peek(x, z);
      return c ? c.light[Chunk.index(toLocalCoord(x), y, toLocalCoord(z))] : -1;
    },
    set: (x, y, z, packed) => {
      const c = this.peek(x, z);
      if (!c) return;
      c.light[Chunk.index(toLocalCoord(x), y, toLocalCoord(z))] = packed;
      this.lightTouched.add(chunkKey(c.cx, c.cz));
    },
    block: (x, y, z) => this.peek(x, z)?.get(toLocalCoord(x), y, toLocalCoord(z)) ?? AIR,
  };

  constructor(readonly seed: number, readonly generatorVersion:GeneratorVersion = 1, readonly dimension:DimensionId = "overworld") {
    if(!isDimensionId(dimension))throw new RangeError("Unsupported world dimension");
    if(generatorVersion!==1&&generatorVersion!==2&&generatorVersion!==3||dimension==="nether"&&generatorVersion!==1)throw new RangeError("Unsupported world generator version");
    this.lightAccess.skyLight = dimension === "overworld";
    this.generator = dimension === "nether" ? new NetherGenerator(seed,1) : new TerrainGenerator(seed,generatorVersion);
  }

  hasChunk(cx: number, cz: number): boolean {
    return this.chunks.has(chunkKey(cx, cz));
  }

  getChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      if(this.sourceLease)throw new Error("World source lease prevents chunk generation");
      chunk = this.generator.generate(cx, cz);
      const chunkEdits = this.edits.get(key);
      if (chunkEdits) for (const [index, id] of chunkEdits) chunk.blocks[index] = id;
      this.chunks.set(key, chunk);
      this.loadingChunks++;
      try{this.reconcileLoadedFluids(chunk);this.lightChunk(chunk);}
      finally{this.loadingChunks--;if(this.loadingChunks===0)this.flushNotifications();}
    }
    return chunk;
  }

  /** Loaded chunk containing world column (x, z), without generating it. */
  private peek(x: number, z: number): Chunk | undefined {
    const cx = toChunkCoord(x);
    const cz = toChunkCoord(z);
    const last = this.lastPeek;
    if (last && last.cx === cx && last.cz === cz) return last;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (c) this.lastPeek = c;
    return c;
  }

  /**
   * Packed light at a block: sky light (0-15) in the high nibble, block light in the low nibble.
   * Above the world (or in unloaded chunks) it is full sky light.
   */
  getLight(x: number, y: number, z: number): number {
    if (y >= WORLD_HEIGHT) return this.dimension === "nether" ? 0 : MAX_LIGHT << 4;
    if (y < 0) return 0;
    const c = this.peek(Math.floor(x), Math.floor(z));
    if (!c) return this.dimension === "nether" ? 0 : MAX_LIGHT << 4;
    return c.light[Chunk.index(toLocalCoord(x), Math.floor(y), toLocalCoord(z))];
  }

  /** Initial light for a freshly generated chunk: sky columns, emitters, then flood fill (incl. into loaded neighbours). */
  private lightChunk(chunk: Chunk): void {
    const x0 = chunk.cx * CHUNK_SIZE;
    const z0 = chunk.cz * CHUNK_SIZE;
    const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const sky: number[] = [];
    const block: number[] = [];
    if (this.dimension === "overworld") for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        let y = WORLD_HEIGHT - 1;
        for (; y >= 0; y--) {
          if (isOpaque(chunk.blocks[Chunk.index(lx, y, lz)])) break;
          chunk.light[Chunk.index(lx, y, lz)] = MAX_LIGHT << 4;
        }
        heights[lz * CHUNK_SIZE + lx] = y + 1;
      }
    }
    for (let i = 0; i < chunk.blocks.length; i++) {
      const e = emission(chunk.blocks[i]);
      if (e === 0) continue;
      chunk.light[i] = (chunk.light[i] & 0xf0) | e;
      const lx = i % CHUNK_SIZE;
      const lz = Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE;
      block.push(x0 + lx, Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE)), z0 + lz);
    }
    // Sky-lit cells next to a shaded column spread sideways (under overhangs, into caves).
    const h = (lx: number, lz: number) =>
      lx < 0 || lz < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE ? -1 : heights[lz * CHUNK_SIZE + lx];
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const own = h(lx, lz);
        const top = Math.max(h(lx + 1, lz), h(lx - 1, lz), h(lx, lz + 1), h(lx, lz - 1));
        for (let y = own; y < top; y++) sky.push(x0 + lx, y, z0 + lz);
      }
    }
    // Pull light in from loaded neighbours' border cells.
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = this.chunks.get(chunkKey(chunk.cx + dx, chunk.cz + dz));
      if (!n) continue;
      const lx = dx === 1 ? 0 : dx === -1 ? CHUNK_SIZE - 1 : -1;
      const lz = dz === 1 ? 0 : dz === -1 ? CHUNK_SIZE - 1 : -1;
      for (let i = 0; i < CHUNK_SIZE; i++) {
        const nx = lx >= 0 ? lx : i;
        const nz = lz >= 0 ? lz : i;
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const p = n.light[Chunk.index(nx, y, nz)];
          if (p === 0) continue;
          const wx = n.cx * CHUNK_SIZE + nx;
          const wz = n.cz * CHUNK_SIZE + nz;
          if (p >> 4 > 1) sky.push(wx, y, wz);
          if ((p & 15) > 1) block.push(wx, y, wz);
        }
      }
    }
    this.lightTouched.clear();
    if (this.dimension === "overworld") spread(this.lightAccess, sky, "sky");
    spread(this.lightAccess, block, "block");
    const own = chunkKey(chunk.cx, chunk.cz);
    for (const key of this.lightTouched) {
      if (key === own) continue;
      const [cx, cz] = key.split(",").map(Number);
      this.emit(cx, cz);
    }
    this.lightTouched.clear();
  }

  /** Drops a chunk from memory; edits are kept and re-applied when it is regenerated. */
  unloadChunk(cx: number, cz: number): void {
    if(this.sourceLease)return;
    this.chunks.delete(chunkKey(cx, cz));
    if (this.lastPeek?.cx === cx && this.lastPeek.cz === cz) this.lastPeek = undefined;
  }

  loadedChunkCount(): number {
    return this.chunks.size;
  }

  /** Detached coordinates of already loaded chunks; never loads terrain or exposes storage. */
  loadedChunkCoordinates(): Array<readonly [number, number]> {
    return [...this.chunks.values()].map(chunk => [chunk.cx, chunk.cz] as const);
  }

  /** Undefined means unloaded; never generates terrain. Out-of-height cells are air. */
  getLoadedBlock(x: number, y: number, z: number): number | undefined {
    if (!(y >= 0 && y < WORLD_HEIGHT)) return AIR;
    return this.peek(Math.floor(x), Math.floor(z))?.get(toLocalCoord(x), Math.floor(y), toLocalCoord(z));
  }

  getBlock(x: number, y: number, z: number): number {
    if(this.dimension==="nether"&&(Math.abs(x)>WORLD_BORDER||Math.abs(z)>WORLD_BORDER))return AIR;
    // Outside the world (or NaN): air. Never generate chunks for nonsense coordinates.
    if (!(y >= 0 && y < WORLD_HEIGHT) || !(Math.abs(x) <= WORLD_BORDER + 64) || !(Math.abs(z) <= WORLD_BORDER + 64)) return AIR;
    const chunk = this.getChunk(toChunkCoord(x), toChunkCoord(z));
    return chunk.get(toLocalCoord(x), Math.floor(y), toLocalCoord(z));
  }

  /** Loaded physical cell identity; unload/reload and same-ID remove/reinsert defeat stale plans. */
  captureCell(x:number,y:number,z:number):WorldCellSnapshot|undefined {
    if(![x,y,z].every(Number.isSafeInteger)||y<0||y>=WORLD_HEIGHT||Math.abs(x)>WORLD_BORDER||Math.abs(z)>WORLD_BORDER)return undefined;
    const chunk=this.peek(x,z);if(!chunk)return undefined;
    return {x,y,z,id:chunk.get(toLocalCoord(x),y,toLocalCoord(z)),revision:this.cellRevisions.get(`${x},${y},${z}`)??0,chunk};
  }
  cellUnchanged(s:WorldCellSnapshot):boolean {
    return this.peek(s.x,s.z)===s.chunk&&(this.cellRevisions.get(`${s.x},${s.y},${s.z}`)??0)===s.revision&&s.chunk.get(toLocalCoord(s.x),s.y,toLocalCoord(s.z))===s.id;
  }

  /** Bounded source reservation across a drop receiver. Supported writes, unloads and
   * generation are refused; direct raw Chunk storage mutation is outside this contract. */
  reserveBlockBatch(edits:readonly BlockEdit[]):BlockSourceLease|null {
    if(this.batchBusy||this.sourceLease||!Array.isArray(edits)||!edits.length||edits.length>CHUNK_SIZE*CHUNK_SIZE*WORLD_HEIGHT*2||edits.some(e=>!Array.isArray(e)||e.length!==4))return null;
    if(new Set(edits.map(e=>`${e[0]},${e[1]},${e[2]}`)).size!==edits.length)return null;
    const detached=edits.map(e=>[...e] as BlockEdit),portal=this.portals.planChanges(detached);if(!portal)return null;
    const expected:WorldCellSnapshot[]=[...portal.expected];
    for(const e of detached){if(!isKnownBlockId(e[3]))return null;const s=this.captureCell(e[0],e[1],e[2]);if(!s)return null;expected.push(s);}
    const token=Symbol("block-source-lease");let released=false,used=false,handoff=false;
    const valid=()=>!released&&!used&&(this.sourceLease===token||handoff)&&portal.valid()&&expected.every(s=>this.cellUnchanged(s));
    this.sourceLease=token;this.sourceLeaseDepth++;
    const release=()=>{if(released)return;released=true;if(this.sourceLease===token)this.sourceLease=undefined;this.sourceLeaseDepth--;};
    return {valid,release,commit:(finalize?:()=>void)=>{
      if(!valid()){release();return false;}
      // No callback between releasing the write lock and entering batchBusy.
      handoff=true;this.sourceLease=undefined;
      try {const committed=this.commitBlockBatch(detached,finalize,expected,valid);used=true;return committed;}
      finally {release();}
    }};
  }

  /** Trusted synchronous owner finalization only. Fluid actions never generate unloaded targets. */
  commitBlockBatch(edits:readonly BlockEdit[],finalize?:()=>void,expected:readonly WorldCellSnapshot[]=[],ownerValid?:()=>boolean):boolean {
    if(this.batchBusy||this.sourceLease)return false;this.batchBusy=true;
    const changed:BlockEdit[]=[],notifyChunks=new Set<string>();let committed=false;
    try {
      if(!Array.isArray(edits)||edits.length<1||edits.length>CHUNK_SIZE*CHUNK_SIZE*WORLD_HEIGHT*2)return false;
      const staged=new Map<string,BlockEdit>();
      for(const e of edits){
        if(!Array.isArray(e)||e.length!==4||!isKnownBlockId(e[3])||!this.captureCell(e[0],e[1],e[2]))return false;
        const k=`${e[0]},${e[1]},${e[2]}`;if(staged.has(k))return false;staged.set(k,[e[0],e[1],e[2],e[3]]);
      }
      const portalPlan=this.portals.planChanges([...staged.values()]);if(!portalPlan)return false;
      for(const e of portalPlan.edits)staged.set(`${e[0]},${e[1]},${e[2]}`,e);
      const resolution=planFluidChanges(this,[...staged.values()]);
      for(const e of resolution.edits)staged.set(`${e[0]},${e[1]},${e[2]}`,e);
      // Fire invalidation historically removes a Fire above any changed support. Stage those
      // real cells now so Fire hooks cannot expose an observer-visible half-committed batch.
      for(const e of [...staged.values()]) {
        const aboveKey=`${e[0]},${e[1]+1},${e[2]}`,explicitAbove=staged.get(aboveKey);
        if(this.getLoadedBlock(e[0],e[1],e[2])===e[3]||this.getLoadedBlock(e[0],e[1]+1,e[2])!==blockId("fire")||!this.fires.hasRecord(e[0],e[1]+1,e[2]))continue;
        // A requested replacement already removes the old Fire; never overwrite that outcome.
        if(explicitAbove&&explicitAbove[3]!==blockId("fire"))continue;
        staged.set(aboveKey,[e[0],e[1]+1,e[2],AIR]);
      }
      const captures:WorldCellSnapshot[]=[];
      for(const e of staged.values()){const snapshot=this.captureCell(e[0],e[1],e[2]);if(!snapshot)return false;captures.push(snapshot);if(snapshot.id!==e[3])changed.push(e);}
      if(!changed.length||!portalPlan.valid()||!resolution.valid()||expected.some(s=>!this.cellUnchanged(s))||ownerValid&&!ownerValid()||!portalPlan.valid()||!resolution.valid()||captures.some(s=>!this.cellUnchanged(s))||expected.some(s=>!this.cellUnchanged(s)))return false;
      for(const[x,y,z,id]of changed){
        const chunk=this.peek(x,z)!;chunk.set(toLocalCoord(x),y,toLocalCoord(z),id);this.mutationVersion++;this.cellRevisions.set(`${x},${y},${z}`,this.mutationVersion);this.gravelHarvests.invalidate(x,y,z);
        const ck=chunkKey(chunk.cx,chunk.cz);let edits=this.edits.get(ck);if(!edits)this.edits.set(ck,edits=new Map());edits.set(Chunk.index(toLocalCoord(x),y,toLocalCoord(z)),id);
        notifyChunks.add(ck);if(toLocalCoord(x)===0)notifyChunks.add(chunkKey(chunk.cx-1,chunk.cz));if(toLocalCoord(x)===CHUNK_SIZE-1)notifyChunks.add(chunkKey(chunk.cx+1,chunk.cz));if(toLocalCoord(z)===0)notifyChunks.add(chunkKey(chunk.cx,chunk.cz-1));if(toLocalCoord(z)===CHUNK_SIZE-1)notifyChunks.add(chunkKey(chunk.cx,chunk.cz+1));
      }
      for(const[x,y,z]of changed)this.fires.blockChanged(x,y,z);
      portalPlan.commit();
      finalize?.();
      committed=true;
      this.lightTouched.clear();for(const[x,y,z]of changed)relightBlock(this.lightAccess,x,y,z);for(const k of this.lightTouched)notifyChunks.add(k);this.lightTouched.clear();
    }finally{this.batchBusy=false;}
    if(committed){
      for(const[x,y,z,id]of changed)this.notifyBlock(x,y,z,id);
      for(const k of notifyChunks){const[cx,cz]=k.split(",").map(Number);this.emit(cx,cz);}
    }
    return committed;
  }

  /** Valid ordinary writes preserve lazy generation; callers needing refusal use loaded batches. */
  setBlock(x:number,y:number,z:number,id:number,finalize?:()=>void):void {
    if(!isKnownBlockId(id)||this.batchBusy||this.sourceLease)return;x=Math.floor(x);y=Math.floor(y);z=Math.floor(z);
    if(!(y>=0&&y<WORLD_HEIGHT)||!(Math.abs(x)<=WORLD_BORDER)||!(Math.abs(z)<=WORLD_BORDER))return;
    this.getChunk(toChunkCoord(x),toChunkCoord(z));if(this.getLoadedBlock(x,y,z)===id)return;
    this.commitBlockBatch([[x,y,z,id]],finalize);
  }

  /** Subscribes to individual block changes (after light is updated). */
  onBlockChanged(listener: BlockListener): () => void {
    this.blockListeners.add(listener);
    return () => this.blockListeners.delete(listener);
  }

  /** Subscribes to chunk changes (including neighbours whose faces may change). */
  onChunkChanged(listener: ChunkListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** All player edits as world coordinates. */
  exportEdits(): BlockEdit[] {
    const out: BlockEdit[] = [];
    for (const [key, chunkEdits] of this.edits) {
      const [cx, cz] = key.split(",").map(Number);
      for (const [index, id] of chunkEdits) {
        const lx = index % CHUNK_SIZE;
        const lz = Math.floor(index / CHUNK_SIZE) % CHUNK_SIZE;
        const y = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE));
        out.push([cx * CHUNK_SIZE + lx, y, cz * CHUNK_SIZE + lz, id]);
      }
    }
    return out;
  }

  importEdits(edits: readonly BlockEdit[]): void {
    if(this.batchBusy||isPortalActionBusy(this))return;
    // Import replaces logical world contents, including same-ID cells; restore decisions afterward.
    this.gravelHarvests.clear();
    this.fires.clear();
    this.fluids.clear();
    for (const [x, y, z, id] of edits) this.setBlock(x, y, z, id);
  }

  /** Y of the highest solid, non-plant block in a column, or -1. */
  surfaceY(x: number, z: number, isGround: (id: number) => boolean): number {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (isGround(this.getBlock(x, y, z))) return y;
    }
    return -1;
  }

  /** Loading a neighbor can reveal the Water that cools an already loaded Lava source. */
  private reconcileLoadedFluids(chunk:Chunk):void {
    const seeds=new Map<string,BlockEdit>(),x0=chunk.cx*CHUNK_SIZE,z0=chunk.cz*CHUNK_SIZE;
    const lava=(x:number,y:number,z:number)=>{if(isLavaBlock(this.getLoadedBlock(x,y,z)??AIR))seeds.set(`${x},${y},${z}`,[x,y,z,blockId("lava")]);};
    for(let y=0;y<WORLD_HEIGHT;y++)for(let z=0;z<CHUNK_SIZE;z++)for(let x=0;x<CHUNK_SIZE;x++){
      const id=chunk.get(x,y,z),wx=x0+x,wz=z0+z;if(isLavaBlock(id)&&[[0,1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]].some(([dx,dy,dz])=>isWaterBlock(this.getLoadedBlock(wx+dx,y+dy,wz+dz)??AIR)))lava(wx,y,wz);
      else if(isWaterBlock(id))for(const[dx,dy,dz]of[[1,0,0],[-1,0,0],[0,-1,0],[0,0,1],[0,0,-1]])lava(wx+dx,y+dy,wz+dz);
    }
    if(seeds.size)this.commitBlockBatch([...seeds.values()]);
  }

  private notifyBlock(x:number,y:number,z:number,id:number):void {
    if(this.loadingChunks){this.pendingBlockNotifications.set(`${x},${y},${z}`,[x,y,z,id]);return;}
    for(const listener of [...this.blockListeners])try{listener(x,y,z,id);}catch{/* Postcommit observation cannot undo owners. */}
  }
  private flushNotifications():void {
    const blocks=[...this.pendingBlockNotifications.values()],chunks=[...this.pendingChunkNotifications];this.pendingBlockNotifications.clear();this.pendingChunkNotifications.clear();
    for(const[x,y,z,id]of blocks)this.notifyBlock(x,y,z,id);for(const k of chunks){const[cx,cz]=k.split(",").map(Number);this.emit(cx,cz);}
  }
  private emit(cx:number,cz:number):void {
    if(this.loadingChunks){this.pendingChunkNotifications.add(chunkKey(cx,cz));return;}
    for(const listener of [...this.listeners])try{listener(cx,cz);}catch{/* Committed state remains committed. */}
  }
}
