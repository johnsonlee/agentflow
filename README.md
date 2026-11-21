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
- **Crafting:** a 2×2 grid in the survival inventory and a 3×3 grid at a Crafting Table (planks, sticks, crafting table, furnace, wooden, stone, iron, golden and diamond tools (including hoes) in Minecraft's shapes, bookshelves made from six oak planks and three books, snow, dyed wool, stained glass and glowstone made from four glowstone dust). Supported dye mixing and flower recipes are included; other acquisition resources and recipes remain incomplete.
- **Items and tools:** a non-block item registry (sticks; coal, charcoal, iron and gold ingots, diamond; raw and cooked porkchop and chicken; wooden, stone, iron, golden and diamond pickaxe, axe, shovel, sword) with original procedural icons and a durability bar. Tools stack to 1, wear by one use per block (two per hit, except swords), and break when spent. Break time depends on the tool type and tier and on the block's preferred tool (Minecraft hardness ×1.5; ×5 when the block can't be harvested). Stone, cobblestone, bricks and ores drop only with a pickaxe of a high enough tier (coal: wood; iron: stone; gold and diamond: iron). Coal ore drops coal and diamond ore a diamond. Swords do the most melee damage (Bedrock values)
- **Ground items:** harvested items, mob loot, removed-furnace contents, manual drops (Q for one, Ctrl+Q for the stack), and Agent drops have persistent world ownership. Nearby players pick up what fits; overflow stays on the ground. Books, worn tools and armor keep their metadata through transfer and saving. Item physics, merging and loaded-world ageing use application models; native fire/liquid and complete lifecycle parity remain open.
- **Armor:** iron, golden and diamond helmets, chestplates, leggings and boots with shaped recipes, four equipment slots, protection meter and durability. Eligible melee damage is reduced by 4% per armor point (maximum 80%); falls, starvation and the void bypass armor. Equipped and held equipment survives saving. A full bag keeps held items available until they can be returned, including through a recovery panel after reload. By default, death transfers the bag, surviving worn equipment and pending inventory cells to ground items once; refused transfers remain recoverable. `/gamerule keepInventory true` retains those possessions instead. Health and pending/completed death state survive reload. Repair, enchanting and complete Education-version numeric parity remain unimplemented or unverified.
- **Smelting:** a furnace (8 cobblestone) with input, fuel and result slots, a flame gauge and a progress arrow. It smelts one item every 10 s while fuel burns (coal and charcoal 80 s, planks and logs 15 s, stick 5 s), keeps working while closed, and is saved. Recipes: iron and gold ore to ingots, sand to glass, cobblestone to stone, logs to charcoal, raw to cooked meat
- **Farming:** craft five material hoes, till dirt/grass, plant wheat seeds on farmland, irrigate within four blocks, grow eight crop stages, harvest wheat/seeds, craft three wheat into bread and hold use to eat. Super fertilizer matures wheat. Soil/crop states and a seeded growth scheduler persist through saves; only loaded farms simulate. Harvest overflow and removed-furnace contents become ground items, including Agent destruction. A refused ground-item transfer leaves its original owner intact. Growth timing, random drops, selection boxes and trampling retain documented differences from Education.
- **Hunger and food:** a survival hunger bar (10 drumsticks) with Minecraft's food, saturation and exhaustion rules (sprinting, swimming, jumping, attacking, breaking). Health regenerates at 18+ food, and an empty bar starves you down to half a heart. Hold use (right button, or press-and-hold on touch) with food to eat. Pigs drop raw porkchop and chickens raw chicken
- **Mobs:** pigs, sheep and chickens wander grassland, hop up ledges, panic when hit, and can be defeated (sheep drop wool). These mobs, zombies and NPCs keep stable identities and supported actor state across saves. Cached pending death loot remains owned if transfer to ground items fails.
- **Education features:** Camera & Portfolio (capture, caption, save, delete photos); editable NPCs; Allow/Deny/Border; chalkboards; Book & Quill; an Agent with a block-based Code Builder. Chemistry stations include the Element Constructor, Compound Creator, Material Reducer and Lab Table, covering all 118 elements, the 411 neutral combinations documented in the official 2018 guide plus eight retained scientific combinations, and 35 compound formulas and selected lab products. Blue, red, purple and green torches craft with the corresponding chloride directly above a torch; underwater torches craft with magnesium above a torch. These are partial implementations, not full Education Edition parity.
- **Redstone basics:** dust, levers, buttons, pressure plates, redstone torches, lamps, repeaters and wooden/iron doors, with bounded updates and simplified power rules.
- **Lighting and hostile mobs:** propagated block/sky light, torches and zombies with pathfinding and daylight burning.
- Hotbar, inventory screen, middle-click pick block, sneaking (won't walk off edges), sprinting, swimming
- A 20-minute day/night cycle with sun, moon and clouds; underwater fog
- Commands: `/gamemode`, `/time set`, `/tp`, `/give`, `/summon`, `/gamerule doMobSpawning|doDaylightCycle|keepInventory`, `/seed`, `/help`
- Autosaves to `localStorage` (world edits, inventory/equipment, supported actor state, ground items and player death state); use **Continue** on the title screen to resume. Damaged ownership records block overwriting the original save and expose a backup download.
- Touch controls (Pointer Events, so they also work with a mouse or pen on the mobile layout): a floating joystick, camera drag, tap to place or talk, hold to break, jump/fly/descend buttons, auto-jump, tappable hotbar, and inventory, camera and portfolio buttons

### Not implemented (compared with Minecraft: Education Edition)
Full Education Edition parity remains open. Missing functionality includes current-client isotope/output/ion equivalence and additional chemistry reactions/products, hostile mobs beyond zombies, additional armor materials, additional foods and items (apples, buckets and others), redstone components such as pistons and comparators, multiplayer, and smooth lighting. Chemistry, Code Builder and redstone also have simplified behavior; see the implementation and the limitations recorded in PR #3. Official Education Edition textures are not included: the game still uses original procedural art. Golden and diamond tools now cover the four existing tool kinds; additional crops, trampling, enchanting and tool repair are not implemented.

The Element Constructor accepts particle counts up to 256, including heavy atoms such as uranium-238 and oganesson-294. Element names and reference isotope masses are checked against NIH PubChem and NIST tables; The official 2018 guide supplies 411 supported neutral combinations; eight previously supported scientific combinations remain for compatibility. This does not prove current-client ion or output-identity behavior. Old element/compound/tool item IDs remain stable as new chemistry entries append to the registry. New compound entries are formula-matching recipes, not additional lab-product effects. The Lab Table ice bomb recipe uses four sodium acetates, as in the Chemistry Lab Journal.

Golden tools use gold ingots and diamond tools use diamonds with the standard tool shapes. Golden pickaxes mine quickly but cannot harvest iron, gold, diamond or redstone ore. Their low durability differs from the longer-lived diamond tools. New items are appended to the registry so saved item IDs remain stable.

## Local texture packs

On the title screen, open **Resource Packs**, import a compatible JSON file, review its preview and coverage, then choose **Use pack**. Missing tiles keep the original artwork. **Use original textures** restores the default. Changes apply to the next opened world; the local selection survives browser reload in separate IndexedDB storage. Importing or resetting does not rewrite world saves or Portfolio photos. Packs stay in this browser and are not embedded in world backup downloads.

This application format accepts explicit texture keys with square 16×16 or 32×32 RGBA pixels, up to 8 MiB per file. A mixed pack uses 32-pixel atlas cells and expands 16-pixel sources by nearest-neighbor 2×; original source pixels and content hashes remain available in pack details and diagnostics. Standard Minecraft ZIP/`.mcpack` files and automatic native-pack selection are not supported. The importer supplies no Education artwork or proof of native rendering equivalence.

To prepare a file from your own PNGs, use the optional Python/Pillow converter. Create a mapping beside the images, for example `mapping.json`:

```json
{
  "version": 1,
  "name": "My artwork",
  "tiles": [
    { "key": "stone", "path": "stone.png" },
    { "key": "item_iron_ingot", "path": "iron-ingot.png" }
  ]
}
```

Paths resolve relative to the mapping file. The converter preserves decoded RGBA values without resizing or choosing animation frames. It rejects duplicate keys, unsupported images and malformed records, and refuses to overwrite output files. The app validates every key when importing; optional `--keys-json keys.json` also checks a provided JSON array of supported keys during conversion.

```bash
python3 -m venv .venv-textures
.venv-textures/bin/python -m pip install Pillow
.venv-textures/bin/python tools/build-local-texture-pack.py \
  --manifest /path/to/mapping.json \
  --output /path/to/my-textures.json \
  --report /path/to/my-textures-report.json
```

Import `my-textures.json` in the browser. The separate report records source-file hashes, decoded tile dimensions/RGBA hashes and the generated pack hash; it is not the file to import. With npm dependencies and Pillow installed, run the converter checks with `.venv-textures/bin/python -m unittest discover -s tools -p test_build_local_texture_pack.py`. Sixteen-bit PNG channels and animated PNGs are rejected instead of silently downsampled or selecting a frame.

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

The e2e suite plays the real build through the UI: it creates worlds, walks, jumps, flies, breaks and places blocks, uses the inventory and commands, saves and continues a world, and on mobile drives the joystick, look-drag, tap, hold and buttons with real touch events (CDP), including a simultaneous stick and look drag, and again with mouse drags and clicks on the mobile layout. Set `SCREENSHOT_DIR` to keep the screenshots it captures. `SOFTWARE_GL=1 npm run e2e` exercises software WebGL correctness locally; `CPU_THROTTLE` can additionally slow browser execution. These runs do not establish equivalence to a particular CI runner or serve as performance acceptance.

Colored-torch chloride/color mappings and vertical crafting shapes follow the official Chemistry Lab Journal, printed page 9. Four original colored flames use the existing upright torch renderer and scalar light level 14; this does not establish exact Education assets, animated particles or attachment orientation. Underwater torch item IDs and placed-block mappings remain compatible, while its former Lab Table recipe is removed in favor of the documented crafting-table route.

The Compound Creator now labels NaClO as **Sodium Hypochlorite**, retaining its old saved ID and formula. The Lab Table combines three water compounds with three sodium hypochlorites into a distinct **Bleach** product. Crafting bleach with any of the seven existing colored wools produces white wool; the raw compound cannot substitute. Old NaClO stock remains NaClO after loading, while `/give bleach` now names the actual manufactured product. Carpets, beds, banners and their bleaching routes remain unimplemented.

The official `Minecraft_Elements.pdf` catalogue is pinned by URL and SHA256 in the engine. Its 70 previously missing isotope entries append after all 449 existing items; old element/default masses and saved atom identities remain unchanged. Owned element/isotope lookup shows the actual stored particle metadata and preserves the stack through close/autosave/pagehide recovery. The Compound Creator accepts isotopes by atomic number (including isotopic water and benzene) while producing the existing generic compound items. Guide highlights are not treated as a default-migration instruction; isotope inventory representation and element-block world placement remain distinct current-client parity questions.

Generic element items now place as solid world cubes for all 118 elements; Unknown Element is also available as a creative block. Their high world IDs (32768–32886) occupy a separate namespace, while all existing block/item IDs and atom reference metadata remain intact. Chunk blocks and mesher padding use `Uint16Array`; light remains byte-packed. The compact block registry uses ID lookup maps, and saves keep schema 1 integer edits without item renumbering. Pick/drop and Agent operations return the existing canonical base-element items. Distinct isotope inventory items remain nonplaceable while current-client isotope/NBT behavior is unresolved. Cube hardness/appearance are current app defaults, not exact Education client evidence.

Agent teleporting checks nearby two-cell clearance, tolerates fractional feet at the ground boundary and refuses without moving the Agent when no safe adjacent space exists. Existing inventory and facing state are preserved on refusal.
