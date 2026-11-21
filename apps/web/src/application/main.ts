import { tryBlockById, blockId, allAtlasTextureNames, parseSave, seedFromString, stackId, type GameMode, type SaveData } from "@craft/engine";
import { buildAtlas, MAX_PACK_BYTES, parseLocalTexturePack, type ParsedLocalTexturePack, type TextureAtlas } from "@craft/textures";
import { readLocalTexturePack, writeLocalTexturePack } from "../persistence/resourcePackStore";
import { blockIcon } from "../ui/icons";
import { Game, SAVE_KEY } from "./game";
import "../ui/style.css";

const app = document.getElementById("app")!;
const textureKeys = allAtlasTextureNames();
const originalAtlas = buildAtlas(textureKeys);
let atlas = originalAtlas;
interface LocalPack { pack: ParsedLocalTexturePack; bytes: Uint8Array<ArrayBuffer>; atlas: TextureAtlas }
let localPack: LocalPack | null = null;
let packNotice = "";
let resourceGeneration = 0;
let resourceBusy = false;

async function prepareLocalPack(bytes: Uint8Array<ArrayBuffer>): Promise<LocalPack> {
  const pack = await parseLocalTexturePack(bytes, textureKeys);
  return { pack, bytes: bytes.slice(), atlas: buildAtlas(textureKeys, pack.tiles) };
}
const params = new URLSearchParams(location.search);
const touch = params.has("touch")
  ? params.get("touch") !== "0"
  : window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
document.body.classList.toggle("touch", touch);

let game: Game | null = null;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

function button(text: string, onClick: () => void, className = "mc-button"): HTMLButtonElement {
  const b = el("button", className, text);
  b.addEventListener("click", onClick);
  return b;
}

function loadSave(): SaveData | null {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    return text ? parseSave(text) : null;
  } catch {
    return null;
  }
}

function screen(className: string, ...children: HTMLElement[]): HTMLElement {
  const s = el("div", `screen ${className}`);
  const panel = el("div", "panel menu-panel");
  panel.append(...children);
  s.appendChild(panel);
  return s;
}

function showTitle(): void {
  resourceGeneration++;
  app.replaceChildren();
  const title = el("div", "title-screen");
  const logo = el("div", "logo");
  for (const name of ["grass", "oak_log", "bricks", "glass", "diamond_ore"]) {
    const img = el("img");
    img.src = blockIcon(atlas, blockId(name));
    img.alt = "";
    logo.appendChild(img);
  }
  const heading = el("h1", "", "AgentFlow Craft");
  const tagline = el("p", "tagline", "Build, explore and learn — in your browser");
  const menu = el("div", "menu-buttons");
  const save = loadSave();
  if (save) menu.appendChild(button(`Continue “${save.name}”`, () => startGame({ save }), "mc-button primary"));
  menu.appendChild(button("Create New World", showCreate, save ? "mc-button" : "mc-button primary"));
  menu.appendChild(button("Resource Packs", () => showResourcePacks()));
  menu.appendChild(button("How to Play", showHelp));
  title.append(logo, heading, tagline, menu);
  if (packNotice) { const status = el("p", "pack-status", packNotice); status.setAttribute("role", "alert"); title.append(status); }
  title.append(el("p", "footer", localPack
    ? "Not affiliated with Mojang or Microsoft. Local texture packs stay on this device."
    : "Not affiliated with Mojang or Microsoft. Original procedural artwork."));
  app.appendChild(title);
}

