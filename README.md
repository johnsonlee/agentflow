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

## Source organization

Source implementations are grouped by responsibility. Package consumers keep using `@craft/engine`, `@craft/input` and `@craft/textures` through their existing `src/index.ts` entry points.

| Source tree | Responsibility folders |
| --- | --- |
| `packages/engine/src` | `core` (shared math, random and IDs), `catalog` (block/item/texture registries), `world` (chunks, generation, light, time and rules), `simulation` (physics, actors and gameplay systems), `ownership` (inventory, stacks and world-owned products), `crafting` (recipes, chemistry and lab effects), `persistence` (save validation and mob snapshots), `automation` (Agent, commands and Code Builder), `education` (chalkboard data), `rendering` (chunk meshing) |
| `packages/input/src` | `contracts` (device-independent actions) and `devices` (keyboard/mouse, touch and joystick calculations) |
| `packages/textures/src` | `atlas` (packing and pixel primitives), `artwork` (procedural tile families) and `resource-packs` (local pack validation) |
| `apps/web/src` | `application` (startup and game orchestration), `rendering` (Three.js views and models), `simulation` (mob management and habitat queries), `ui` (screens, HUD, icons and styles) and `persistence` (local resource-pack selection) |

## Features

- An infinite, seeded world with plains, forest, desert, snowy and ocean biomes, oak and birch trees, flowers, ores and bedrock
- A block catalogue with building, nature and Education materials, including glass, wool, bookshelves, glowstone and the Education Edition **Allow**, **Deny** and **Border** blocks
- **Creative** mode (fly with a double jump, instant break, block palette) and **Survival** mode (timed breaking with a crack overlay, drops collected into a 36-slot inventory, health and fall damage, respawn)
- **Crafting:** a 2×2 grid in the survival inventory and a 3×3 grid at a Crafting Table (planks, sticks, crafting table, furnace, wooden, stone, iron, golden and diamond tools (including hoes) in Minecraft's shapes, bookshelves made from six oak planks and three books, oak fences made from four oak planks and two sticks, the selected modern lead recipe from five strings, snow blocks made from four snowballs, white wool made from four strings, dyed wool, stained glass and glowstone made from four glowstone dust). Supported dye mixing and flower recipes are included; other acquisition resources and recipes remain incomplete.
- **Items and tools:** a non-block item registry (sticks; coal, charcoal, iron and gold ingots, diamond; raw and cooked porkchop and chicken; wooden, stone, iron, golden and diamond pickaxe, axe, shovel, sword) with original procedural icons and a durability bar. Tools stack to 1, wear by one use per block (two per hit, except swords), and break when spent. Break time depends on the tool type and tier and on the block's preferred tool (Minecraft hardness ×1.5; ×5 when the block can't be harvested). Stone, cobblestone, bricks and ores drop only with a pickaxe of a high enough tier (coal: wood; iron: stone; gold and diamond: iron). Coal ore drops coal and diamond ore a diamond. Swords do the most melee damage (Bedrock values)
- **Snowball materials:** survival snow-block harvesting requires a shovel and yields four snowballs in this application; hand and other tools yield none. Snowballs stack to 16, can craft one snow block from four, and reduce to hydrogen stacks of 64 and 3 plus oxygen 33. Crafting and reduction match the retained Education recipe snapshots; harvest count and stack limit still need direct current-client confirmation. Snowballs can be thrown by use/tap into empty sky or at blocks and ordinary mobs. The application models launch speed30blocks/s and gravity12blocks/s² from a20Hz interpretation of native JSON power1.5/gravity0.03; runtime equivalence, water/air drag and unknown knockback remain unverified. Swept collision removes the projectile on the first wall or mob contact without reducing supported mobs’ health; Blaze is absent. Active flight is saved and pauses with menus/death or unloaded terrain; damaged flight records protect the original save. Lifetime10seconds, cap128, cooldown0.25seconds and visual particles are application choices. Snow layers and snow golems are not implemented. The icon is original procedural artwork.
- **Ground items:** harvested items, mob loot, removed-furnace contents, manual drops (Q for one, Ctrl+Q for the stack), and Agent drops have persistent world ownership. Nearby players pick up what fits; overflow stays on the ground. Books, worn tools and armor keep their metadata through transfer and saving. Item physics, merging and loaded-world ageing use application models; native fire/liquid and complete lifecycle parity remain open.
- **Armor:** iron, golden and diamond helmets, chestplates, leggings and boots with shaped recipes, four equipment slots, protection meter and durability. Eligible melee damage is reduced by 4% per armor point (maximum 80%); falls, starvation and the void bypass armor. Equipped and held equipment survives saving. A full bag keeps held items available until they can be returned, including through a recovery panel after reload. By default, death transfers the bag, surviving worn equipment and pending inventory cells to ground items once; refused transfers remain recoverable. `/gamerule keepInventory true` retains those possessions instead. Health and pending/completed death state survive reload. Repair, enchanting and complete Education-version numeric parity remain unimplemented or unverified.
- **Smelting:** a furnace (8 cobblestone) with input, fuel and result slots, a flame gauge and a progress arrow. It smelts one item every 10 s while fuel burns (coal and charcoal 80 s, planks and logs 15 s, stick 5 s), keeps working while closed, and is saved. Recipes: iron and gold ore to ingots, sand to glass, cobblestone to stone, logs to charcoal, raw to cooked meat
- **Farming:** craft five material hoes, till dirt/grass, plant wheat seeds on farmland, irrigate within four blocks, grow eight crop stages, harvest wheat/seeds, craft three wheat into bread and hold use to eat. Super fertilizer matures wheat. Soil/crop states and a seeded growth scheduler persist through saves; only loaded farms simulate. Harvest overflow and removed-furnace contents become ground items, including Agent destruction. A refused ground-item transfer leaves its original owner intact. Growth timing, random drops, selection boxes and trampling retain documented differences from Education.
- **Lab product use:** Super Fertilizer and Ice Bomb effects publish their loaded world changes together with the captured held-product debit before block-change observers run. No-op/refused uses consume nothing and Creative retains the product. A later failed browser save keeps the coherent in-memory world and inventory available for retry; using a product does not require a new immediate checkpoint. Crop and freezing effects remain application models; native Education calibration, other Bone Meal effects and Agent product-use remain incomplete.
- **Cane growth:** loaded, supported Sugar Cane columns can grow back one segment at a time up to the existing three-segment app cap. A separate seeded scheduler processes at most 256 loaded root opportunities per simulation second, rotating through deferred roots. Each processed opportunity has a 1/30 growth chance; dense areas can wait longer. This cadence is an explicit application model, not calibrated Education timing. Its clock is saved per realm, pauses with the world, and does not grant offline or inactive-realm growth. Unknown/unloaded support, occupied targets and active world leases refuse growth. Corrupt stored growth clocks preserve the original save and require a backup/repair before writing. The Bone Meal effect below leaves this natural-growth clock unchanged.
- **Bone and Bone Meal:** distinct ingredients from White Dye and Super Fertilizer. One Bone crafts into three Bone Meal; one Bone Meal crafts into one White Dye, with no reverse dye-to-meal recipe. Nine retained primary-source dye mixes also consume Bone Meal directly, producing gray, light blue, light gray, lime, magenta or pink with their declared ingredient multiplicities and output counts. Using Bone Meal on any segment of a loaded, supported Sugar Cane column adds contiguous free stems up to the existing three-stem application cap. A partial obstruction can permit fewer stems; at least one added stem consumes one Meal in Survival. Fully grown, blocked, unsupported, unknown or denied targets consume nothing, and Creative preserves the source. World changes and the original held-product debit publish before observers; a later failed save retains coherent RAM for retry. Malformed raw Bone/Meal owners preserve the original save, block writes and item actions, and remain available in an exact original backup. The Cane effect and partial-obstruction policy are not calibrated Education behavior. Both icons are original procedural artwork. Natural Survival acquisition, Skeleton/Composter/Bone Block routes and other Bone Meal plant effects remain unimplemented; preowned test materials do not establish an acquisition loop.
- **Hunger and food:** a survival hunger bar (10 drumsticks) with Minecraft's food, saturation and exhaustion rules (sprinting, swimming, jumping, attacking, breaking). Health regenerates at 18+ food, and an empty bar starves you down to half a heart. Hold use (right button, or press-and-hold on touch) with food to eat. Pigs drop raw porkchop and chickens raw chicken
- **Mobs:** pigs, sheep and chickens wander grassland, hop up ledges, panic when hit, and can be defeated (sheep drop wool). Summon-only spiders add a wide, low body and an original eight-leg model. They are neutral in bright light until hit, pursue in darkness, and can drop zero to two strings. A fixed ten-second provocation timer persists through saving; light normalization, movement and combat are application models. Climbing, leaping, natural spider spawning, conditional eyes and looting remain incomplete. These mobs, zombies and NPCs keep stable identities and supported actor state across saves. Cached pending death loot remains owned if transfer to ground items fails.
- **Education features:** Camera & Portfolio (capture, caption, save, delete photos); editable NPCs; Allow/Deny/Border; chalkboards; Book & Quill; an Agent with a block-based Code Builder. Chemistry stations include the Element Constructor, Compound Creator, Material Reducer and Lab Table, covering all 118 elements, the 411 neutral combinations documented in the official 2018 guide plus eight retained scientific combinations, and 35 compound formulas and selected lab products. Blue, red, purple and green torches craft with the corresponding chloride directly above a torch; underwater torches craft with magnesium above a torch. These are partial implementations, not full Education Edition parity.
- **Agent block decisions:** in Code Builder, `if` and `repeat until` can choose “any solid block” (the existing behavior) or a specific application block name. Specific matching distinguishes physical states such as Hay orientations and crop ages; it is not a native block-ID/data API. Named conditions read only loaded target cells and stop with a message when the target is unavailable. For example, a program can branch differently for Diamond Ore and Stone, following the teaching pattern in [MakeCode’s All Mine lesson](https://minecraft.makecode.com/courses/csintro/conditionals/activity-3). Old program JSON remains valid. Invalid saved programs preserve the original save for backup and block code execution and saving until repaired. This is a custom block editor, with no JavaScript/Python text parser or native MakeCode integration.

- **Redstone basics:** dust, levers, buttons, pressure plates, redstone torches, lamps, repeaters and wooden/iron doors, with bounded updates and simplified power rules.
- **Oak fences:** connected posts and rails, shape-aware selection, and a 1.5-block collision barrier. Connections to other oak fences and opaque full cubes use an application model; native connection, collision and hardness calibration remains unverified. Fences can be crafted, placed, harvested and saved; gates remain incomplete.
- **Leads:** use a held lead on a pig, sheep or chicken, use a fence to tie player-held leads, or use an empty hand to release them. Links own one consumed lead, survive saving, and refund through ground items; a full bag leaves the refund on the ground. Animal death and fence destruction combine their drops with lead refunds before removing the source. Links remain world-owned through player death. Creative attachment copies one unit. Horizontal following, distances, stack size and gestures are application models; vertical hanging and native calibration remain unverified. The selected five-string recipe differs from older retained slime recipes.
- **Lighting and hostile mobs:** propagated block/sky light, torches and zombies with pathfinding and daylight burning.
- Hotbar, inventory screen, middle-click pick block, sneaking (won't walk off edges), sprinting, swimming
- A 20-minute day/night cycle with sun, moon and clouds; underwater fog
- **Squid and Ink Sacs (bounded model):** adult squid swim through loaded water with three-dimensional collision and lose air on land. Natural encounters are restricted to eligible loaded ocean water; the command first searches nearby loaded water and otherwise requires safe supported dry space. Genuine unenchanted deaths create one to three Ink Sacs through the same cached ground-loot ownership path as other mobs. Ink can supply the existing Black Dye and Book and Quill recipes; the qualified legacy coal shortcut remains unchanged. Health10 and breath15 are source-backed; the selected adult body variant, steering, speeds, dry damage and spawning schedule remain application choices rather than active Education calibration. The model and its eight tentacles are original artwork.
- Commands: `/gamemode`, `/time set`, `/tp`, `/give`, `/summon`, `/gamerule doMobSpawning|doDaylightCycle|keepInventory`, `/seed`, `/help`
- Autosaves to `localStorage` (world edits, inventory/equipment, supported actor state, ground items and player death state); use **Continue** on the title screen to resume. Damaged ownership records block overwriting the original save and expose a backup download.
- Touch controls (Pointer Events, so they also work with a mouse or pen on the mobile layout): a floating joystick, camera drag, tap to place or talk, hold to break, jump/fly/descend buttons, auto-jump, tappable hotbar, and inventory, camera and portfolio buttons. The five top buttons also accept an in-bounds second-finger release while the view finger stays held; cancelled or dragged-out secondary presses do not activate them. Primary touch, mouse and keyboard retain completed-click activation to avoid opening a modal beneath an unfinished gesture.

### Not implemented (compared with Minecraft: Education Edition)
Full Education Edition parity remains open. Missing functionality includes current-client isotope/output/ion equivalence and additional chemistry reactions/products, additional hostile mobs and complete spider behavior, additional armor materials, additional foods and items (apples and others), redstone components such as pistons and comparators, multiplayer, and smooth lighting. Chemistry, Code Builder and redstone also have simplified behavior; see the implementation and the limitations recorded in PR #3. Official Education Edition textures are not included: the game still uses original procedural art. Golden and diamond tools now cover the four existing tool kinds; additional crops, trampling, enchanting and tool repair are not implemented.

The Element Constructor accepts particle counts up to 256, including heavy atoms such as uranium-238 and oganesson-294. Element names and reference isotope masses are checked against NIH PubChem and NIST tables; The official 2018 guide supplies 411 supported neutral combinations; eight previously supported scientific combinations remain for compatibility. This does not prove current-client ion or output-identity behavior. Old element/compound/tool item IDs remain stable as new chemistry entries append to the registry. New compound entries are formula-matching recipes, not additional lab-product effects. The Lab Table ice bomb recipe uses four sodium acetates, as in the Chemistry Lab Journal.

Golden tools use gold ingots and diamond tools use diamonds with the standard tool shapes. Golden pickaxes mine quickly but cannot harvest iron, gold, diamond or redstone ore. Their low durability differs from the longer-lived diamond tools. New items are appended to the registry so saved item IDs remain stable.

Thirteen additional glow-stick color items can be crafted alongside the existing green identity: red, brown, blue, purple, cyan, gray, pink, lime, yellow, light blue, magenta, orange and white. The retained Education catalog has fourteen total variants; black and light gray are placeholder entries, so they have no product recipe. Each matching-dye recipe uses six polyethylene, one hydrogen peroxide and one luminol in the Chemistry Lab Journal grid. One output per craft and a stack bound of64 remain application choices, not verified current-client quantities. Freshly crafted or granted sticks begin ready to shake. Use a selected stick in the air or press Shake to activate one unit; the selected active stick stays separate from its inactive remainder, and a full bag refuses the split without changing any owner. A single stick can activate in a full bag. Bag, work areas, Agent, ground drops and saves preserve the state. This is an untimed application model: native lifetime, active NBT, durability and illumination are unverified. Sticks with explicit activation state cannot be placed. Saved green items without that state retain their old placement and permanent light behavior; green held light remains a compatibility behavior. Neither green light nor the original icons establish native Education parity. No additional color light blocks were introduced.

Sparklers have five application identities: orange (calcium chloride), blue (cerium chloride), red (mercuric chloride), purple (potassium chloride) and green (tungsten chloride). Craft the corresponding chloride above magnesium above a stick at a crafting table. The color pairs, vertical recipe and offhand use follow the Chemistry Lab Journal; one output per craft is an application choice. The optional offhand currently accepts Sparklers. Move a Sparkler there through the inventory cell or swap action, then use Light offhand; a selected Sparkler has its own Light action. Lighting activates one unit and keeps an inactive remainder in the bag, refusing atomically when it needs room. This is an untimed application state with original inactive/lit icons and cosmetic sparks. Native ignition, burn lifetime, consumption, illumination, damage, particle calibration and the full offhand item matrix remain unverified. Transfers and saves preserve the activation state; malformed saved owners protect the original save for recovery.

Glass and water bottles form a bounded Overworld brewing prerequisite. Gather sand, smelt it into glass with existing furnace fuel, then craft three empty bottles from the V-shaped glass recipe. Use an empty bottle on reachable water to fill one: the final empty bottle becomes the selected water bottle, while a larger empty stack keeps its selected remainder and reserves a separate bag slot for the filled bottle. A full bag refuses that split without consuming an empty bottle or changing the water. Existing closer actors and solid obstructions keep their interaction priority. Empty64 and water1 stack limits, finite container handling in both modes, and non-consuming use of the single water-block identity are application choices; native slot placement, creative behavior and source-versus-flowing equivalence are unverified. Whole containers retain their identities through transfers, drops, death and saves, and malformed saved bottle owners protect the original save. The two icons are original procedural artwork. Hold use with a filled bottle to drink: the application waits1.6seconds, then replaces exactly one selected water bottle with an empty bottle, including in a full bag or at full hunger. Drinking itself changes neither food, health nor status effects and does not cure Poison. Release, selection or owner changes, menus, recovery, mode changes, death and reload cancel partial progress; it is not saved. A new use action is needed to refill the returned bottle. These drinking and container-return rules remain application choices pending current Education runtime confirmation. Cauldrons, brewing, crafted medicines and other water-bottle block interactions remain unimplemented.

Gravel can supply Flint as a bounded ignition-material prerequisite. Break genuine gravel, including the generated deep-ocean deposits, to receive one Flint or one Gravel, never both. The current unenchanted chance is10%, an application choice supported only by the sourced Gravel-to-Flint relation, not verified Education probability. Player and Agent attempts share the first decision for the same physical block: a refused item transfer leaves the block and tool unchanged, and a retry or cold save retains that decision. Removing and replacing the source starts a new decision. Damaged saved decisions protect the original save and expose a backup export. Flint uses an original procedural icon. Portal/Nether acquisition, enchantment-dependent drops and native gravel gravity remain unimplemented; owning Flint does not claim those features.


Flint and Steel is a separate main-hand use tool, crafted shapelessly from one Iron Ingot and one Flint in either existing crafting grid. Its application durability is64 successful Survival ignitions; ordinary mining and melee do not wear it. Use the top of a solid opaque support to create visible, noncolliding Fire in loaded air. Invalid owners, denied building, occupied targets and unsupported faces refuse without wear. Fire cannot be obtained as an inventory item: manual or Agent extinguishing produces no loot or mining-tool wear. This bounded model uses light15, a15-second loaded active lifetime, at most256 fires, and one health point per accumulated second of Survival body contact, bypassing armor without wearing it. Overlapping flames do not multiply contact damage. Menus, death, recovery and unloaded cells pause their supported simulation; saved lifetime and contact progress resume rather than restarting. Support removal, water replacement, expiry and actual left-click/touch extinguishing remove Fire. Worn tool metadata and Fire state use the existing ownership/save paths; malformed raw data preserves the original for backup and prevents overwrite. Offhand ignition, fire spread, flammability, lingering burning, mob/item burning, rain, eternal fires, portals and Nether remain unimplemented. These numerical and interaction rules are application choices, not calibrated Education Fire equivalence. Both new sprites are original static artwork.

Adult Cows and milk provide a bounded Overworld Poison cure. Smelt iron and craft an empty bucket from three ingots in a V shape, then use it on a reachable live adult Cow. The last empty bucket becomes selected milk; a larger empty stack retains its remainder and reserves a separate bag slot, refusing without changes if no room remains. Hold use for1.6seconds to exchange one selected milk bucket for an empty bucket and clear supported status effects (currently Poison), including at full hunger. Milk does not directly heal or feed the player. Partial drinking cancels under the same ownership, input and menu rules as water. Cow health10 and body.9×1.3 follow retained reference data; natural loaded-grass encounters, herd scheduling, movement, finite Creative containers, stack16/1, drink duration, return placement and inexhaustible milking remain application choices. Cows can supply cached Leather0–2 and Raw Beef1–3 through the existing ground-loot path; raw beef can be smelted into cooked beef. Supported adult state, loot and bucket ownership persist, while malformed saved Cow or bucket data protects the original save for recovery. Babies, breeding, climate variants and full native Cow behavior remain unimplemented. The Cow model and five item icons are original procedural art, not Education textures.

Spider Eyes are a bounded prerequisite for later brewing and medicine work. An unenchanted player kill of a Spider can roll zero or one Eye alongside the existing String roll; Agent and environmental kills do not qualify in this application. The first pending roll and its cause survive a refused ground transfer and saving, so a retry cannot reroll the reward. Hold use to eat when hungry: one Eye, hunger and Poison commit together. Poison pauses with menus, protects damaged saves from overwrite and restores its remaining time and tick phase without offline progress. Death and respawn clear it, including with keepInventory. The current model uses nutrition2, saturation3.2, duration5seconds and one health point every1.25seconds down to a floor of1; damage bypasses armor and melee invulnerability, and creative mode only advances the timer. Re-eating refreshes the duration without resetting the tick phase. Microsoft’s Bedrock item example supports nutrition2 and duration5, while the older Minecraft inventory article describes4seconds; these timing, saturation, damage and Agent-eligibility choices are not verified current Education runtime parity. The icon is original procedural art. Brewing, Spider Eye potions, Antidote and the full medicine acquisition chain remain unimplemented.

Balloons have sixteen application color identities and original icons. Each 3×3 recipe uses six Latex, the matching dye, canonical Helium and an ordinary Lead (`lead_rope`, not chemical Pb). One balloon per craft and stack64 are application choices; native aux-color mapping and isotope acceptance remain unverified. Use one on a pig, sheep, chicken, adult Cow or oak fence. Attached products persist with their target and remain world-owned through player death and mode changes. Aim at the balloon with an empty hand and use to detach it into one dropped item, or attack it to pop the whole product without item/Lead refunds. Mob death and fence destruction conserve intact products in the same batch as ordinary loot and separate Leads; a refusing receiver keeps the sources. These retrieval/destruction policies are application rules, not verified native refund behavior.

Balloon lift uses a capped spring/drag model and ordinary actor/block collision. Its world-unit constants are explicit application dynamics, not a conversion or measurement of the native lift vector. Unknown terrain suspends motion without aging or silently losing ownership. Native free flight, arrow-specific popping, all target types and exact lifetime/dynamics remain open.

## Local texture packs

On the title screen, open **Resource Packs**, import a compatible JSON file, review its preview and coverage, then choose **Use pack**. Missing tiles keep the original artwork. **Use original textures** restores the default. Changes apply to the next opened world; the local selection survives browser reload in separate IndexedDB storage. Importing or resetting does not rewrite world saves or Portfolio photos. Packs stay in this browser and are not embedded in world backup downloads.

This application format accepts explicit texture keys with square 16×16 or 32×32 RGBA pixels, up to 8 MiB per file. A mixed pack uses 32-pixel atlas cells and expands 16-pixel sources by nearest-neighbor 2×; original source pixels and content hashes remain available in pack details and diagnostics. Standard Minecraft ZIP/`.mcpack` files and automatic native-pack selection are not supported. The importer supplies no Education artwork or proof of native rendering equivalence.

The four chemistry stations have separate top and bottom keys:

| Station | Top | Bottom |
| --- | --- | --- |
| Element Constructor | `element_constructor_top` | `element_constructor_bottom` |
| Compound Creator | `compound_creator_top` | `compound_creator_bottom` |
| Material Reducer | `material_reducer_top` | `material_reducer_bottom` |
| Lab Table | `lab_table_top` | `lab_table_bottom` |

An older pack containing `chem_station_top` also supplies these eight faces. A dedicated key takes priority over that shared image, including when the two images have different source sizes. Pack details distinguish supplied images from the texture slots they replace: one shared image covers nine slots, including its retained legacy slot. Without overrides, the eight faces keep the original shared artwork. Horizontal side bindings are unchanged.

For package consumers, `allAtlasTextureNames()` from `@craft/engine` supplies the complete supported key list in stable atlas order. New keys append to the catalog; retired keys remain available to older local packs.

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

#### Bounded Agent text compiler (engine only)

`compileAgentText(text, "javascript" | "python", { name, trigger })` parses a small
text subset into the existing validated `CodeProgram`. It never evaluates text,
imports code, dispatches commands, grants items, or saves source. The host supplies
and validates the program name and run/chat trigger. Full JavaScript/Python,
MakeCode projects, chat callback wrappers, functions, variables and expressions
are unsupported. The Code Builder conversion panel creates new block programs from this subset;
original code drafts stay in the open game session and are not persisted. It is
a conversion form, not a full language IDE.

Supported body-only JavaScript statements are `agent.move(FORWARD, 3)`,
`agent.turn(LEFT_TURN)` / `RIGHT_TURN`, `agent.place(DOWN)`, `agent.destroy(UP)` and
`agent.setSlot(1)`. Python uses the same move/place/destroy names,
`agent.turn(TurnDirection.LEFT)` / `.RIGHT`, and `agent.set_slot(1)`. Directions are
`FORWARD`, `BACK`, `LEFT`, `RIGHT`, `UP`, `DOWN`. Movement counts are decimal literals
0–100; slots 1–27 map to the existing zero-based slots. Each move becomes a bounded
sequence of ordinary commands, preserving the existing runner and ownership rules.

Finite loops accept `for (let i = 0; i < 4; i++) { ... }` (also `<= 3`) or Python
`for i in range(4):` with exactly four-space indentation. Active nested counters
must have distinct names, cannot shadow API bindings/direction or turn constants,
and cannot use language keywords (including contextual/future-reserved words in
this strict subset). They cannot be read in body expressions. Repeat counts
are 0–100. Commands and loop/if headers occupy one line; JavaScript can separate
commands with semicolons. Line comments use `//` or Python `#`. Block comments,
Python tabs, continuations, imports, `setItem`/`set_item`, teleport and assist
commands are refused. Unsupported code anywhere, including an unreachable loop
body or a trailing statement, refuses the whole compilation without a partial AST.

`if (agent.detect(AgentDetection.Block, FORWARD)) { ... } else { ... }` or Python
`if agent.detect(AgentDetection.BLOCK, FORWARD):` uses this application's **any solid
block** predicate. Native MakeCode describes different detection semantics; this
is not native API parity. The separate application extension
`agent.blockIs("stone", UP)` / Python `agent.block_is("stone", UP)` compares exact
application catalogue names, including physical orientation states. It never
accepts native block IDs/data or treats an unloaded target as Air.

The scanner/parser limits source to 16,384 actual UTF-8 bytes, 4,096 tokens, four
nesting levels and 2,000 generated AST nodes. Existing runtime work limits still
apply after compilation. Diagnostics contain one-based line/UTF-16 column and an
exclusive end-column range. Strings are plain quoted exact block names without
escapes. NUL is refused even inside a comment; identifiers are ASCII. The syntax is informed by the official [JavaScript Agent Build guide](https://minecraft.makecode.com/tutorials/agent-build)
and [Python guide](https://minecraft.makecode.com/tutorials/python/agent-build);
unsupported native setup, inventory grants and callback wrappers in those examples
are not silently accepted. This bounded compiler does not establish full language,
Education, IDE, account, classroom, graphics or performance equivalence.

Code Builder → **Create program from code** opens a conversion form. Choose the
JavaScript or Python subset, enter a new name and body-only snippet, then choose
**Create block program**. Successful conversion adds a new program and selects its
blocks; **Run** is a separate action. Existing programs remain available. Compile
errors, empty/zero-action snippets, cancellation, and invalid pending block work
do not save or replace programs. Diagnostics show the line and column and select
the source range. A current invalid block program must be repaired first.

Each language keeps its code/name draft and the selected language with this world,
including invalid or unsupported code that needs repair. World saves, backups and
cold reload retain this text separately from block programs; loading it never
compiles or runs it. Diagnostic messages remain session-only. Application storage
limits are 64 KiB of UTF-8 per source, 4 KiB per draft name and 1 MiB per envelope;
the converter still accepts at most 16 KiB. Oversized input remains visible and is
never truncated. A world checkpoint keeps the last persistable draft while excess
text stays in RAM; shorten or copy it before quitting or voluntary world travel.
A mandatory death/world replacement can end that unpersistable RAM text. This
optional application-owned `codeWorkspace` extension is not a native MakeCode
project, IndexedDB workspace, `.mkcd` file or source/block roundtrip format. The conversion form uses plaintext, labelled controls, 16 px
text and 44 px new touch targets with scrolling for phone orientations. This does
not claim that every older block-editor layout or physical device has been fixed
or tested.


Code Builder now offers a **Saved program or draft** picker. Numbered options distinguish programs with the same name. Editing uses a detached working copy: selecting, editing, and saving never changes an already-running program's code. Choose **Run** explicitly to run the selected saved version. Switching preserves valid edits; invalid working edits stay available for repair. **New** retains an empty session draft that can be selected again.

Valid block edits are included in world autosaves, backups, and Save & Quit, without requiring **Save program**. A failed browser write leaves the session edit available. Invalid uncommitted edits keep the last valid saved AST safe during necessary world checkpoints and death; alive Save & Quit and voluntary world travel require repairing that draft first. Private invalid block edits remain session-only and can end with a mandatory death/world replacement. Text drafts within the storage bounds now persist through the optional world-owned workspace, even when their syntax or conversion name is invalid. A malformed stored workspace preserves the exact original for recovery rather than being silently dropped. A successful disk write stays successful even if editor acknowledgment becomes stale; newer RAM edits keep voluntary Save & Quit open for retry. The original JS/Python subset conversion and separate Run remain unchanged.
