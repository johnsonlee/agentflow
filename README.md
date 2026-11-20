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
- A block catalogue with building, nature and Education materials, including glass, wool, bookshelves, glowstone and the Education Edition **Allow**, **Deny** and **Border** blocks
- **Creative** mode (fly with a double jump, instant break, block palette) and **Survival** mode (timed breaking with a crack overlay, drops collected into a 36-slot inventory, health and fall damage, respawn)
- **Crafting:** a 2×2 grid in the survival inventory and a 3×3 grid at a Crafting Table (planks, sticks, crafting table, furnace, wooden, stone, iron, golden and diamond tools in Minecraft's shapes, bookshelf, snow, dyed wool, glowstone; dyes are not modelled and a few legacy recipes substitute blocks (including logs in the bookshelf recipe))
- **Items and tools:** a non-block item registry (sticks; coal, charcoal, iron and gold ingots, diamond; raw and cooked porkchop and chicken; wooden, stone, iron, golden and diamond pickaxe, axe, shovel, sword) with original procedural icons and a durability bar. Tools stack to 1, wear by one use per block (two per hit, except swords), and break when spent. Break time depends on the tool type and tier and on the block's preferred tool (Minecraft hardness ×1.5; ×5 when the block can't be harvested). Stone, cobblestone, bricks and ores drop only with a pickaxe of a high enough tier (coal: wood; iron: stone; gold and diamond: iron). Coal ore drops coal and diamond ore a diamond. Swords do the most melee damage (Bedrock values)
- **Armor:** iron, golden and diamond helmets, chestplates, leggings and boots with shaped recipes, four equipment slots, protection meter and durability. Eligible melee damage is reduced by 4% per armor point (maximum 80%); falls, starvation and the void bypass armor. Equipped and held equipment survives saving. A full bag keeps held items available until they can be returned, including through a recovery panel after reload. Death currently retains equipment and the bag; default death drops, repair, enchanting and selected-Education-version numeric parity remain unimplemented or unverified.
- **Smelting:** a furnace (8 cobblestone) with input, fuel and result slots, a flame gauge and a progress arrow. It smelts one item every 10 s while fuel burns (coal and charcoal 80 s, planks and logs 15 s, stick 5 s), keeps working while closed, and is saved. Recipes: iron and gold ore to ingots, sand to glass, cobblestone to stone, logs to charcoal, raw to cooked meat
- **Hunger and food:** a survival hunger bar (10 drumsticks) with Minecraft's food, saturation and exhaustion rules (sprinting, swimming, jumping, attacking, breaking). Health regenerates at 18+ food, and an empty bar starves you down to half a heart. Hold use (right button, or press-and-hold on touch) with food to eat. Pigs drop raw porkchop and chickens raw chicken
- **Mobs:** pigs, sheep and chickens wander grassland, hop up ledges, panic when hit, and can be defeated (sheep drop wool)
- **Education features:** Camera & Portfolio (capture, caption, save, delete photos); editable NPCs; Allow/Deny/Border; chalkboards; Book & Quill; an Agent with a block-based Code Builder. Chemistry stations include the Element Constructor, Compound Creator, Material Reducer and Lab Table, covering all 118 elements, selected isotopes, 35 compound formulas and selected lab products. These are partial implementations, not full Education Edition parity.
- **Redstone basics:** dust, levers, buttons, pressure plates, redstone torches, lamps, repeaters and wooden/iron doors, with bounded updates and simplified power rules.
- **Lighting and hostile mobs:** propagated block/sky light, torches and zombies with pathfinding and daylight burning.
- Hotbar, inventory screen, middle-click pick block, sneaking (won't walk off edges), sprinting, swimming
- A 20-minute day/night cycle with sun, moon and clouds; underwater fog
- Commands: `/gamemode`, `/time set`, `/tp`, `/give`, `/summon`, `/gamerule doMobSpawning|doDaylightCycle`, `/seed`, `/help`
- Autosaves to `localStorage` (blocks, inventory, NPCs); use **Continue** on the title screen to resume
- Touch controls (Pointer Events, so they also work with a mouse or pen on the mobile layout): a floating joystick, camera drag, tap to place or talk, hold to break, jump/fly/descend buttons, auto-jump, tappable hotbar, and inventory, camera and portfolio buttons

### Not implemented (compared with Minecraft: Education Edition)
Full Education Edition parity remains open. Missing functionality includes the complete Education isotope set and additional chemistry reactions/products, hostile mobs beyond zombies, additional armor materials, additional foods and items (bread, apples, buckets and others), redstone components such as pistons and comparators, multiplayer, and smooth lighting. Chemistry, Code Builder and redstone also have simplified behavior; see the implementation and the limitations recorded in PR #3. Official Education Edition textures are not included: the game still uses original procedural art. Golden and diamond tools now cover the four existing tool kinds; hoes, farming, enchanting and tool repair are not implemented.

The Element Constructor accepts particle counts up to 256, including heavy atoms such as uranium-238 and oganesson-294. Element names and reference isotope masses are checked against NIH PubChem and NIST tables; selected isotope support is not the full Education isotope catalogue. Old element/compound/tool item IDs remain stable as new chemistry entries append to the registry. New compound entries are formula-matching recipes, not additional lab-product effects. The Lab Table ice bomb recipe uses four sodium acetates, as in the Chemistry Lab Journal.

Golden tools use gold ingots and diamond tools use diamonds with the standard tool shapes. Golden pickaxes mine quickly but cannot harvest iron, gold, diamond or redstone ore. Their low durability differs from the longer-lived diamond tools. New items are appended to the registry so saved item IDs remain stable.

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