/** Local texture changes are staged and committed only while no Game is active. */
function showResourcePacks(message = ""): void {
  if (game || resourceBusy) return;
  const generation = ++resourceGeneration;
  let candidate: LocalPack | null = null;
  const status = el("p", "pack-status", message); status.setAttribute("role", "status");
  const current = el("p", "pack-current", `Current: ${localPack?.pack.name ?? "Original textures"}`);
  const coverage = el("p", "pack-coverage");
  const previewLabel = el("h3", "", "Preview");
  const previews = el("div", "pack-previews");
  const details = el("details", "pack-details");
  const input = el("input"); input.type = "file"; input.accept = ".json,application/json"; input.hidden = true; input.setAttribute("aria-label", "Texture pack file");
  const use = button("Use pack", () => { if (candidate) void commit(candidate); }, "mc-button primary"); use.hidden = true;
  const select = button("Import texture pack", () => input.click());
  const reset = button("Use original textures", () => { void commit(null); });
  const back = button("Back", showTitle);
  const hint = el("p", "hint", "Choose a compatible application texture pack (.json). Standard Minecraft packs are not supported here.");
  const s = screen("resource-packs-screen", el("h2", "", "Resource Packs"), current, coverage, previewLabel, previews, details, select, input, use, reset, back, hint, status);
  app.replaceChildren(s);
  const visible = () => s.isConnected && generation === resourceGeneration && game === null;
  const feedback = (text: string, error = false) => {
    status.textContent = text; status.setAttribute("role", error ? "alert" : "status");
    status.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const renderPreview = (choice: LocalPack | null) => {
    const active = choice?.atlas ?? originalAtlas;
    const applied = choice?.atlas.report.appliedKeys.length ?? 0;
    coverage.textContent = `${applied} of ${textureKeys.length} textures replaced; ${textureKeys.length - applied} use original artwork.`;
    previews.replaceChildren();
    for (const name of ["stone", "glass", "oak_log", "diamond_ore", "iron_ingot", "element_constructor", "compound_creator", "material_reducer", "lab_table"]) {
      const image = el("img"); image.src = blockIcon(active, stackId(name), 48); image.alt = name.replaceAll("_", " "); previews.append(image);
    }
    details.replaceChildren(el("summary", "", "Pack details"));
    if (choice) {
      const report = choice.atlas.report;
      details.append(el("p", "", `Images supplied: ${choice.pack.tiles.size}. Textures replaced directly: ${report.directAppliedKeys.length}. Station faces using the shared image: ${report.inheritedAppliedKeys.length}. ${report.source16Count} effective tiles at 16×16; ${report.source32Count} at 32×32. ${report.expanded16To32Count} tiles expanded by 2×.`), el("p", "pack-hash", `SHA-256: ${choice.pack.contentSha256}`));
    } else details.append(el("p", "", "Original generated artwork."));
  };
  const busy = (value: boolean) => { resourceBusy = value; for (const control of s.querySelectorAll<HTMLButtonElement | HTMLInputElement>("button,input")) control.disabled = value; };
  async function commit(choice: LocalPack | null): Promise<void> {
    if (!visible() || resourceBusy) return;
    busy(true); feedback("Saving texture choice…");
    try {
      await writeLocalTexturePack(choice?.bytes ?? null);
    } catch {
      busy(false); feedback("The texture choice could not be saved. Your current textures and world are unchanged. Try again.", true);
      return;
    }
    // Persistence is complete. A later rendering error must not claim this committed choice failed.
    localPack = choice; atlas = choice?.atlas ?? originalAtlas; packNotice = "";
    busy(false); showResourcePacks(choice ? `Using ${choice.pack.name}.` : "Using original textures.");
  }
  input.addEventListener("change", () => {
    const file = input.files?.[0]; input.value = "";
    if (!file || !visible()) return;
    candidate = null; use.hidden = true; feedback("Opening texture pack…");
    const attempt = ++readAttempt;
    void (async () => {
      try {
        if (file.size > MAX_PACK_BYTES) throw new Error("Choose a texture pack of 8 MiB or smaller.");
        const prepared = await prepareLocalPack(new Uint8Array(await file.arrayBuffer()));
        if (!visible() || attempt !== readAttempt) return;
        candidate = prepared; previewLabel.textContent = `Preview: ${prepared.pack.name}`; renderPreview(prepared); use.hidden = false;
        feedback("Ready to use. Your current textures change only when you choose Use pack.");
      } catch (error) {
        if (!visible() || attempt !== readAttempt) return;
        renderPreview(localPack); previewLabel.textContent = "Preview";
        feedback(`This pack could not be opened. Your current textures are unchanged. ${error instanceof Error ? error.message : "Choose another compatible pack."}`, true);
      }
    })();
  });
  let readAttempt = 0;
  renderPreview(localPack);
  if (message) feedback(message);
}

function showCreate(): void {
  const name = el("input", "mc-input");
  name.value = "My World";
  name.setAttribute("aria-label", "World name");
  const seed = el("input", "mc-input");
  seed.placeholder = "Leave blank for random";
  seed.setAttribute("aria-label", "Seed");
  let mode: GameMode = "creative";
  const modeButton = button("Game Mode: Creative", () => {
    mode = mode === "creative" ? "survival" : "creative";
    modeButton.textContent = `Game Mode: ${mode === "creative" ? "Creative" : "Survival"}`;
  });
  modeButton.dataset.testid = "mode";
  let animals = true;
  const animalsButton = button("Spawn Animals: On", () => {
    animals = !animals;
    animalsButton.textContent = `Spawn Animals: ${animals ? "On" : "Off"}`;
  });
  const field = (label: string, input: HTMLElement) => {
    const l = el("label", "field");
    l.append(el("span", "", label), input);
    return l;
  };
  const create = button("Create", () => {
    const text = seed.value.trim();
    const numericSeed = text ? seedFromString(text) : Math.floor(Math.random() * 2 ** 31);
    localStorage.removeItem(SAVE_KEY);
    startGame({ name: name.value.trim() || "My World", seed: numericSeed, mode, spawnAnimals: animals });
  }, "mc-button primary");
  create.dataset.testid = "create";
  app.replaceChildren(screen("create-screen", el("h2", "", "Create New World"), field("World Name", name), field("Seed", seed), modeButton, animalsButton, create, button("Cancel", showTitle)));
}

function showHelp(): void {
  const list = el("div", "help");
  list.innerHTML = `
    <h3>Computer</h3>
    <p><b>WASD</b> move · <b>Mouse</b> look · <b>Space</b> jump (double-tap to fly in Creative) · <b>Shift</b> sneak / fly down · <b>Ctrl</b> sprint</p>
    <p><b>Left click</b> break · <b>Right click</b> place · <b>Middle click</b> pick block · <b>1–9 / wheel</b> hotbar · <b>Q</b> drop one · <b>Ctrl+Q</b> drop stack</p>
    <p><b>E</b> inventory · <b>C</b> camera · <b>P</b> portfolio · <b>/</b> or <b>T</b> commands · <b>F3</b> debug · <b>Esc</b> pause</p>
    <h3>Touch</h3>
    <p><b>Left joystick</b> move · <b>Drag</b> right side to look · <b>Tap</b> place · <b>Hold</b> break</p>
    <p><b>⤒</b> jump · <b>✈</b> fly (Creative) · <b>⤓</b> sneak / fly down · <b>•••</b> inventory · <b>📷</b> camera · <b>🖼</b> portfolio</p>
    <h3>Education Edition features</h3>
    <p><b>Allow</b> / <b>Deny</b>: in Survival you can only build above Allow blocks, never above Deny blocks. <b>Border</b> blocks are unbreakable.</p>
    <p><b>Camera &amp; Portfolio</b>: <b>C</b> (📷) takes a photo, <b>P</b> (🖼) opens the portfolio, where you can caption, save or delete photos.</p>
    <p><b>NPCs</b>: <code>/summon npc Name</code>; right click (tap) an NPC to talk. In Creative you can edit its name and dialogue.</p>
    <h3>Crafting &amp; mobs</h3>
    <p>Survival inventory has a 2×2 crafting grid; right click a <b>Crafting Table</b> for 3×3. Pigs, sheep, chickens and adult cows roam grassland; left click to attack (sheep drop wool). Buckets collect and place one Water or Lava source at a time. Liquids stay in place. Water above or beside Lava turns it into Obsidian; use a Diamond Pickaxe to harvest it. Lava hurts on contact. Use an empty Bucket on an adult cow for milk. Hold use to drink milk and remove active effects.</p>
    <p>Survival death drops carried items and worn armor. Use <code>/gamerule keepInventory true</code> to keep them; this world rule is saved.</p>
    <h3>Commands</h3>
    <p>/gamemode creative|survival · /time set day|night|noon|midnight · /tp x y z · /give glass 64 · /summon pig|sheep|chicken|cow|zombie|spider|squid|npc · /gamerule doMobSpawning false · /seed</p>`;
  app.replaceChildren(screen("help-screen", el("h2", "", "How to Play"), list, button("Back", showTitle)));
}

function startGame(opts: { save?: SaveData; name?: string; seed?: number; mode?: GameMode; spawnAnimals?: boolean }): void {
  if (resourceBusy) return;
  resourceGeneration++;
  app.replaceChildren();
  const loading = screen("loading-screen", el("h2", "", "Generating world…"));
  app.appendChild(loading);
  requestAnimationFrame(() => {
    game = new Game(app, atlas, {
      name: opts.save?.name ?? opts.name ?? "My World",
      seed: opts.save?.seed ?? opts.seed ?? 0,
      mode: opts.save?.mode ?? opts.mode ?? "creative",
      touch,
      spawnAnimals: opts.spawnAnimals,
      save: opts.save,
    }, { onPause: showPause, onDeath: showDeath });
    loading.remove();
    game.start();
    if (game.dead) showDeath();
  });
}

function overlay(className: string, ...children: HTMLElement[]): HTMLElement {
  const s = screen(`overlay ${className}`, ...children);
  app.appendChild(s);
  return s;
}

/** Reveal updated recovery feedback inside the existing scrollable menu without moving focus. */
function showSaveStatus(status: HTMLElement, message: string): void {
  status.textContent = message;
  status.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function showPause(): void {
  if (!game) return;
  const g = game;
  const close = () => {
    document.removeEventListener("keydown", onKey);
    s.remove();
    g.resume();
  };
  const modeButton = button(`Game Mode: ${g.mode === "creative" ? "Creative" : "Survival"}`, () => {
    g.setMode(g.mode === "creative" ? "survival" : "creative");
    modeButton.textContent = `Game Mode: ${g.mode === "creative" ? "Creative" : "Survival"}`;
  });
  const distance = el("input", "mc-range");
  distance.type = "range";
  distance.min = "2";
  distance.max = "12";
  distance.value = String(g.renderer.renderDistance);
  distance.setAttribute("aria-label", "Render distance");
  const distanceLabel = el("span", "", `Render Distance: ${g.renderer.renderDistance} chunks`);
  distance.addEventListener("input", () => {
    g.renderer.renderDistance = Number(distance.value);
    distanceLabel.textContent = `Render Distance: ${distance.value} chunks`;
  });
  const field = el("label", "field");
  field.append(distanceLabel, distance);
  const saveStatus = el("p", "save-status"); saveStatus.setAttribute("role", "alert");
  const s = overlay(
    "pause-screen",
    el("h2", "", "Game Menu"),
    button("Back to Game", close, "mc-button primary"),
    modeButton,
    field,
    button("Save & Quit to Title", () => {
      if (!g.stop()) { showSaveStatus(saveStatus, g.saveError); return; }
      document.removeEventListener("keydown", onKey);
      game = null;
      showTitle();
    }),
    button("Export world backup", () => { g.exportSaveBackup(); showSaveStatus(saveStatus, "Backup download requested. Keep the downloaded file before leaving."); }),
    saveStatus,
  );
  const onKey = (e: KeyboardEvent) => {
    if (e.code === "Escape" && s.isConnected) {
      document.removeEventListener("keydown", onKey);
      close();
    }
  };
  setTimeout(() => document.addEventListener("keydown", onKey), 0);
}

function showDeath(): void {
  if (!game || app.querySelector(".death-screen")) return;
  const g = game;
  const status = el("p", "save-status"); status.setAttribute("role", "alert");
  const s = overlay("death-screen", el("h2", "", "You died!"), button("Respawn", () => {
    if (!g.respawn()) { showSaveStatus(status, g.deathError || "Respawn could not complete. Your items remain preserved."); return; }
    s.remove();
  }, "mc-button primary"), button("Title Screen", () => {
    if (!g.stop()) { showSaveStatus(status, g.saveError); return; }
    game = null;
    showTitle();
  }), button("Export world backup", () => { g.exportSaveBackup(); showSaveStatus(status, "Backup download requested. Keep the downloaded file before leaving."); }), status);
  if (g.deathError) showSaveStatus(status, g.deathError);
}

// Test / automation hook: lets end-to-end tests observe and drive the game deterministically.
declare global {
  interface Window {
    __craft: { readonly game: Game | null; readonly atlas: TextureAtlas; readonly texturePack: { name: string; contentSha256: string; applied: number; fallback: number } | null; startGame: typeof startGame; blockId: typeof blockId; blockName: (id: number) => string; stackId: typeof stackId; touch: boolean };
  }
}
window.__craft = {
  get game() {
    return game;
  },
  get atlas() { return atlas; },
  get texturePack() { return localPack ? { name: localPack.pack.name, contentSha256: localPack.pack.contentSha256, applied: localPack.atlas.report.appliedKeys.length, fallback: localPack.atlas.report.fallbackKeys.length } : null; },
  startGame,
  blockId,
  blockName: (id: number) => tryBlockById(id)?.name ?? "?",
  stackId,
  touch,
};

async function bootstrap(): Promise<void> {
  app.replaceChildren(screen("loading-screen", el("h2", "", "Loading textures…")));
  try {
    const bytes = await readLocalTexturePack();
    if (bytes) { localPack = await prepareLocalPack(bytes); atlas = localPack.atlas; }
  } catch { packNotice = "Your local texture pack could not be loaded. Using original textures; import it again or reset it in Resource Packs."; }
  showTitle();
}
void bootstrap();
