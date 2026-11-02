# AgentFlow Craft

A Minecraft-style voxel sandbox for the browser, written in TypeScript. It plays on desktop (keyboard and mouse) and on mobile (virtual joystick and touch gestures).

> Not affiliated with Mojang or Microsoft. The textures are original 16×16 pixel art, generated procedurally in the Minecraft style. No Minecraft assets are included.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173  (add ?touch=1 to force the mobile UI)
npm run build      # production build in apps/web/dist
```

## Packages

| Package | Purpose |
| --- | --- |
| `packages/engine` (`@craft/engine`) | Engine code with no rendering: block registry, chunked infinite world, seeded terrain (biomes, trees, ores, water), AABB player physics, voxel raycasting, chunk mesher (face culling and ambient occlusion), inventory, game rules (creative/survival, Allow/Deny), day/night cycle, chat commands, save format |
| `packages/textures` (`@craft/textures`) | Procedural pixel-art tiles for every block, packed into a texture atlas |
| `packages/input` (`@craft/input`) | Keyboard/mouse with pointer lock, virtual joystick, and touch gestures (tap places, hold breaks, drag looks), merged into one device-independent `InputFrame` |
| `apps/web` (`@craft/web`) | Vite + Three.js client: renderer, sky, clouds, HUD, menus, inventory, persistence |

## Features

- An infinite, seeded world with plains, forest, desert, snowy and ocean biomes, oak and birch trees, flowers, ores and bedrock
- 38 block types (37 in the creative palette, plus water), including glass, wool, bookshelves, glowstone and the Education Edition **Allow**, **Deny** and **Border** blocks
- **Creative** mode (fly with a double jump, instant break, block palette) and **Survival** mode (timed breaking with a crack overlay, drops collected into a 36-slot inventory, health and fall damage, respawn)
- **Crafting:** a 2×2 grid in the survival inventory and a 3×3 grid at a Crafting Table (planks, crafting table, bookshelf, snow, dyed wool, glowstone; recipes are limited to blocks because the game has no separate items)
- **Mobs:** pigs, sheep and chickens wander grassland, hop up ledges, panic when hit, and can be defeated (sheep drop wool)
- **Education Edition:** Camera & Portfolio (capture, caption, save, delete photos); NPCs with editable names and dialogue (`/summon npc`); Allow/Deny/Border
- Hotbar, inventory screen, middle-click pick block, sneaking (won't walk off edges), sprinting, swimming
- A 20-minute day/night cycle with sun, moon and clouds; underwater fog
- Commands: `/gamemode`, `/time set`, `/tp`, `/give`, `/summon`, `/gamerule doMobSpawning|doDaylightCycle`, `/seed`, `/help`
- Autosaves to `localStorage` (blocks, inventory, NPCs); use **Continue** on the title screen to resume
- Touch controls (Pointer Events, so they also work with a mouse or pen on the mobile layout): a floating joystick, camera drag, tap to place or talk, hold to break, jump/fly/descend buttons, auto-jump, tappable hotbar, and inventory, camera and portfolio buttons

### Not implemented (compared with Minecraft: Education Edition)
Code Builder / Agent, chemistry (elements, compounds, lab tables), hostile mobs and combat, tools and non-block items, smelting, redstone, multiplayer, block light propagation (torches, caves), hunger, chalkboards, Book & Quill, and the official Mojang textures (copyrighted; this project ships original procedural textures).

## Controls

| Action | PC | Touch |
| --- | --- | --- |
| Move | WASD | Left joystick |
| Look | Mouse | Drag on the right side |
| Break / place (attack / talk) | Left / right click | Hold / tap |
| Jump / fly | Space / double-tap Space | ⤒ / ✈ |
| Sneak / descend | Shift | ⤓ |
| Hotbar | 1–9, wheel | Tap a slot |
| Inventory | E | ••• |
| Camera / portfolio | C / P | 📷 / 🖼 |
| Commands | / or T | 💬 |
| Pause | Esc | ❚❚ |

## Verification

```bash
npm run typecheck   # tsc -b over all packages
npm test            # Vitest unit tests (engine, textures, input)
npm run e2e         # Playwright: desktop Chrome and Pixel 7 touch emulation
```

The e2e suite plays the real build through the UI: it creates worlds, walks, jumps, flies, breaks and places blocks, uses the inventory and commands, saves and continues a world, and on mobile drives the joystick, look-drag, tap, hold and buttons with real touch events (CDP), including a simultaneous stick and look drag, and again with mouse drags and clicks on the mobile layout. Set `SCREENSHOT_DIR` to keep the screenshots it captures. GitHub runners render with software WebGL at a few frames per second; `SOFTWARE_GL=1 CPU_THROTTLE=4 npm run e2e` approximates that locally.
