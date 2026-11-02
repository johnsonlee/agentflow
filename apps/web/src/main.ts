import { BLOCKS, blockId, itemTextureNames, parseSave, seedFromString, stackId, textureNames, type GameMode, type SaveData } from "@craft/engine";
import { buildAtlas } from "@craft/textures";
import { blockIcon } from "./icons";
import { Game, SAVE_KEY } from "./game";
import "./style.css";

const app = document.getElementById("app")!;
const atlas = buildAtlas([...textureNames(), ...itemTextureNames()]);
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
  menu.appendChild(button("How to Play", showHelp));
  title.append(logo, heading, tagline, menu, el("p", "footer", "Not affiliated with Mojang or Microsoft. All textures are procedurally generated."));
  app.appendChild(title);
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
    <p><b>Left click</b> break · <b>Right click</b> place · <b>Middle click</b> pick block · <b>1–9 / wheel</b> hotbar</p>
    <p><b>E</b> inventory · <b>C</b> camera · <b>P</b> portfolio · <b>/</b> or <b>T</b> commands · <b>F3</b> debug · <b>Esc</b> pause</p>
    <h3>Touch</h3>
    <p><b>Left joystick</b> move · <b>Drag</b> right side to look · <b>Tap</b> place · <b>Hold</b> break</p>
    <p><b>⤒</b> jump · <b>✈</b> fly (Creative) · <b>⤓</b> sneak / fly down · <b>•••</b> inventory · <b>📷</b> camera · <b>🖼</b> portfolio</p>
    <h3>Education Edition features</h3>
    <p><b>Allow</b> / <b>Deny</b>: in Survival you can only build above Allow blocks, never above Deny blocks. <b>Border</b> blocks are unbreakable.</p>
    <p><b>Camera &amp; Portfolio</b>: <b>C</b> (📷) takes a photo, <b>P</b> (🖼) opens the portfolio, where you can caption, save or delete photos.</p>
    <p><b>NPCs</b>: <code>/summon npc Name</code>; right click (tap) an NPC to talk. In Creative you can edit its name and dialogue.</p>
    <h3>Crafting &amp; mobs</h3>
    <p>Survival inventory has a 2×2 crafting grid; right click a <b>Crafting Table</b> for 3×3. Pigs, sheep and chickens roam grassland; left click to attack (sheep drop wool).</p>
    <h3>Commands</h3>
    <p>/gamemode creative|survival · /time set day|night|noon|midnight · /tp x y z · /give glass 64 · /summon pig|sheep|chicken|npc · /gamerule doMobSpawning false · /seed</p>`;
  app.replaceChildren(screen("help-screen", el("h2", "", "How to Play"), list, button("Back", showTitle)));
}

function startGame(opts: { save?: SaveData; name?: string; seed?: number; mode?: GameMode; spawnAnimals?: boolean }): void {
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
  });
}

function overlay(className: string, ...children: HTMLElement[]): HTMLElement {
  const s = screen(`overlay ${className}`, ...children);
  app.appendChild(s);
  return s;
}

function showPause(): void {
  if (!game) return;
  const g = game;
  const close = () => {
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
  const s = overlay(
    "pause-screen",
    el("h2", "", "Game Menu"),
    button("Back to Game", close, "mc-button primary"),
    modeButton,
    field,
    button("Save & Quit to Title", () => {
      g.stop();
      game = null;
      showTitle();
    }),
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
  if (!game) return;
  const g = game;
  const s = overlay("death-screen", el("h2", "", "You died!"), button("Respawn", () => {
    s.remove();
    g.respawn();
  }, "mc-button primary"), button("Title Screen", () => {
    g.stop();
    game = null;
    showTitle();
  }));
}

// Test / automation hook: lets end-to-end tests observe and drive the game deterministically.
declare global {
  interface Window {
    __craft: { readonly game: Game | null; startGame: typeof startGame; blockId: typeof blockId; blockName: (id: number) => string; stackId: typeof stackId; touch: boolean };
  }
}
window.__craft = {
  get game() {
    return game;
  },
  startGame,
  blockId,
  blockName: (id: number) => (BLOCKS[id] ? BLOCKS[id].name : "?"),
  stackId,
  touch,
};

showTitle();
