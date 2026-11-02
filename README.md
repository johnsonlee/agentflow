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
- Hotbar, inventory screen, middle-click pick block, sneaking (won't walk off edges), sprinting, swimming
- A 20-minute day/night cycle with sun, moon and clouds; underwater fog
- Commands: `/gamemode`, `/time set`, `/tp`, `/give`, `/seed`, `/help`
- Autosaves to `localStorage`; use **Continue** on the title screen to resume
- Touch controls: a floating joystick, camera drag, tap to place, hold to break, jump/fly/descend buttons, auto-jump, tappable hotbar and inventory button

## Controls

| Action | PC | Touch |
| --- | --- | --- |
| Move | WASD | Left joystick |
| Look | Mouse | Drag on the right side |
| Break / place | Left / right click | Hold / tap |
| Jump / fly | Space / double-tap Space | ⤒ / ✈ |
| Sneak / descend | Shift | ⤓ |
| Hotbar | 1–9, wheel | Tap a slot |
| Inventory | E | ••• |
| Commands | / or T | 💬 |
| Pause | Esc | ❚❚ |

## Verification

```bash
npm run typecheck   # tsc -b over all packages
npm test            # Vitest unit tests (engine, textures, input)
npm run e2e         # Playwright: desktop Chrome and Pixel 7 touch emulation
```

The e2e suite plays the real build through the UI: it creates worlds, walks, jumps, flies, breaks and places blocks, uses the inventory and commands, saves and continues a world, and on mobile drives the joystick, look-drag, tap, hold and buttons with real multi-touch events (CDP). Set `SCREENSHOT_DIR` to keep the screenshots it captures.
