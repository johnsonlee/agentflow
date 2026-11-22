/** Factual material transforms from the public Education 1.26.33.0 distribution data.
 * This reference candidate is not an accepted whole-game parity baseline. No client code/media is imported.
 * All retained recipe variants and potential aux-selector overlaps have identical output lists.
 */
export const NATIVE_REDUCTION_SOURCE = {
  version: "1.26.33.0",
  bundleId: "com.microsoft.minecraft-edu",
  installerURL: "https://downloads.minecrafteduservices.com/retailbuilds/MacOS/Minecraft_Education_1.26.33.0.dmg",
  installerSHA256: "80bb151b1db4e46edc503230bc8ece25210fff94b7d73d6774559a054398a91e",
  acceptedTargetVersion: false,
} as const;

export interface NativeMaterialReduction {
  input: string;
  inputKind: "block" | "item";
  nativeIdentifier: string;
  /** Ordered native element number/count pairs; zero means the unknown material, not a known atom. */
  output: readonly (readonly [number, number])[];
  sources: readonly { path: string; sha256: string }[];
}

/** Explicit semantic input matches only; native sulfur BLOCK must never alias the app sulfur ATOM. */
export const NATIVE_MATERIAL_REDUCTIONS: readonly NativeMaterialReduction[] = [
  {"input": "grass", "inputKind": "block", "nativeIdentifier": "minecraft:grass", "output": [[6, 15], [8, 64], [8, 6], [7, 8], [15, 7]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_grass.json", "sha256": "c09996547b33dc22c05e9e40d43c0d5477211ebcbd1406ab261875e5a197c5c4"}]},
  {"input": "dirt", "inputKind": "block", "nativeIdentifier": "minecraft:dirt:0", "output": [[14, 21], [20, 8], [15, 3], [7, 3], [26, 13], [12, 6], [30, 2], [29, 2], [8, 42]], "sources": [{"path": "behavior_packs/chemistry_1.21.20/recipes/reducer_dirt.json", "sha256": "2f3a4e588cc6cbcefc5e1c136013ae62c2b3ffa445c6e513fefe57a0354ec510"}, {"path": "behavior_packs/chemistry/recipes/reducer_dirt.json", "sha256": "d04ec7d8da1e1757185bc73b4042d3900b7348b15a30fd969072bef83cef2503"}]},
  {"input": "stone", "inputKind": "block", "nativeIdentifier": "minecraft:stone", "output": [[14, 33], [8, 64], [8, 3]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_stone_block_all_group.json", "sha256": "42b70a59d197f8448e1a7c1e97b00c81ae26856a7aef170f5783ff3c711abaeb"}]},
  {"input": "cobblestone", "inputKind": "block", "nativeIdentifier": "minecraft:cobblestone", "output": [[8, 47], [14, 28], [13, 8], [26, 5], [20, 4], [11, 3], [19, 3], [12, 2]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_cobblestone_block.json", "sha256": "e6fd55b1326c29a5a6c1cc52e35279be2048d80d448f1ab7ee800036de15f550"}]},
  {"input": "oak_planks", "inputKind": "block", "nativeIdentifier": "minecraft:planks", "output": [[6, 49], [1, 6], [8, 44], [7, 1]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_wood_planks_all.json", "sha256": "d4f62391ad383224860f58316720c669c122834d957c043c00cf905145b78614"}]},
  {"input": "oak_log", "inputKind": "block", "nativeIdentifier": "minecraft:log", "output": [[6, 49], [1, 6], [8, 44], [7, 1]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_wood_log_group1.json", "sha256": "dfd2733516e0b54806e4e8aa40e7f4c66bf02e2d86547db1ff2509c82198eb00"}]},
  {"input": "sand", "inputKind": "block", "nativeIdentifier": "minecraft:sand", "output": [[14, 33], [8, 64], [8, 3]], "sources": [{"path": "behavior_packs/chemistry_1.21.20/recipes/reducer_sand_block.json", "sha256": "bfb08c64255fc7684c3b15fe16506941a4ab9ddfeeb71ee589c974a760c33732"}, {"path": "behavior_packs/chemistry/recipes/reducer_sand_block.json", "sha256": "783a2154d18345b818137f1a42c778eebefa373a6773a80d2f47243a12fe3750"}]},
  {"input": "gravel", "inputKind": "block", "nativeIdentifier": "minecraft:gravel", "output": [[14, 33], [8, 64], [8, 3]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_gravel.json", "sha256": "4749c96c9dad58371fb8bd68b283d20413fc15dec4f8d8a417129ddcac0c9ecd"}]},
  {"input": "coal_ore", "inputKind": "block", "nativeIdentifier": "minecraft:coal_ore", "output": [[1, 6], [6, 50], [8, 43], [7, 1]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_coal_ore.json", "sha256": "b526c530d3acffacdff5d8edde87cdd9db92d946f92cb45a5d0b99df5a3af83c"}]},
  {"input": "iron_ore", "inputKind": "block", "nativeIdentifier": "minecraft:iron_ore", "output": [[26, 64], [14, 12], [8, 24]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_iron_ore.json", "sha256": "3ea9b60733d1cb6f5e2d5ca7b0b3379c82dcc99cea5cf81c01bbfb7de6254428"}]},
  {"input": "gold_ore", "inputKind": "block", "nativeIdentifier": "minecraft:gold_ore", "output": [[79, 64], [14, 12], [8, 24]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_gold_ore.json", "sha256": "b144f8af22accf366dfe49f9fb58faaba3fc86c20298e099c65672e931c07791"}]},
  {"input": "diamond_ore", "inputKind": "block", "nativeIdentifier": "minecraft:diamond_ore", "output": [[6, 64], [14, 12], [8, 24]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_diamond_ore.json", "sha256": "6823760370ca7c3089b70cdc763265248b1411d7ebdc34766f0181987dae7ca6"}]},
  {"input": "birch_log", "inputKind": "block", "nativeIdentifier": "minecraft:log", "output": [[6, 49], [1, 6], [8, 44], [7, 1]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_wood_log_group1.json", "sha256": "dfd2733516e0b54806e4e8aa40e7f4c66bf02e2d86547db1ff2509c82198eb00"}]},
  {"input": "snow", "inputKind": "block", "nativeIdentifier": "minecraft:snow", "output": [[1, 64], [1, 3], [8, 33]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_snow.json", "sha256": "cc3b38234b586da56d4cb75e5f953aa55d0d599286b19b827cf1c41a1ce363f1"}]},
  {"input": "glowstone", "inputKind": "block", "nativeIdentifier": "minecraft:glowstone", "output": [[18, 20], [5, 20], [36, 20], [10, 20], [0, 20]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_glowstone.json", "sha256": "50bf6478b64db2495dbccc3c897e0c496b4c9cb7d3df9327ae3162740e347004"}]},
  {"input": "ice", "inputKind": "block", "nativeIdentifier": "minecraft:ice", "output": [[1, 64], [1, 3], [8, 33]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_ice.json", "sha256": "1576a719cfe4fbdbffaa6561ef924932daf69529a9bbe05d74d963925dda98bd"}]},
  {"input": "redstone_ore", "inputKind": "block", "nativeIdentifier": "minecraft:redstone_ore", "output": [[6, 31], [92, 31], [0, 38]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_redstone_ore.json", "sha256": "73891b249d40c23e731e2da750781215b0625d9d0c24cff0a0aa6072def6583a"}]},
  {"input": "coal", "inputKind": "item", "nativeIdentifier": "minecraft:coal", "output": [[1, 6], [6, 50], [8, 43], [7, 1]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_coal_gem.json", "sha256": "be5ab9c4dd104820b56308330acaea99f1488e36075f56a99808671c1c102913"}]},
  {"input": "iron_ingot", "inputKind": "item", "nativeIdentifier": "minecraft:iron_ingot", "output": [[26, 64], [26, 36]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_iron_ingot.json", "sha256": "7a0d854526dd261fb15b2d02e8ce528e85773478a973ecc0af48d5a160b0c4d4"}]},
  {"input": "gold_ingot", "inputKind": "item", "nativeIdentifier": "minecraft:gold_ingot", "output": [[79, 64], [79, 36]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_gold_ingot.json", "sha256": "78c09ea824e7d81e5e8f3f4f30471cda09abc07ceb732a0aa6bbe669e39bd6bc"}]},
  {"input": "diamond", "inputKind": "item", "nativeIdentifier": "minecraft:diamond", "output": [[6, 64], [6, 36]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_diamond_gem.json", "sha256": "f1846a325f6381feb887c97929b6f1ff32a6f4192246a58658533289c6aa10e9"}]},
  {"input": "redstone", "inputKind": "item", "nativeIdentifier": "minecraft:redstone", "output": [[6, 31], [92, 31], [0, 38]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_redstone_gem.json", "sha256": "6e5c9abfddfb54b2c631bbe8aba9a6f62f75bf3f08416a6acfa1252d3a9483c0"}]},
  {"input": "glowstone_dust", "inputKind": "item", "nativeIdentifier": "minecraft:glowstone_dust", "output": [[18, 20], [5, 20], [36, 20], [10, 20], [0, 20]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_glowstone_gem.json", "sha256": "b4be6148c2bfb5e7ff6f0d074a8c4e9c2841393fb6bb1e4d5949b6142abb85d7"}]},
  {"input": "snowball", "inputKind": "item", "nativeIdentifier": "minecraft:snowball", "output": [[1, 64], [1, 3], [8, 33]], "sources": [{"path": "behavior_packs/chemistry/recipes/reducer_snowball.json", "sha256": "b7677d4d8ab3dc65d832d420369570fc3203cd908bb950310a66778deece5dba"}]},
  {input:"netherrack",inputKind:"block",nativeIdentifier:"minecraft:netherrack",output:[[14,64],[8,18],[80,15],[0,3]],sources:[{path:"behavior_packs/chemistry/recipes/reducer_netherrack.json",sha256:"f083431a46f77adf1f29f5a57f5d5460e9a168e9c5a8381322052a8bf6d9213d"}]},
  {input:"soul_sand",inputKind:"block",nativeIdentifier:"minecraft:soul_sand",output:[[14,37],[8,3],[0,29],[0,1],[0,30]],sources:[{path:"behavior_packs/chemistry/recipes/reducer_soul_sand.json",sha256:"1891481d81cfca5b597910fee3b162db7399e128eb69c64e8c64d36462fe087d"}]},
];
