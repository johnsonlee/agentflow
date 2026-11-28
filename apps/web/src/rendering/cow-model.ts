import * as THREE from "three";

/** Original adult-only voxel artwork; generated pixels are not Mojang textures or native geometry. */
function pixels(kind: "coat" | "face" | "leg" | "muzzle" | "horn" | "udder"): THREE.DataTexture {
  const data = new Uint8Array(8 * 8 * 4);
  const brown = [91, 62, 43], white = [229, 224, 204], dark = [42, 33, 29], pink = [202, 143, 136];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    let color = kind === "horn" ? [218, 207, 174] : kind === "muzzle" || kind === "udder" ? pink : ((x < 3 && y < 5 || x > 4 && y > 2) ? brown : white);
    if (kind === "leg" && y < 2) color = dark;
    if (kind === "face") {
      color = white;
      if ((x === 1 || x === 6) && (y === 4 || y === 5)) color = dark;
      if (y < 3 && x > 0 && x < 7) color = pink;
      if (y === 1 && (x === 2 || x === 5)) color = dark;
    }
    const i = (y * 8 + x) * 4; data.set([...color, 255], i);
  }
  const texture = new THREE.DataTexture(data, 8, 8); texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
  return texture;
}

export function buildCowModel(): THREE.Group {
  const group = new THREE.Group(); group.userData.adultCowModel = true;
  const material = (kind: Parameters<typeof pixels>[0]) => new THREE.MeshBasicMaterial({ map: pixels(kind) });
  const coat = material("coat"), face = material("face"), leg = material("leg"), muzzle = material("muzzle"), horn = material("horn"), udder = material("udder");
  const add = (name: string, size: [number, number, number], at: [number, number, number], mat: THREE.Material | THREE.Material[]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat); mesh.name = name; mesh.position.set(...at); group.add(mesh); return mesh;
  };
  add("body", [.74, .56, .75], [0, .77, .06], coat);
  add("head", [.42, .38, .34], [0, 1.05, -.28], [coat, coat, coat, coat, coat, face]);
  add("muzzle", [.34, .14, .06], [0, .94, -.46], muzzle);
  for (const side of [-1, 1]) {
    add("ear", [.12, .08, .10], [side * .31, 1.09, -.27], coat);
    add("horn", [.08, .12, .08], [side * .20, 1.24, -.25], horn);
  }
  for (const [x, z, phase] of [[-.22, -.26, 0], [.22, -.26, 1], [-.22, .26, 1], [.22, .26, 0]]) {
    const mesh = add("leg", [.16, .50, .16], [x, .50, z], leg); mesh.geometry.translate(0, -.25, 0); mesh.userData.leg = phase;
  }
  add("udder", [.26, .14, .27], [0, .44, .12], udder);
  for (const x of [-.07, .07]) for (const z of [.05, .18]) add("teat", [.035, .07, .035], [x, .335, z], udder);
  add("tail", [.055, .30, .055], [0, .69, .43], coat);
  return group;
}
