import {parseSave,serializeSave,sanitizePhotos}from "@craft/engine";
export const CAMERA_JOURNAL_KEY="craft.camera.capture.v1";
const WORLD="craft.save.v1",PHOTOS="craft.portfolio.v1";
interface Store{getItem(k:string):string|null;setItem(k:string,v:string):void;removeItem(k:string):void}
interface Journal{version:1;beforeWorld:string|null;afterWorld:string;beforePhotos:string|null;afterPhotos:string}
function read(raw:string):Journal{
 const q=JSON.parse(raw)as Journal;
 if(!q||Object.keys(q).sort().join()!==["version","beforeWorld","afterWorld","beforePhotos","afterPhotos"].sort().join()||q.version!==1||typeof q.afterWorld!=="string"||typeof q.afterPhotos!=="string"||!(q.beforeWorld===null||typeof q.beforeWorld==="string")||!(q.beforePhotos===null||typeof q.beforePhotos==="string"))throw Error("Damaged Camera capture journal");
 serializeSave(parseSave(q.afterWorld));const photos=JSON.parse(q.afterPhotos),checked=sanitizePhotos(photos,24);if(checked.dropped||JSON.stringify(checked.photos)!==q.afterPhotos)throw Error("Damaged Camera photo receipt");return q;
}
/** The journal is the single durable commit. Materialize idempotently, never overwrite unrelated data. */
export function recoverCameraCapture(storage:Store=localStorage):void{
 const raw=storage.getItem(CAMERA_JOURNAL_KEY);if(raw===null)return;const q=read(raw),world=storage.getItem(WORLD),photos=storage.getItem(PHOTOS);
 if(![q.beforeWorld,q.afterWorld].includes(world)||![q.beforePhotos,q.afterPhotos].includes(photos))throw Error("Camera capture conflicts with saved data; recovery journal preserved");
 storage.setItem(WORLD,q.afterWorld);storage.setItem(PHOTOS,q.afterPhotos);
 if(storage.getItem(WORLD)!==q.afterWorld||storage.getItem(PHOTOS)!==q.afterPhotos)throw Error("Camera capture could not be persisted");storage.removeItem(CAMERA_JOURNAL_KEY);
}
export function commitCameraCapture(afterWorld:string,afterPhotos:string,storage:Store=localStorage):{committed:boolean;complete:boolean}{
 if(storage.getItem(CAMERA_JOURNAL_KEY)!==null)return{committed:false,complete:false};
 const q:Journal={version:1,beforeWorld:storage.getItem(WORLD),beforePhotos:storage.getItem(PHOTOS),afterWorld,afterPhotos};const raw=JSON.stringify(q);read(raw);
 try{storage.setItem(CAMERA_JOURNAL_KEY,raw);}catch{return{committed:false,complete:false};}
 try{recoverCameraCapture(storage);return{committed:true,complete:true};}catch{return{committed:true,complete:false};}
}
