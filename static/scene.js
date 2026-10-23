/* ==========================================================================
   Taixu Safari — procedural low-poly 3D park (Three.js r186, no assets)
   ========================================================================== */

import * as THREE from "./vendor/three.module.js";

export const REGION_SPECIES = {
  savanna: ["lion", "giraffe", "zebra", "rhino"],
  wetland: ["elephant", "flamingo", "hippo"],
};

export const SPECIES_META = {
  lion: {
    name: "狮子",
    en: "LION",
    region: "savanna",
    rarity: "rare",
    score: 18,
    labelY: 2.55,
  },
  giraffe: {
    name: "长颈鹿",
    en: "GIRAFFE",
    region: "savanna",
    rarity: "rare",
    score: 15,
    labelY: 5.15,
  },
  zebra: {
    name: "斑马",
    en: "ZEBRA",
    region: "savanna",
    rarity: "uncommon",
    score: 12,
    labelY: 2.95,
  },
  rhino: {
    name: "犀牛",
    en: "RHINO",
    region: "savanna",
    rarity: "rare",
    score: 20,
    labelY: 2.65,
  },
  elephant: {
    name: "大象",
    en: "ELEPHANT",
    region: "wetland",
    rarity: "epic",
    score: 22,
    labelY: 4.15,
  },
  flamingo: {
    name: "火烈鸟",
    en: "FLAMINGO",
    region: "wetland",
    rarity: "uncommon",
    score: 14,
    labelY: 3.05,
  },
  hippo: {
    name: "河马",
    en: "HIPPO",
    region: "wetland",
    rarity: "rare",
    score: 16,
    labelY: 2.45,
  },
};

const RARITY_COLOR = {
  common: "#a7b8a8",
  uncommon: "#8fbf9f",
  rare: "#7db4e6",
  epic: "#c39aeb",
  legendary: "#efb955",
};

const ATMOSPHERE = {
  savanna: {
    top: 0x4c8cc4,
    horizon: 0xf4d9a4,
    bottom: 0xcbb47b,
    fog: 0xead6ab,
    sun: 0xffe1a6,
    hemiSky: 0xcfe3ee,
    hemiGround: 0x9a8552,
    groundTint: 0xffffff,
  },
  wetland: {
    top: 0x5f9ab5,
    horizon: 0xe6dcc0,
    bottom: 0xa9ab82,
    fog: 0xdde2c7,
    sun: 0xfff0c9,
    hemiSky: 0xd3e8e7,
    hemiGround: 0x6f7c58,
    groundTint: 0xf0f5e4,
  },
};

const WORLD_RADIUS = 76;
const INTERACT_RADIUS = 12.5;

// ---------------------------------------------------------------------------
// Tiny math helpers
// ---------------------------------------------------------------------------

const rand = (min, max) => min + Math.random() * (max - min);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function hashNoise(x, z) {
  const n =
    Math.sin(x * 0.071 + Math.cos(z * 0.053) * 2.1) +
    Math.sin(z * 0.043 + Math.cos(x * 0.037) * 1.7) * 0.7 +
    Math.sin((x + z) * 0.022) * 1.4;
  return (n + 2.4) / 4.8;
}

// ---------------------------------------------------------------------------
// Material / mesh helpers
// ---------------------------------------------------------------------------

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.88,
    metalness: 0,
    flatShading: true,
    ...extra,
  });
}

function put(parent, geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function box(parent, w, h, d, material, x, y, z) {
  return put(parent, new THREE.BoxGeometry(w, h, d), material, x, y, z);
}

function ball(parent, radius, material, x, y, z, scale = [1, 1, 1], segments = 10) {
  const mesh = put(
    parent,
    new THREE.SphereGeometry(radius, segments, Math.max(6, segments - 2)),
    material,
    x,
    y,
    z,
  );
  mesh.scale.set(...scale);
  return mesh;
}

function cylinderBetween(parent, a, b, radius, material, topRadius = radius) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const length = dir.length();
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(topRadius, radius, length, 7),
    material,
  );
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.normalize(),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeLabelSprite(title, subtitle, rarity) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 144;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const w = 456;
  const h = 116;
  const x = (canvas.width - w) / 2;
  const y = 12;
  const r = 34;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = "rgba(14, 32, 24, 0.82)";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(244, 233, 206, 0.28)";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x + 34, y + h / 2, 8, 0, Math.PI * 2);
  ctx.fillStyle = RARITY_COLOR[rarity] || RARITY_COLOR.common;
  ctx.fill();

  ctx.fillStyle = "#f7efda";
  ctx.font = '600 44px "Songti SC", "Noto Serif SC", serif';
  ctx.textBaseline = "middle";
  ctx.fillText(title, x + 60, y + 46);

  ctx.fillStyle = "rgba(231, 178, 92, 0.94)";
  ctx.font = '500 20px "SF Mono", Menlo, monospace';
  ctx.fillText(subtitle, x + 60, y + 86);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.4, 0.96, 1);
  sprite.renderOrder = 5;
  return sprite;
}

function makeAvatarTexture(emoji) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(248, 241, 223, 0.9)";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(216, 155, 66, 0.9)";
  ctx.stroke();
  ctx.font = '64px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji || "🧑‍🌾", 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ---------------------------------------------------------------------------
// Animal builders — every one returns { root, legs, tail, sway, height }
// ---------------------------------------------------------------------------

function buildLion() {
  const root = new THREE.Group();
  const fur = mat(0xc99757);
  const furLight = mat(0xe2bb80);
  const mane = mat(0x7d4a25);
  const dark = mat(0x3a2414);
  const legPivots = [];

  const body = put(root, new THREE.CapsuleGeometry(0.52, 1.0, 4, 10), fur, 0, 0.98, 0);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1, 1, 1.02);
  ball(root, 0.5, fur, 0, 0.94, 0.62, [1, 1.02, 0.9]);
  ball(root, 0.48, fur, 0, 0.93, -0.64, [1, 1, 0.9]);

  const head = new THREE.Group();
  head.position.set(0, 1.28, 1.16);
  root.add(head);
  ball(head, 0.58, mane, 0, 0, -0.02, [1, 1, 0.72], 9);
  ball(head, 0.36, furLight, 0, 0.02, 0.2, [1, 0.94, 1], 10);
  box(head, 0.3, 0.2, 0.32, furLight, 0, -0.12, 0.48);
  ball(head, 0.055, dark, 0.11, 0.06, 0.46);
  ball(head, 0.055, dark, -0.11, 0.06, 0.46);
  ball(head, 0.07, dark, 0, -0.06, 0.62);
  const earGeo = new THREE.ConeGeometry(0.12, 0.18, 4);
  const earL = put(head, earGeo, mane, 0.3, 0.42, -0.04);
  earL.rotation.z = -0.4;
  const earR = put(head, earGeo, mane, -0.3, 0.42, -0.04);
  earR.rotation.z = 0.4;

  const legGeo = new THREE.CylinderGeometry(0.1, 0.085, 0.66, 6);
  for (const [x, z, phase] of [
    [0.33, 0.6, 0],
    [-0.33, 0.6, Math.PI],
    [0.33, -0.6, Math.PI],
    [-0.33, -0.6, 0],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.72, z);
    pivot.userData.isLeg = true;
    pivot.userData.legPhase = phase;
    root.add(pivot);
    put(pivot, legGeo, fur, 0, -0.33, 0);
    ball(pivot, 0.1, furLight, 0, -0.66, 0.04, [1.1, 0.7, 1.2], 6);
    legPivots.push({ pivot, phase });
  }

  const tail = new THREE.Group();
  tail.position.set(0, 1.06, -1.02);
  root.add(tail);
  cylinderBetween(
    tail,
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -0.35, -0.75),
    0.045,
    fur,
    0.035,
  );
  ball(tail, 0.13, mane, 0, -0.38, -0.78, [0.8, 1.2, 0.8], 6);

  return { root, legs: legPivots, tail, height: 1.8, sway: 0.05 };
}

function buildGiraffe() {
  const root = new THREE.Group();
  const hide = mat(0xd2a05c);
  const patch = mat(0x8e5d2d);
  const dark = mat(0x3a2a19);
  const legPivots = [];

  const body = put(root, new THREE.CapsuleGeometry(0.52, 1.0, 4, 10), hide, 0, 2.25, 0);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1, 1, 0.96);

  const neckA = new THREE.Vector3(0, 2.6, 0.5);
  const neckB = new THREE.Vector3(0, 4.15, 1.02);
  cylinderBetween(root, neckA, neckB, 0.22, hide, 0.17);
  const head = ball(root, 0.3, hide, 0, 4.22, 1.16, [0.9, 0.82, 1.28], 9);
  box(root, 0.3, 0.2, 0.42, hide, 0, 4.1, 1.42);
  ball(root, 0.16, dark, 0, 4.14, 1.62, [1, 0.8, 0.7], 6);
  ball(root, 0.05, dark, 0.14, 4.28, 1.36);
  ball(root, 0.05, dark, -0.14, 4.28, 1.36);
  for (const x of [0.12, -0.12]) {
    const horn = put(root, new THREE.CylinderGeometry(0.035, 0.05, 0.3, 5), dark, x, 4.48, 1.08);
    horn.rotation.x = -0.15;
    ball(root, 0.06, patch, x, 4.64, 1.06, [1, 1, 1], 6);
  }

  const legGeo = new THREE.CylinderGeometry(0.115, 0.09, 1.95, 6);
  for (const [x, z, phase] of [
    [0.32, 0.62, 0],
    [-0.32, 0.62, Math.PI],
    [0.32, -0.62, Math.PI],
    [-0.32, -0.62, 0],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 2.0, z);
    pivot.userData.isLeg = true;
    pivot.userData.legPhase = phase;
    root.add(pivot);
    put(pivot, legGeo, hide, 0, -0.98, 0);
    ball(pivot, 0.12, dark, 0, -1.95, 0.02, [1, 0.6, 1.15], 6);
    legPivots.push({ pivot, phase });
  }

  const patches = [
    [0.5, 2.4, 0.2, 0.22],
    [-0.5, 2.2, -0.3, 0.2],
    [0.46, 2.1, -0.55, 0.18],
    [-0.45, 2.4, 0.45, 0.19],
    [0.2, 2.45, 0.62, 0.16],
    [-0.18, 2.4, -0.62, 0.17],
    [0.4, 2.3, 0.7, 0.15],
  ];
  for (const [x, y, z, s] of patches) {
    ball(root, s, patch, x, y, z, [0.45, 1, 1], 6);
  }
  for (let i = 0; i < 4; i++) {
    const t = 0.18 + i * 0.2;
    const p = neckA.clone().lerp(neckB, t);
    ball(root, 0.14 - i * 0.015, patch, 0.18, p.y, p.z + 0.04, [0.5, 1, 0.8], 6);
  }

  const mane = [];
  for (let i = 0; i < 6; i++) {
    const p = neckA.clone().lerp(neckB, i / 5);
    const m = box(root, 0.06, 0.22, 0.14, patch, 0, p.y + 0.08, p.z - 0.18);
    m.rotation.x = 0.2;
    mane.push(m);
  }

  const tail = new THREE.Group();
  tail.position.set(0, 2.3, -0.95);
  root.add(tail);
  cylinderBetween(
    tail,
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -0.8, -0.2),
    0.045,
    hide,
    0.03,
  );
  ball(tail, 0.1, dark, 0, -0.84, -0.2, [0.8, 1.3, 0.8], 6);

  return { root, legs: legPivots, tail, height: 4.7, sway: 0.035 };
}

function buildZebra() {
  const root = new THREE.Group();
  const white = mat(0xf1ead8);
  const black = mat(0x24211c);
  const legPivots = [];

  const body = put(root, new THREE.CapsuleGeometry(0.46, 0.95, 4, 10), white, 0, 1.2, 0);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1, 1, 0.94);
  ball(root, 0.42, white, 0, 1.18, 0.58, [1, 1, 0.9]);

  for (let i = 0; i < 5; i++) {
    const stripe = put(
      root,
      new THREE.TorusGeometry(0.455, 0.045, 4, 12),
      black,
      0,
      1.2,
      -0.48 + i * 0.24,
    );
    stripe.scale.set(1, 1.04, 1);
  }

  cylinderBetween(
    root,
    new THREE.Vector3(0, 1.45, 0.5),
    new THREE.Vector3(0, 2.05, 0.78),
    0.17,
    white,
    0.14,
  );
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Vector3(0, 1.5, 0.52).lerp(new THREE.Vector3(0, 2.02, 0.76), i / 2.4);
    box(root, 0.36, 0.08, 0.14, black, 0, p.y + 0.02, p.z + 0.02).rotation.x = -0.55;
  }
  box(root, 0.28, 0.3, 0.46, white, 0, 2.08, 0.92);
  box(root, 0.22, 0.2, 0.3, black, 0, 2.12, 1.12);
  ball(root, 0.05, black, 0.14, 2.2, 0.98);
  ball(root, 0.05, black, -0.14, 2.2, 0.98);
  for (const x of [0.14, -0.14]) {
    const ear = put(root, new THREE.ConeGeometry(0.09, 0.26, 4), white, x, 2.35, 0.76);
    ear.rotation.z = x > 0 ? -0.25 : 0.25;
  }
  box(root, 0.08, 0.24, 0.6, black, 0, 2.28, 0.72).rotation.x = -0.5;

  const legGeo = new THREE.CylinderGeometry(0.09, 0.07, 1.0, 6);
  for (const [x, z, phase] of [
    [0.28, 0.52, 0],
    [-0.28, 0.52, Math.PI],
    [0.28, -0.52, Math.PI],
    [-0.28, -0.52, 0],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.02, z);
    pivot.userData.isLeg = true;
    pivot.userData.legPhase = phase;
    root.add(pivot);
    put(pivot, legGeo, white, 0, -0.5, 0);
    for (const y of [-0.2, -0.55]) {
      const ring = put(pivot, new THREE.TorusGeometry(0.085, 0.022, 4, 8), black, 0, y, 0);
      ring.rotation.x = Math.PI / 2;
    }
    ball(pivot, 0.09, black, 0, -1.0, 0.02, [1, 0.6, 1.1], 6);
    legPivots.push({ pivot, phase });
  }

  const tail = new THREE.Group();
  tail.position.set(0, 1.45, -0.88);
  root.add(tail);
  cylinderBetween(
    tail,
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -0.62, -0.16),
    0.04,
    white,
    0.03,
  );
  ball(tail, 0.09, black, 0, -0.66, -0.18, [0.8, 1.4, 0.8], 6);

  return { root, legs: legPivots, tail, height: 2.45, sway: 0.05 };
}

function buildRhino() {
  const root = new THREE.Group();
  const hide = mat(0x8e8d84);
  const hideDark = mat(0x6f6f68);
  const hornMat = mat(0xe6dfc7);
  const dark = mat(0x2f2f2a);
  const legPivots = [];

  const body = put(root, new THREE.CapsuleGeometry(0.64, 1.0, 4, 10), hide, 0, 1.25, 0);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1, 1, 1.02);
  ball(root, 0.56, hide, 0, 1.18, 0.68);

  ball(root, 0.5, hide, 0, 1.15, 1.2, [1, 0.82, 1.1]);
  box(root, 0.38, 0.28, 0.55, hide, 0, 1.02, 1.62);
  const horn = put(root, new THREE.ConeGeometry(0.11, 0.5, 6), hornMat, 0, 1.44, 1.66);
  horn.rotation.x = 0.5;
  const horn2 = put(root, new THREE.ConeGeometry(0.08, 0.26, 5), hornMat, 0, 1.38, 1.36);
  horn2.rotation.x = 0.5;
  ball(root, 0.05, dark, 0.18, 1.3, 1.42);
  ball(root, 0.05, dark, -0.18, 1.3, 1.42);
  for (const x of [0.2, -0.2]) {
    const ear = put(root, new THREE.ConeGeometry(0.11, 0.25, 4), hideDark, x, 1.58, 1.0);
    ear.rotation.z = x > 0 ? -0.3 : 0.3;
  }
  for (let i = 0; i < 3; i++) {
    const plate = box(root, 0.9 - i * 0.12, 0.07, 0.55, hideDark, 0, 1.78, -0.45 + i * 0.38);
    plate.rotation.x = 0.05;
  }

  const legGeo = new THREE.CylinderGeometry(0.16, 0.14, 0.82, 6);
  for (const [x, z, phase] of [
    [0.4, 0.62, 0],
    [-0.4, 0.62, Math.PI],
    [0.4, -0.62, Math.PI],
    [-0.4, -0.62, 0],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.86, z);
    pivot.userData.isLeg = true;
    pivot.userData.legPhase = phase;
    root.add(pivot);
    put(pivot, legGeo, hide, 0, -0.41, 0);
    ball(pivot, 0.15, hideDark, 0, -0.82, 0.04, [1.1, 0.55, 1.2], 6);
    legPivots.push({ pivot, phase });
  }

  const tail = new THREE.Group();
  tail.position.set(0, 1.25, -1.0);
  root.add(tail);
  cylinderBetween(
    tail,
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -0.45, -0.18),
    0.05,
    hide,
    0.035,
  );
  ball(tail, 0.08, dark, 0, -0.48, -0.2, [0.9, 1.2, 0.9], 6);

  return { root, legs: legPivots, tail, height: 1.9, sway: 0.045 };
}

function buildElephant() {
  const root = new THREE.Group();
  const hide = mat(0x8b8b8d);
  const hideLight = mat(0x9d9c9d);
  const dark = mat(0x3a3a3a);
  const tuskMat = mat(0xefe6cf);
  const legPivots = [];

  ball(root, 0.98, hide, 0, 1.95, 0, [1.12, 0.94, 1.34], 12);
  ball(root, 0.62, hideLight, 0, 1.98, 1.28, [1, 0.95, 0.9], 10);
  ball(root, 0.68, hide, 0.72, 2.12, 1.12, [0.28, 1, 0.78], 8);
  ball(root, 0.68, hide, -0.72, 2.12, 1.12, [0.28, 1, 0.78], 8);
  ball(root, 0.34, hideLight, 0, 2.28, 1.55, [1, 0.8, 0.8], 8);

  for (const x of [0.34, -0.34]) {
    ball(root, 0.06, dark, x, 2.36, 1.62);
  }

  const trunkPoints = [
    [0.0, 1.98, 1.82],
    [0.0, 1.62, 2.02],
    [0.0, 1.24, 2.12],
    [0.0, 0.92, 2.04],
    [0.0, 0.72, 1.9],
  ];
  for (let i = 0; i < trunkPoints.length - 1; i++) {
    const a = new THREE.Vector3(...trunkPoints[i]);
    const b = new THREE.Vector3(...trunkPoints[i + 1]);
    cylinderBetween(root, a, b, 0.19 - i * 0.028, hideLight, 0.17 - i * 0.026);
  }
  for (const x of [0.16, -0.16]) {
    const tusk = put(root, new THREE.ConeGeometry(0.055, 0.5, 5), tuskMat, x, 1.66, 1.95);
    tusk.rotation.x = -0.9;
    tusk.rotation.z = x > 0 ? 0.12 : -0.12;
  }

  const legGeo = new THREE.CylinderGeometry(0.24, 0.27, 1.0, 7);
  for (const [x, z, phase] of [
    [0.55, 0.72, 0],
    [-0.55, 0.72, Math.PI],
    [0.55, -0.72, Math.PI],
    [-0.55, -0.72, 0],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.0, z);
    pivot.userData.isLeg = true;
    pivot.userData.legPhase = phase;
    root.add(pivot);
    put(pivot, legGeo, hide, 0, -0.5, 0);
    ball(pivot, 0.25, hideLight, 0, -1.0, 0.03, [1, 0.42, 1.1], 7);
    legPivots.push({ pivot, phase });
  }

  const tail = new THREE.Group();
  tail.position.set(0, 1.9, -1.3);
  root.add(tail);
  cylinderBetween(
    tail,
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -0.8, -0.15),
    0.06,
    hide,
    0.04,
  );
  ball(tail, 0.1, dark, 0, -0.85, -0.18, [0.8, 1.3, 0.8], 6);

  return { root, legs: legPivots, tail, height: 3.25, sway: 0.03 };
}

function buildFlamingo() {
  const root = new THREE.Group();
  const pink = mat(0xe89a9f);
  const pinkDeep = mat(0xcf6f86);
  const dark = mat(0x39312d);
  const legMat = mat(0xd9a3a1);
  const legPivots = [];

  ball(root, 0.43, pink, 0, 1.3, 0, [1, 0.82, 1.24], 10);
  ball(root, 0.34, pink, 0.33, 1.42, -0.02, [0.35, 0.8, 1.1], 8);
  ball(root, 0.34, pink, -0.33, 1.42, -0.02, [0.35, 0.8, 1.1], 8);
  ball(root, 0.2, pinkDeep, 0, 1.42, -0.4, [1, 0.9, 1.5], 8);

  const a = new THREE.Vector3(0, 1.55, 0.28);
  const b = new THREE.Vector3(0, 1.92, 0.52);
  const c = new THREE.Vector3(0, 2.24, 0.38);
  cylinderBetween(root, a, b, 0.075, pink, 0.065);
  cylinderBetween(root, b, c, 0.065, pink, 0.055);
  ball(root, 0.17, pink, 0, 2.27, 0.38, [1, 0.9, 1.1], 8);
  const beak = put(root, new THREE.ConeGeometry(0.09, 0.34, 5), dark, 0, 2.15, 0.58);
  beak.rotation.x = 1.9;
  ball(root, 0.045, dark, 0.1, 2.32, 0.45);
  ball(root, 0.045, dark, -0.1, 2.32, 0.45);

  for (const [x, phase] of [
    [0.14, 0],
    [-0.14, Math.PI],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.12, 0);
    pivot.userData.isLeg = true;
    pivot.userData.legPhase = phase;
    root.add(pivot);
    put(pivot, new THREE.CylinderGeometry(0.035, 0.03, 1.12, 5), legMat, 0, -0.56, 0);
    ball(pivot, 0.075, dark, 0, -1.12, 0.06, [1, 0.4, 1.4], 5);
    legPivots.push({ pivot, phase });
  }

  return { root, legs: legPivots, tail: null, height: 2.5, sway: 0.02, neckBob: true };
}

function buildHippo() {
  const root = new THREE.Group();
  const hide = mat(0x8a7f83);
  const hideLight = mat(0xa19497);
  const dark = mat(0x373033);
  const legPivots = [];

  ball(root, 0.84, hide, 0, 1.0, 0, [1.15, 0.92, 1.52], 12);
  ball(root, 0.55, hide, 0, 1.02, 1.25, [1.1, 0.9, 1.15], 10);
  box(root, 0.68, 0.42, 0.5, hideLight, 0, 0.9, 1.62);
  ball(root, 0.1, dark, 0.18, 1.1, 1.78, [1, 0.7, 0.7], 6);
  ball(root, 0.1, dark, -0.18, 1.1, 1.78, [1, 0.7, 0.7], 6);
  ball(root, 0.06, dark, 0.24, 1.3, 1.52);
  ball(root, 0.06, dark, -0.24, 1.3, 1.52);
  for (const x of [0.24, -0.24]) {
    ball(root, 0.09, hide, x, 1.48, 1.24, [0.8, 1, 0.7], 6);
  }
  for (let i = 0; i < 3; i++) {
    ball(root, 0.17, hideLight, 0.3 - i * 0.3, 1.65, 0.55 - i * 0.2, [1, 0.5, 1], 6);
  }

  const legGeo = new THREE.CylinderGeometry(0.18, 0.16, 0.55, 6);
  for (const [x, z, phase] of [
    [0.42, 0.58, 0],
    [-0.42, 0.58, Math.PI],
    [0.42, -0.58, Math.PI],
    [-0.42, -0.58, 0],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.58, z);
    pivot.userData.isLeg = true;
    pivot.userData.legPhase = phase;
    root.add(pivot);
    put(pivot, legGeo, hide, 0, -0.28, 0);
    ball(pivot, 0.18, hideLight, 0, -0.55, 0.03, [1, 0.45, 1.1], 6);
    legPivots.push({ pivot, phase });
  }

  const tail = new THREE.Group();
  tail.position.set(0, 1.22, -1.18);
  root.add(tail);
  cylinderBetween(
    tail,
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -0.3, -0.25),
    0.05,
    hide,
    0.035,
  );
  ball(tail, 0.09, dark, 0, -0.32, -0.27, [0.8, 1, 0.8], 6);

  return { root, legs: legPivots, tail, height: 1.85, sway: 0.03, inWater: true };
}

const ANIMAL_BUILDERS = {
  lion: buildLion,
  giraffe: buildGiraffe,
  zebra: buildZebra,
  rhino: buildRhino,
  elephant: buildElephant,
  flamingo: buildFlamingo,
  hippo: buildHippo,
};

// ---------------------------------------------------------------------------
// Static world builders
// ---------------------------------------------------------------------------

function buildGround(scene, material) {
  const geometry = new THREE.PlaneGeometry(420, 420, 90, 90);
  geometry.rotateX(-Math.PI / 2);
  const colors = [];
  const pos = geometry.attributes.position;
  const c = new THREE.Color();
  const palette = [
    new THREE.Color(0x8d9850),
    new THREE.Color(0xa2a25f),
    new THREE.Color(0x7f8b48),
    new THREE.Color(0xb2a06b),
  ];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n = hashNoise(x, z);
    const idx = n < 0.28 ? 3 : n < 0.5 ? 1 : n < 0.74 ? 0 : 2;
    c.copy(palette[idx]);
    c.offsetHSL(0, 0, (hashNoise(z, x) - 0.5) * 0.07);
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

  const groundMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
  const ground = new THREE.Mesh(geometry, groundMaterial);
  ground.receiveShadow = true;
  ground.position.y = -0.02;
  scene.add(ground);

  // A worn dirt ring around camp.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(12.5, 14.2, 64),
    new THREE.MeshStandardMaterial({
      color: 0xb39262,
      roughness: 1,
      transparent: true,
      opacity: 0.65,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.005;
  ring.receiveShadow = true;
  scene.add(ring);
  return ground;
}

function buildDistantHills(scene) {
  const group = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2 + rand(-0.1, 0.1);
    const radius = rand(108, 155);
    const height = rand(14, 34);
    const width = rand(26, 52);
    const geo = new THREE.ConeGeometry(width, height, 6 + Math.floor(rand(0, 3)));
    const color = new THREE.Color().setHSL(rand(0.18, 0.26), rand(0.14, 0.24), rand(0.36, 0.48));
    const mesh = new THREE.Mesh(geo, mat(color.getHex()));
    mesh.position.set(Math.cos(angle) * radius, height / 2 - 6, Math.sin(angle) * radius);
    mesh.rotation.y = rand(0, Math.PI);
    group.add(mesh);
  }
  scene.add(group);
  return group;
}

function buildSky(scene) {
  const geometry = new THREE.SphereGeometry(400, 32, 18);
  const uniforms = {
    topColor: { value: new THREE.Color(ATMOSPHERE.savanna.top) },
    horizonColor: { value: new THREE.Color(ATMOSPHERE.savanna.horizon) },
    bottomColor: { value: new THREE.Color(ATMOSPHERE.savanna.bottom) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      void main() {
        float h = normalize(vPos).y;
        vec3 color = mix(horizonColor, topColor, smoothstep(0.02, 0.62, h));
        color = mix(bottomColor, color, smoothstep(-0.22, 0.03, h));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.frustumCulled = false;
  scene.add(sky);

  // Sun glow sprite.
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  gradient.addColorStop(0, "rgba(255, 247, 219, 1)");
  gradient.addColorStop(0.2, "rgba(255, 229, 166, 0.92)");
  gradient.addColorStop(0.55, "rgba(255, 205, 125, 0.25)");
  gradient.addColorStop(1, "rgba(255, 205, 125, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sun = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sun.position.set(105, 78, -150);
  sun.scale.set(58, 58, 1);
  scene.add(sun);

  return { sky, uniforms, sun };
}

function buildClouds(scene) {
  const clouds = new THREE.Group();
  const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xfff5e4,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Group();
    const blobs = 3 + Math.floor(rand(0, 3));
    for (let j = 0; j < blobs; j++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(rand(3.5, 7), 6, 4),
        cloudMat,
      );
      mesh.position.set(j * rand(3.5, 5.5) - blobs * 2, rand(-0.8, 0.8), rand(-2, 2));
      mesh.scale.y = rand(0.45, 0.7);
      cloud.add(mesh);
    }
    cloud.position.set(rand(-150, 150), rand(42, 70), rand(-160, 20));
    cloud.userData.speed = rand(0.3, 0.9);
    clouds.add(cloud);
  }
  scene.add(clouds);
  return clouds;
}

function buildCamp(scene) {
  const camp = new THREE.Group();
  camp.position.set(-3.5, 0, 6.5);
  scene.add(camp);

  const olive = mat(0x5c6b3f);
  const oliveDark = mat(0x414d2e);
  const canvasMat = mat(0xd8c69a);
  const wood = mat(0x7a5334);
  const metal = mat(0x4d4b45, { metalness: 0.5, roughness: 0.45 });
  const rubber = mat(0x23231f);

  // Jeep
  const jeep = new THREE.Group();
  jeep.position.set(2.2, 0, 1.6);
  jeep.rotation.y = -0.32;
  camp.add(jeep);
  box(jeep, 2.5, 0.55, 4.2, olive, 0, 0.95, 0);
  box(jeep, 2.3, 0.42, 1.4, oliveDark, 0, 1.4, -1.15);
  box(jeep, 2.25, 0.16, 1.5, metal, 0, 1.62, -0.2);
  box(jeep, 0.12, 0.55, 0.12, metal, 1.08, 1.42, 0.55);
  box(jeep, 0.12, 0.55, 0.12, metal, -1.08, 1.42, 0.55);
  box(jeep, 2.5, 0.16, 0.16, metal, 0, 1.68, 0.58);
  box(jeep, 2.1, 0.62, 0.6, oliveDark, 0, 1.2, 1.5);
  for (const [x, z] of [
    [1.15, 1.25],
    [-1.15, 1.25],
    [1.15, -1.25],
    [-1.15, -1.25],
  ]) {
    const wheel = put(jeep, new THREE.CylinderGeometry(0.46, 0.46, 0.34, 12), rubber, x, 0.5, z);
    wheel.rotation.z = Math.PI / 2;
    const hub = put(jeep, new THREE.CylinderGeometry(0.19, 0.19, 0.36, 8), metal, x, 0.5, z);
    hub.rotation.z = Math.PI / 2;
  }
  for (const x of [0.72, -0.72]) {
    const light = put(jeep, new THREE.SphereGeometry(0.13, 8, 6), mat(0xffe6aa, { emissive: 0xffc45e, emissiveIntensity: 0.8 }), x, 1.02, 2.05);
    light.castShadow = false;
  }
  box(jeep, 0.7, 0.4, 0.25, metal, 0, 0.78, 2.12);
  const antenna = put(jeep, new THREE.CylinderGeometry(0.02, 0.02, 2.3, 4), metal, -0.9, 1.9, -1.4);
  antenna.castShadow = false;
  ball(jeep, 0.08, mat(0xc45a3d, { emissive: 0x8f2f1b, emissiveIntensity: 0.6 }), -0.9, 3.06, -1.4, [1, 1, 1], 6);

  // Tent
  const tent = new THREE.Group();
  tent.position.set(-3.4, 0, -1.4);
  tent.rotation.y = 0.45;
  camp.add(tent);
  const tentCone = put(tent, new THREE.ConeGeometry(1.65, 1.9, 4), canvasMat, 0, 0.95, 0);
  tentCone.rotation.y = Math.PI / 4;
  tentCone.scale.set(1.2, 1, 1.2);
  box(tent, 0.9, 1.15, 0.05, mat(0x5c4a32), 0, 0.58, 1.02).rotation.y = 0.0;
  const flagPole = put(tent, new THREE.CylinderGeometry(0.025, 0.025, 1.2, 4), wood, 1.3, 1.5, 0.4);
  flagPole.castShadow = false;
  const flag = box(tent, 0.6, 0.32, 0.02, mat(0xd79a43), 1.55, 1.95, 0.4);
  flag.castShadow = false;

  // Campfire
  const fire = new THREE.Group();
  fire.position.set(0.8, 0, 0.2);
  camp.add(fire);
  const stoneMat = mat(0x77746b);
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2;
    put(
      fire,
      new THREE.DodecahedronGeometry(rand(0.16, 0.24), 0),
      stoneMat,
      Math.cos(angle) * 0.85,
      0.12,
      Math.sin(angle) * 0.85,
    );
  }
  for (let i = 0; i < 4; i++) {
    const log = put(fire, new THREE.CylinderGeometry(0.09, 0.11, 1.1, 5), wood, 0, 0.18, 0);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 4) * Math.PI;
  }
  const flame = put(
    fire,
    new THREE.ConeGeometry(0.34, 1.0, 6),
    new THREE.MeshStandardMaterial({
      color: 0xffb347,
      emissive: 0xff8a2b,
      emissiveIntensity: 1.8,
      roughness: 0.6,
    }),
    0,
    0.72,
    0,
  );
  flame.castShadow = false;
  const fireLight = new THREE.PointLight(0xffa042, 22, 14, 1.8);
  fireLight.position.set(0.8, 1.4, 0.2);
  camp.add(fireLight);

  // Crates and barrel
  box(camp, 0.8, 0.65, 0.8, wood, -1.0, 0.33, 2.6).rotation.y = 0.18;
  box(camp, 0.62, 0.52, 0.62, mat(0x9b7443), -1.35, 0.9, 2.5).rotation.y = -0.2;
  const barrel = put(camp, new THREE.CylinderGeometry(0.34, 0.34, 0.9, 10), mat(0x8a5f36), 1.9, 0.45, -1.1);
  barrel.castShadow = true;

  // Signpost
  const sign = new THREE.Group();
  sign.position.set(6.0, 0, 6.6);
  sign.rotation.y = -0.5;
  camp.add(sign);
  put(sign, new THREE.CylinderGeometry(0.08, 0.1, 2.4, 5), wood, 0, 1.2, 0);
  const boardCanvas = document.createElement("canvas");
  boardCanvas.width = 512;
  boardCanvas.height = 192;
  const ctx = boardCanvas.getContext("2d");
  ctx.fillStyle = "#d8c69a";
  ctx.fillRect(0, 0, 512, 192);
  ctx.strokeStyle = "#6f4d2e";
  ctx.lineWidth = 12;
  ctx.strokeRect(8, 8, 496, 176);
  ctx.fillStyle = "#33422f";
  ctx.font = '600 64px "Songti SC", "Noto Serif SC", serif';
  ctx.textAlign = "center";
  ctx.fillText("TAIXU SAFARI", 256, 88);
  ctx.font = '500 28px "SF Mono", Menlo, monospace';
  ctx.fillStyle = "#8a5a22";
  ctx.fillText("太虚野生动物园 · 营地", 256, 140);
  const boardTexture = new THREE.CanvasTexture(boardCanvas);
  boardTexture.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2.7, 1.0, 0.08),
    [
      mat(0x6f4d2e),
      mat(0x6f4d2e),
      mat(0x6f4d2e),
      mat(0x6f4d2e),
      new THREE.MeshStandardMaterial({ map: boardTexture, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ map: boardTexture, roughness: 0.95 }),
    ],
  );
  board.position.set(0, 2.15, 0);
  board.castShadow = true;
  sign.add(board);

  // Radio tower
  const tower = new THREE.Group();
  tower.position.set(-4.8, 0, 3.2);
  camp.add(tower);
  const poleMat = metal;
  for (const [x, z] of [
    [0.35, 0.35],
    [-0.35, 0.35],
    [0.35, -0.35],
    [-0.35, -0.35],
  ]) {
    const line = cylinderBetween(
      tower,
      new THREE.Vector3(x * 1.2, 0, z * 1.2),
      new THREE.Vector3(x * 0.15, 6.2, z * 0.15),
      0.035,
      poleMat,
    );
    line.castShadow = false;
  }
  for (let y = 1; y < 6; y += 1.6) {
    box(tower, 0.9, 0.035, 0.035, poleMat, 0, y, 0.45).castShadow = false;
    box(tower, 0.035, 0.035, 0.9, poleMat, 0.45, y, 0).castShadow = false;
  }
  const beacon = ball(
    tower,
    0.12,
    new THREE.MeshStandardMaterial({
      color: 0xff7150,
      emissive: 0xd93a1f,
      emissiveIntensity: 2,
    }),
    0,
    6.35,
    0,
    [1, 1, 1],
    6,
  );
  beacon.castShadow = false;
  const beaconLight = new THREE.PointLight(0xff5a35, 6, 9, 2);
  beaconLight.position.set(0, 6.35, 0);
  tower.add(beaconLight);

  return { camp, fireLight, flame, beacon, beaconLight, fire };
}

function addAcacia(group, x, z, scale = 1) {
  const tree = new THREE.Group();
  tree.position.set(x, 0, z);
  tree.scale.setScalar(scale);
  tree.rotation.y = rand(0, Math.PI * 2);
  const trunkMat = mat(0x6b4a2f);
  const leafMat = mat(0x6d7d3c);
  const leafLight = mat(0x87944a);
  put(tree, new THREE.CylinderGeometry(0.22, 0.34, 3.0, 6), trunkMat, 0, 1.5, 0);
  const branchA = cylinderBetween(
    tree,
    new THREE.Vector3(0, 2.3, 0),
    new THREE.Vector3(1.0, 3.3, 0.5),
    0.12,
    trunkMat,
    0.08,
  );
  branchA.castShadow = true;
  cylinderBetween(
    tree,
    new THREE.Vector3(0, 2.5, 0),
    new THREE.Vector3(-0.9, 3.4, -0.4),
    0.11,
    trunkMat,
    0.07,
  );
  ball(tree, 1.55, leafMat, 0.2, 3.55, 0.1, [1.35, 0.26, 1.05], 8);
  ball(tree, 1.25, leafLight, -0.8, 3.7, -0.3, [1.2, 0.22, 0.9], 7);
  ball(tree, 1.15, leafMat, 1.4, 3.4, 0.6, [1.1, 0.24, 0.85], 7);
  group.add(tree);
  return tree;
}

function addPalm(group, x, z, scale = 1) {
  const tree = new THREE.Group();
  tree.position.set(x, 0, z);
  tree.scale.setScalar(scale);
  tree.rotation.y = rand(0, Math.PI * 2);
  const trunkMat = mat(0x7c5b3a);
  const leafMat = mat(0x4c7842);
  const base = new THREE.Vector3(0, 0, 0);
  const mid = new THREE.Vector3(rand(-0.3, 0.3), 2.8, rand(-0.3, 0.3));
  const top = new THREE.Vector3(mid.x + rand(-0.6, 0.6), 5.4, mid.z + rand(-0.6, 0.6));
  cylinderBetween(tree, base, mid, 0.22, trunkMat, 0.17);
  cylinderBetween(tree, mid, top, 0.17, trunkMat, 0.12);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + rand(-0.12, 0.12);
    const leaf = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 3.1, 1, 4),
      new THREE.MeshStandardMaterial({
        color: i % 2 ? 0x568749 : 0x46753e,
        side: THREE.DoubleSide,
        roughness: 0.9,
        flatShading: true,
      }),
    );
    leaf.position.copy(top);
    leaf.position.x += Math.cos(angle) * 1.35;
    leaf.position.z += Math.sin(angle) * 1.35;
    leaf.rotation.y = -angle + Math.PI / 2;
    leaf.rotation.z = 1.05;
    leaf.castShadow = false;
    tree.add(leaf);
  }
  ball(tree, 0.3, mat(0x6d5a2c), top.x, top.y - 0.2, top.z, [1, 0.7, 1], 6);
  group.add(tree);
  return tree;
}

function addBush(group, x, z, scale = 1) {
  const bush = new THREE.Group();
  bush.position.set(x, 0, z);
  bush.scale.setScalar(scale);
  const leaf = mat(0x4f6a3b);
  ball(bush, 0.55, leaf, 0, 0.35, 0, [1.3, 0.8, 1.1], 6);
  ball(bush, 0.4, leaf, 0.45, 0.28, 0.2, [1, 0.75, 1], 6);
  ball(bush, 0.34, mat(0x5d7a43), -0.35, 0.25, -0.2, [1, 0.8, 1], 6);
  group.add(bush);
}

function addRock(group, x, z, scale = 1) {
  const rock = put(
    group,
    new THREE.DodecahedronGeometry(rand(0.4, 0.9), 0),
    mat(rand(0, 1) > 0.5 ? 0x8a8478 : 0x77746a),
    x,
    0.28 * scale,
    z,
  );
  rock.scale.setScalar(scale);
  rock.rotation.set(rand(0, 1), rand(0, 3), rand(0, 1));
  return rock;
}

function addReeds(group, x, z, scale = 1) {
  const reeds = new THREE.Group();
  reeds.position.set(x, 0, z);
  reeds.scale.setScalar(scale);
  const stemMat = mat(0x7c8c4b);
  const tipMat = mat(0x6d4a2c);
  for (let i = 0; i < 9; i++) {
    const h = rand(0.9, 1.8);
    const stem = put(
      reeds,
      new THREE.CylinderGeometry(0.018, 0.03, h, 4),
      stemMat,
      rand(-0.5, 0.5),
      h / 2,
      rand(-0.5, 0.5),
    );
    stem.rotation.z = rand(-0.12, 0.12);
    if (i % 2 === 0) {
      ball(reeds, 0.05, tipMat, stem.position.x, h + 0.06, stem.position.z, [1, 2.2, 1], 5);
    }
  }
  group.add(reeds);
}

function buildGrass(region, water) {
  const count = region === "savanna" ? 1500 : 1300;
  const geometry = new THREE.ConeGeometry(0.09, 0.62, 4);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    flatShading: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const color = new THREE.Color();
  const palette =
    region === "savanna"
      ? [0x8d9850, 0xa3a35f, 0x7e8b47, 0xb0a06a]
      : [0x6f8f4f, 0x87a35c, 0x5c7f45, 0x9cac6e];
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < count * 12) {
    guard++;
    const angle = rand(0, Math.PI * 2);
    const radius = Math.sqrt(rand(0, 1)) * 88;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (radius < 7.5) continue;
    if (Math.hypot(x, z - 6.5) < 7) continue;
    if (water && Math.hypot(x - water.x, z - water.z) < water.r + 0.6) continue;
    position.set(x, 0.28, z);
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand(0, Math.PI));
    const s = rand(0.6, 1.5);
    scale.set(s, rand(0.7, 1.35), s);
    matrix.compose(position, quat, scale);
    mesh.setMatrixAt(placed, matrix);
    color.setHex(palette[Math.floor(rand(0, palette.length))]);
    color.offsetHSL(0, 0, rand(-0.04, 0.04));
    mesh.setColorAt(placed, color);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  return mesh;
}

function buildWater(group, x, z, radius, region) {
  const waterGroup = new THREE.Group();
  waterGroup.position.set(x, 0, z);
  group.add(waterGroup);

  const shore = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.4, radius + 2.4, 64),
    new THREE.MeshStandardMaterial({
      color: region === "wetland" ? 0xa8a173 : 0xc3ac77,
      roughness: 1,
      flatShading: true,
    }),
  );
  shore.rotation.x = -Math.PI / 2;
  shore.position.y = 0.012;
  shore.receiveShadow = true;
  waterGroup.add(shore);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 56),
    new THREE.MeshStandardMaterial({
      color: region === "wetland" ? 0x4a8792 : 0x4a94a8,
      transparent: true,
      opacity: 0.86,
      roughness: 0.12,
      metalness: 0.28,
      side: THREE.DoubleSide,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.03;
  water.receiveShadow = true;
  waterGroup.add(water);

  const rippleMat = new THREE.MeshBasicMaterial({
    color: 0xe7f2ec,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ripples = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.16, radius * 0.19, 48),
      rippleMat.clone(),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.045;
    ring.userData.phase = i / 3;
    waterGroup.add(ring);
    ripples.push(ring);
  }

  if (region === "wetland") {
    for (let i = 0; i < 18; i++) {
      const angle = rand(0, Math.PI * 2);
      const dist = rand(radius * 0.25, radius * 0.92);
      const pad = put(
        waterGroup,
        new THREE.CircleGeometry(rand(0.22, 0.46), 7),
        mat(0x5f8247),
        Math.cos(angle) * dist,
        0.05,
        Math.sin(angle) * dist,
      );
      pad.rotation.x = -Math.PI / 2;
      pad.castShadow = false;
    }
  }

  return { waterGroup, water, ripples, x, z, r: radius };
}

function buildRegion(scene, region) {
  const group = new THREE.Group();
  group.name = `region-${region}`;
  scene.add(group);

  const waterSpec =
    region === "savanna"
      ? { x: 28, z: -16, r: 8.5 }
      : { x: -16, z: -8, r: 16 };
  const water = buildWater(group, waterSpec.x, waterSpec.z, waterSpec.r, region);

  group.add(buildGrass(region, waterSpec));

  if (region === "savanna") {
    const treeSpots = [
      [-20, -16, 1.2], [-26, 4, 0.95], [-10, -28, 1.1], [14, 10, 1.05],
      [20, 24, 0.9], [6, -34, 1.15], [34, 8, 0.85], [-34, 22, 1.0],
      [38, -4, 1.1], [-30, -32, 0.95], [10, 30, 0.9], [-16, 34, 1.05],
      [22, -28, 1.0], [42, -30, 0.8], [-40, -8, 0.9], [30, 34, 0.95],
      [-8, 22, 0.7], [48, 14, 0.8],
    ];
    for (const [x, z, s] of treeSpots) addAcacia(group, x, z, s);
    for (let i = 0; i < 18; i++) {
      const angle = rand(0, Math.PI * 2);
      const radius = rand(18, 62);
      addBush(group, Math.cos(angle) * radius, Math.sin(angle) * radius, rand(0.6, 1.2));
    }
    for (let i = 0; i < 14; i++) {
      const angle = rand(0, Math.PI * 2);
      const radius = rand(12, 64);
      addRock(group, Math.cos(angle) * radius, Math.sin(angle) * radius, rand(0.5, 1.4));
    }
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      addReeds(group, waterSpec.x + Math.cos(angle) * (waterSpec.r + 0.8), waterSpec.z + Math.sin(angle) * (waterSpec.r + 0.8), 0.7);
    }
  } else {
    const palmSpots = [
      [-2, -18, 1.1], [-6, 8, 1.0], [-42, -30, 0.9], [-46, 4, 1.05],
      [4, -34, 1.0], [-28, -40, 0.85], [-36, 12, 0.95], [-12, 22, 0.8],
      [18, 18, 0.9], [-46, -14, 1.1], [-18, -42, 1.0], [30, -24, 0.85],
      [10, 30, 0.9], [-54, -4, 0.8], [24, -2, 0.7], [-38, 26, 0.9],
    ];
    for (const [x, z, s] of palmSpots) addPalm(group, x, z, s);
    for (let i = 0; i < 26; i++) {
      const angle = rand(0, Math.PI * 2);
      const radius = waterSpec.r + rand(0.5, 5.5);
      addReeds(group, waterSpec.x + Math.cos(angle) * radius, waterSpec.z + Math.sin(angle) * radius, rand(0.8, 1.4));
    }
    for (let i = 0; i < 12; i++) {
      const angle = rand(0, Math.PI * 2);
      const radius = rand(20, 62);
      addBush(group, Math.cos(angle) * radius, Math.sin(angle) * radius, rand(0.7, 1.3));
    }
    for (let i = 0; i < 10; i++) {
      const angle = rand(0, Math.PI * 2);
      const radius = rand(14, 60);
      addRock(group, Math.cos(angle) * radius, Math.sin(angle) * radius, rand(0.4, 1.1));
    }
    // A small observation deck by the water.
    const deck = new THREE.Group();
    deck.position.set(0, 0, -18);
    deck.rotation.y = 0.92;
    group.add(deck);
    box(deck, 3.4, 0.18, 2.6, mat(0x8a6238), 0, 0.9, 0);
    for (const [x, z] of [[-1.5, -1.1], [1.5, -1.1], [-1.5, 1.1], [1.5, 1.1]]) {
      put(deck, new THREE.CylinderGeometry(0.08, 0.1, 0.9, 5), mat(0x6b4a2f), x, 0.45, z);
    }
    box(deck, 3.4, 0.08, 0.08, mat(0x6b4a2f), 0, 1.55, -1.1);
    box(deck, 0.08, 0.6, 0.08, mat(0x6b4a2f), -1.5, 1.25, -1.1);
    box(deck, 0.08, 0.6, 0.08, mat(0x6b4a2f), 1.5, 1.25, -1.1);
  }

  const animals = [];
  const spawns =
    region === "savanna"
      ? {
          lion: [[8, -6], [-14, 4]],
          giraffe: [[-20, -16], [14, 8]],
          zebra: [[16, 22], [-24, 12], [2, -30]],
          rhino: [[18, -26], [30, 2]],
        }
      : {
          elephant: [[-2, -16], [-6, 10]],
          flamingo: [[-34, -24], [-38, -14], [-30, -30]],
          hippo: [[-16, -24], [-12, -2]],
        };

  for (const [species, spots] of Object.entries(spawns)) {
    const built = ANIMAL_BUILDERS[species]();
    const meta = SPECIES_META[species];
    for (let i = 0; i < spots.length; i++) {
      const [x, z] = spots[i];
      const root = built.root.clone(true);
      root.position.set(x, built.inWater ? -0.28 : 0, z);
      root.rotation.y = rand(0, Math.PI * 2);
      const scale = rand(0.9, 1.08) * (species === "flamingo" ? 0.9 : 1);
      root.scale.setScalar(scale);
      group.add(root);

      const label = makeLabelSprite(
        meta.name,
        `${meta.en.toUpperCase()} · ${meta.score} PTS`,
        meta.rarity,
      );
      label.position.set(0, meta.labelY, 0);
      label.visible = false;
      root.add(label);

      // The clone shares geometry but has its own transform. Collect the
      // cloned leg pivots, tagged in the builders, for the walk cycle.
      const legPivots = [];
      root.traverse((object) => {
        if (object.userData.isLeg) {
          legPivots.push({ pivot: object, phase: object.userData.legPhase || 0 });
        }
      });
      const animal = {
        id: `${species}-${i}`,
        species,
        meta,
        root,
        label,
        legs: legPivots,
        home: new THREE.Vector3(x, 0, z),
        radius: species === "flamingo" ? 4.5 : rand(5, 9),
        target: new THREE.Vector3(x, 0, z),
        timer: rand(1, 5),
        pause: rand(1, 5),
        speed:
          species === "elephant"
            ? 0.42
            : species === "hippo"
              ? 0.28
              : species === "flamingo"
                ? 0.3
                : species === "zebra"
                  ? 0.68
                  : 0.5,
        baseY: built.inWater ? -0.28 : 0,
        scale,
        phase: rand(0, Math.PI * 2),
        inWater: !!built.inWater,
      };
      root.userData.animal = animal;
      animals.push(animal);
    }
  }

  return { group, animals, water, waterSpec };
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

function buildRanger() {
  const root = new THREE.Group();
  const skin = mat(0xe0b184);
  const shirt = mat(0x8d8a55);
  const shirtDark = mat(0x6f6c40);
  const pants = mat(0x4a4a35);
  const boots = mat(0x3a2d20);
  const hatMat = mat(0xc8b27c);
  const packMat = mat(0x8a5f36);
  const scarf = mat(0xb4563a);

  const legPivots = [];
  for (const [x, phase] of [
    [0.17, 0],
    [-0.17, Math.PI],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.9, 0);
    root.add(pivot);
    put(pivot, new THREE.CylinderGeometry(0.11, 0.09, 0.82, 6), pants, 0, -0.41, 0);
    ball(pivot, 0.13, boots, 0, -0.84, 0.04, [1, 0.65, 1.4], 6);
    legPivots.push({ pivot, phase });
  }

  put(root, new THREE.CapsuleGeometry(0.26, 0.45, 4, 8), shirt, 0, 1.35, 0);
  box(root, 0.46, 0.12, 0.3, shirtDark, 0, 1.02, 0);
  box(root, 0.36, 0.5, 0.2, packMat, 0, 1.4, -0.3);
  box(root, 0.4, 0.14, 0.22, mat(0x6d4726), 0, 1.65, -0.31);
  const sash = box(root, 0.5, 0.1, 0.34, scarf, 0, 1.62, 0);
  sash.rotation.z = 0.18;

  const armPivots = [];
  for (const [x, phase] of [
    [0.33, Math.PI],
    [-0.33, 0],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.55, 0);
    root.add(pivot);
    put(pivot, new THREE.CylinderGeometry(0.08, 0.07, 0.66, 5), shirt, 0, -0.33, 0);
    ball(pivot, 0.08, skin, 0, -0.68, 0, [1, 1, 1], 6);
    armPivots.push({ pivot, phase });
  }

  ball(root, 0.27, skin, 0, 1.98, 0.02, [1, 1.08, 1], 10);
  ball(root, 0.065, mat(0x2a2118), 0.1, 2.02, 0.24);
  ball(root, 0.065, mat(0x2a2118), -0.1, 2.02, 0.24);
  box(root, 0.14, 0.04, 0.03, mat(0x6b3b2b), 0, 1.9, 0.27);

  const cap = new THREE.Group();
  cap.position.set(0, 2.16, 0);
  root.add(cap);
  put(cap, new THREE.CylinderGeometry(0.24, 0.27, 0.16, 8), hatMat, 0, 0, 0);
  box(cap, 0.34, 0.04, 0.22, hatMat, 0, -0.03, 0.23);
  box(cap, 0.27, 0.05, 0.05, mat(0x6d4726), 0, 0.02, 0.25);

  const explorerHat = new THREE.Group();
  explorerHat.position.set(0, 2.12, 0);
  explorerHat.visible = false;
  root.add(explorerHat);
  put(explorerHat, new THREE.CylinderGeometry(0.52, 0.58, 0.06, 12), hatMat, 0, 0, 0);
  put(explorerHat, new THREE.CylinderGeometry(0.25, 0.29, 0.28, 10), hatMat, 0, 0.15, 0);
  put(explorerHat, new THREE.CylinderGeometry(0.295, 0.3, 0.055, 10), mat(0xa9772f), 0, 0.08, 0);
  const feather = box(explorerHat, 0.04, 0.34, 0.1, mat(0xd29b43), 0.2, 0.24, -0.12);
  feather.rotation.z = -0.55;

  // Camera slung over the chest.
  box(root, 0.28, 0.2, 0.14, mat(0x292723), 0, 1.28, 0.27);
  put(root, new THREE.CylinderGeometry(0.065, 0.075, 0.12, 8), mat(0x141312), 0, 1.28, 0.38).rotation.x = Math.PI / 2;
  put(root, new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6), mat(0x141312), 0, 1.36, 0.27);

  const avatarSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeAvatarTexture("🧑‍🌾"),
      transparent: true,
      depthWrite: false,
    }),
  );
  avatarSprite.scale.set(0.66, 0.66, 1);
  avatarSprite.position.set(0, 2.95, 0);
  avatarSprite.renderOrder = 10;
  root.add(avatarSprite);

  return {
    root,
    legPivots,
    armPivots,
    avatarSprite,
    cap,
    explorerHat,
    facing: 0,
  };
}

// ---------------------------------------------------------------------------
// Scene factory
// ---------------------------------------------------------------------------

export function createSafariScene({ canvas, onNearest, onInteract, onReady }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xead6ab);
  scene.fog = new THREE.Fog(ATMOSPHERE.savanna.fog, 68, 205);

  const camera = new THREE.PerspectiveCamera(
    56,
    window.innerWidth / window.innerHeight,
    0.1,
    600,
  );
  camera.position.set(0, 5, 16);

  // Lighting
  const hemi = new THREE.HemisphereLight(ATMOSPHERE.savanna.hemiSky, ATMOSPHERE.savanna.hemiGround, 1.45);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(ATMOSPHERE.savanna.sun, 2.55);
  sun.position.set(34, 58, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  sun.shadow.camera.left = -38;
  sun.shadow.camera.right = 38;
  sun.shadow.camera.top = 38;
  sun.shadow.camera.bottom = -38;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  const skyParts = buildSky(scene);
  const clouds = buildClouds(scene);
  buildGround(scene);
  buildDistantHills(scene);
  const camp = buildCamp(scene);

  const regions = {
    savanna: buildRegion(scene, "savanna"),
    wetland: buildRegion(scene, "wetland"),
  };

  const player = buildRanger();
  scene.add(player.root);

  const selectionRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.3, 0.045, 6, 36),
    new THREE.MeshBasicMaterial({
      color: 0xe7b257,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.position.y = 0.05;
  selectionRing.visible = false;
  scene.add(selectionRing);

  const state = {
    region: "savanna",
    active: false,
    playerPos: new THREE.Vector3(5, 0, 13),
    playerVel: new THREE.Vector3(),
    playerAngle: Math.PI,
    cameraYaw: 0,
    cameraPitch: 0.34,
    cameraDist: 7.4,
    cameraShake: 0,
    nearest: null,
    time: 0,
  };

  const keys = new Set();
  const touch = { x: 0, y: 0 };
  const effects = [];
  const waterCollision = { x: regions[state.region].waterSpec.x, z: regions[state.region].waterSpec.z, r: regions[state.region].waterSpec.r * 0.92 };

  function applyRegionVisuals(region) {
    const atmosphere = ATMOSPHERE[region];
    skyParts.uniforms.topColor.value.setHex(atmosphere.top);
    skyParts.uniforms.horizonColor.value.setHex(atmosphere.horizon);
    skyParts.uniforms.bottomColor.value.setHex(atmosphere.bottom);
    scene.fog.color.setHex(atmosphere.fog);
    scene.background.setHex(atmosphere.fog);
    hemi.color.setHex(atmosphere.hemiSky);
    hemi.groundColor.setHex(atmosphere.hemiGround);
    sun.color.setHex(atmosphere.sun);
    skyParts.sun.material.color.setHex(atmosphere.sun);
    for (const [id, layer] of Object.entries(regions)) {
      layer.group.visible = id === region;
    }
    waterCollision.x = regions[region].waterSpec.x;
    waterCollision.z = regions[region].waterSpec.z;
    waterCollision.r = regions[region].waterSpec.r * 0.92;
  }

  function setRegion(region) {
    if (!regions[region]) return;
    state.region = region;
    applyRegionVisuals(region);
    state.playerPos.set(region === "savanna" ? 5 : 6, 0, region === "savanna" ? 13 : 8);
    state.cameraYaw = region === "wetland" ? 0.95 : 0;
    state.playerAngle = Math.PI + state.cameraYaw;
    state.cameraPitch = 0.34;
    state.cameraDist = window.innerWidth < 700 ? 9.4 : 7.4;
    player.root.position.copy(state.playerPos);
    player.root.rotation.y = state.playerAngle;
    state.nearest = null;
    selectionRing.visible = false;
    for (const animal of regions[region].animals) {
      animal.root.position.x = animal.home.x;
      animal.root.position.z = animal.home.z;
      animal.root.position.y = animal.baseY;
    }
    onNearest?.(null);
  }

  function setActive(active) {
    state.active = active;
    if (!active) {
      state.cameraYaw = 0.7;
      state.cameraPitch = 0.3;
    }
  }

  function setHat(equipped) {
    player.cap.visible = !equipped;
    player.explorerHat.visible = equipped;
  }

  function setAvatar(emoji) {
    player.avatarSprite.material.map.dispose();
    player.avatarSprite.material.map = makeAvatarTexture(emoji || "🧑‍🌾");
    player.avatarSprite.material.needsUpdate = true;
  }

  function setLabelVisibility(visible) {
    for (const region of Object.values(regions)) {
      for (const animal of region.animals) {
        animal.label.visible = visible;
      }
    }
  }

  function nearestAnimal() {
    let best = null;
    let bestDist = Infinity;
    for (const animal of regions[state.region].animals) {
      const dx = animal.root.position.x - state.playerPos.x;
      const dz = animal.root.position.z - state.playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < bestDist && dist <= INTERACT_RADIUS) {
        bestDist = dist;
        best = { animal, dist };
      }
    }
    return best;
  }

  function updateNearest() {
    const best = nearestAnimal();
    if (best?.animal !== state.nearest) {
      state.nearest = best?.animal || null;
      if (best) {
        const meta = best.animal.meta;
        onNearest?.({
          id: best.animal.id,
          species: best.animal.species,
          name: meta.name,
          en: meta.en,
          rarity: meta.rarity,
          score: meta.score,
          distance: best.dist,
        });
      } else {
        onNearest?.(null);
      }
    }
    if (best) {
      selectionRing.visible = true;
      selectionRing.position.x = best.animal.root.position.x;
      selectionRing.position.z = best.animal.root.position.z;
      selectionRing.position.y = best.animal.inWater ? 0.08 : 0.06;
      const pulse = 1 + Math.sin(state.time * 3.4) * 0.07;
      selectionRing.scale.set(pulse, pulse, pulse);
    } else {
      selectionRing.visible = false;
    }
  }

  function triggerInteract(action) {
    const best = nearestAnimal();
    if (!best) {
      onInteract?.(action, null);
      return;
    }
    onInteract?.(action, {
      id: best.animal.id,
      species: best.animal.species,
      name: best.animal.meta.name,
    });
  }

  // -- audio ---------------------------------------------------------------
  let audio = null;
  function ensureAudio() {
    if (!audio) {
      try {
        audio = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        audio = null;
      }
    }
    if (audio?.state === "suspended") audio.resume().catch(() => {});
    return audio;
  }

  function shutterSound() {
    const ctx = ensureAudio();
    if (!ctx) return;
    const duration = 0.12;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (t < 0.2 ? 0.9 : 0.3);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2200;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0.22;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = "square";
    click.frequency.setValueAtTime(120, ctx.currentTime);
    clickGain.gain.setValueAtTime(0.06, ctx.currentTime);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    click.connect(clickGain).connect(ctx.destination);
    click.start();
    click.stop(ctx.currentTime + 0.09);
  }

  // -- effects -------------------------------------------------------------
  function makeHeartSprite(color) {
    const canvasEl = document.createElement("canvas");
    canvasEl.width = 64;
    canvasEl.height = 64;
    const ctx = canvasEl.getContext("2d");
    ctx.font = '44px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("❤", 32, 34);
    const texture = new THREE.CanvasTexture(canvasEl);
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        color,
      }),
    );
  }

  function celebrate(animalId, text) {
    const animal =
      regions[state.region].animals.find((candidate) => candidate.id === animalId) ||
      state.nearest;
    if (!animal) return;
    const origin = animal.root.position.clone();
    origin.y += 1.2 + animal.meta.labelY * 0.25;
    for (let i = 0; i < 9; i++) {
      const sprite = makeHeartSprite(i % 2 ? 0xffd08a : 0xff8b7d);
      sprite.position.copy(origin);
      sprite.position.x += rand(-0.75, 0.75);
      sprite.position.z += rand(-0.75, 0.75);
      sprite.scale.setScalar(rand(0.3, 0.52));
      scene.add(sprite);
      effects.push({
        sprite,
        vy: rand(0.9, 1.8),
        vx: rand(-0.5, 0.5),
        vz: rand(-0.5, 0.5),
        life: rand(0.9, 1.5),
        maxLife: 1.5,
      });
    }
    if (text) {
      const canvasEl = document.createElement("canvas");
      canvasEl.width = 256;
      canvasEl.height = 128;
      const ctx = canvasEl.getContext("2d");
      ctx.font = '700 68px "Songti SC", "Noto Serif SC", serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(255, 240, 198, 1)";
      ctx.shadowColor = "rgba(80, 40, 0, 0.7)";
      ctx.shadowBlur = 12;
      ctx.fillText(text, 128, 64);
      const texture = new THREE.CanvasTexture(canvasEl);
      texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
      );
      sprite.position.copy(origin);
      sprite.position.y += 0.4;
      sprite.scale.set(2.0, 1.0, 1);
      scene.add(sprite);
      effects.push({
        sprite,
        vy: 1.1,
        vx: 0,
        vz: 0,
        life: 1.35,
        maxLife: 1.35,
        fadeOnly: true,
      });
    }
  }

  function flash() {
    shutterSound();
    state.cameraShake = 0.18;
  }

  function capture() {
    renderer.render(scene, camera);
    try {
      return canvas.toDataURL("image/jpeg", 0.82);
    } catch {
      return null;
    }
  }

  // -- input ---------------------------------------------------------------
  function isTyping() {
    const el = document.activeElement;
    return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
  }

  window.addEventListener("keydown", (event) => {
    if (isTyping() || !state.active) return;
    const key = event.key.toLowerCase();
    keys.add(key);
    if (key === "e") {
      event.preventDefault();
      triggerInteract("photo");
    } else if (key === "f") {
      event.preventDefault();
      triggerInteract("feed");
    }
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
      event.preventDefault();
    }
  });
  window.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
  });

  let dragging = false;
  let dragX = 0;
  let dragY = 0;
  let moved = 0;
  canvas.addEventListener("pointerdown", (event) => {
    if (!state.active) return;
    if (event.pointerType === "touch" && event.clientX < window.innerWidth * 0.32) return;
    dragging = true;
    dragX = event.clientX;
    dragY = event.clientY;
    moved = 0;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - dragX;
    const dy = event.clientY - dragY;
    dragX = event.clientX;
    dragY = event.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    state.cameraYaw -= dx * 0.0052;
    state.cameraPitch = clamp(state.cameraPitch + dy * 0.0042, 0.08, 1.05);
  });
  canvas.addEventListener("pointerup", () => {
    dragging = false;
  });
  canvas.addEventListener("pointercancel", () => {
    dragging = false;
  });
  canvas.addEventListener(
    "wheel",
    (event) => {
      if (!state.active) return;
      event.preventDefault();
      state.cameraDist = clamp(state.cameraDist + event.deltaY * 0.006, 3.4, 14);
    },
    { passive: false },
  );

  // Mobile joystick
  const joystick = document.getElementById("joystick");
  const knob = document.getElementById("joystick-knob");
  if (joystick && knob) {
    let joyPointer = null;
    const updateKnob = (dx, dy) => {
      const max = 34;
      const len = Math.hypot(dx, dy);
      const scale = len > max ? max / len : 1;
      const x = dx * scale;
      const y = dy * scale;
      knob.style.transform = `translate(${x}px, ${y}px)`;
      touch.x = x / max;
      touch.y = y / max;
    };
    joystick.addEventListener("pointerdown", (event) => {
      if (!state.active) return;
      event.preventDefault();
      joyPointer = event.pointerId;
      joystick.setPointerCapture(event.pointerId);
      const rect = joystick.getBoundingClientRect();
      updateKnob(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
    });
    joystick.addEventListener("pointermove", (event) => {
      if (joyPointer !== event.pointerId) return;
      const rect = joystick.getBoundingClientRect();
      updateKnob(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
    });
    const release = (event) => {
      if (joyPointer !== event.pointerId) return;
      joyPointer = null;
      knob.style.transform = "";
      touch.x = 0;
      touch.y = 0;
    };
    joystick.addEventListener("pointerup", release);
    joystick.addEventListener("pointercancel", release);
  }

  document.getElementById("touch-photo")?.addEventListener("click", () => {
    if (state.active) triggerInteract("photo");
  });
  document.getElementById("touch-feed")?.addEventListener("click", () => {
    if (state.active) triggerInteract("feed");
  });
  document.getElementById("btn-photo")?.addEventListener("click", () => {
    if (state.active) triggerInteract("photo");
  });
  document.getElementById("btn-feed")?.addEventListener("click", () => {
    if (state.active) triggerInteract("feed");
  });

  // -- animation -----------------------------------------------------------
  function animateAnimal(animal, dt) {
    animal.timer -= dt;
    const moving = animal.pause <= 0;
    if (animal.pause > 0) {
      animal.pause -= dt;
    } else {
      const dx = animal.target.x - animal.root.position.x;
      const dz = animal.target.z - animal.root.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.55 || animal.timer <= 0) {
        const angle = rand(0, Math.PI * 2);
        const radius = rand(0, animal.radius);
        animal.target.set(
          animal.home.x + Math.cos(angle) * radius,
          0,
          animal.home.z + Math.sin(angle) * radius,
        );
        animal.pause = rand(1.2, 5.5);
        animal.timer = rand(4, 9);
      } else {
        const step = animal.speed * dt;
        animal.root.position.x += (dx / dist) * step;
        animal.root.position.z += (dz / dist) * step;
        const targetAngle = Math.atan2(dx, dz);
        animal.root.rotation.y = lerpAngle(animal.root.rotation.y, targetAngle, Math.min(1, dt * 2.4));
      }
    }
    const walk = moving ? Math.sin(state.time * 6 + animal.phase) : 0;
    for (const leg of animal.legs) {
      leg.pivot.rotation.x = lerp(leg.pivot.rotation.x, walk * 0.42 * Math.sin(leg.phase + state.time * 6), Math.min(1, dt * 10));
    }
    const bob = moving ? Math.abs(Math.sin(state.time * 6 + animal.phase)) * 0.035 : Math.sin(state.time * 1.4 + animal.phase) * 0.012;
    animal.root.position.y = animal.baseY + bob * animal.scale;
    if (animal.legs.length === 0 && moving) {
      animal.root.rotation.z = Math.sin(state.time * 4 + animal.phase) * 0.02;
    } else {
      animal.root.rotation.z = lerp(animal.root.rotation.z, 0, Math.min(1, dt * 4));
    }
  }

  function updatePlayer(dt) {
    let forward = 0;
    let right = 0;
    if (keys.has("w") || keys.has("arrowup")) forward += 1;
    if (keys.has("s") || keys.has("arrowdown")) forward -= 1;
    if (keys.has("d") || keys.has("arrowright")) right += 1;
    if (keys.has("a") || keys.has("arrowleft")) right -= 1;
    forward -= touch.y;
    right += touch.x;
    const running = keys.has("shift") || Math.hypot(touch.x, touch.y) > 0.85;
    const length = Math.hypot(forward, right);
    const targetVel = new THREE.Vector3();
    if (length > 0.08) {
      forward /= Math.max(1, length);
      right /= Math.max(1, length);
      const camForward = new THREE.Vector3(-Math.sin(state.cameraYaw), 0, -Math.cos(state.cameraYaw));
      const camRight = new THREE.Vector3(Math.cos(state.cameraYaw), 0, -Math.sin(state.cameraYaw));
      targetVel.addScaledVector(camForward, forward).addScaledVector(camRight, right).normalize();
      const speed = running ? 7.4 : 4.4;
      targetVel.multiplyScalar(speed);
      state.playerAngle = Math.atan2(targetVel.x, targetVel.z);
    }
    state.playerVel.lerp(targetVel, Math.min(1, dt * 9));
    const velocity = state.playerVel;
    if (velocity.lengthSq() > 0.0004) {
      const nextX = state.playerPos.x + velocity.x * dt;
      const nextZ = state.playerPos.z + velocity.z * dt;
      const waterDist = Math.hypot(nextX - waterCollision.x, nextZ - waterCollision.z);
      const outside = Math.hypot(nextX, nextZ) <= WORLD_RADIUS;
      if (waterDist > waterCollision.r && outside) {
        state.playerPos.x = nextX;
        state.playerPos.z = nextZ;
      } else {
        // Try sliding along each axis.
        const tryX = Math.hypot(nextX - waterCollision.x, state.playerPos.z - waterCollision.z);
        if (tryX > waterCollision.r && Math.hypot(nextX, state.playerPos.z) <= WORLD_RADIUS) {
          state.playerPos.x = nextX;
        }
        const tryZ = Math.hypot(state.playerPos.x - waterCollision.x, nextZ - waterCollision.z);
        if (tryZ > waterCollision.r && Math.hypot(state.playerPos.x, nextZ) <= WORLD_RADIUS) {
          state.playerPos.z = nextZ;
        }
      }
    }
    player.root.position.x = state.playerPos.x;
    player.root.position.z = state.playerPos.z;
    player.root.position.y = Math.abs(Math.sin(state.time * (running ? 10 : 7))) * (velocity.lengthSq() > 0.4 ? 0.045 : 0);
    if (velocity.lengthSq() > 0.08) {
      player.root.rotation.y = lerpAngle(player.root.rotation.y, state.playerAngle, Math.min(1, dt * 10));
    }
    const moving = velocity.lengthSq() > 0.2;
    for (const leg of player.legPivots) {
      const swing = moving ? Math.sin(state.time * (running ? 11 : 7.5) + leg.phase) * (running ? 0.75 : 0.5) : 0;
      leg.pivot.rotation.x = lerp(leg.pivot.rotation.x, swing, Math.min(1, dt * 12));
    }
    for (const arm of player.armPivots) {
      const swing = moving ? Math.sin(state.time * (running ? 11 : 7.5) + arm.phase) * (running ? 0.65 : 0.42) : 0;
      arm.pivot.rotation.x = lerp(arm.pivot.rotation.x, swing, Math.min(1, dt * 12));
    }
  }

  function updateCamera(dt) {
    if (!state.active) {
      state.cameraYaw += dt * 0.11;
      state.cameraPitch = 0.28 + Math.sin(state.time * 0.12) * 0.04;
    }
    const target = new THREE.Vector3(
      state.playerPos.x,
      1.55,
      state.playerPos.z,
    );
    const horizontal = Math.cos(state.cameraPitch) * state.cameraDist;
    const desired = new THREE.Vector3(
      target.x + Math.sin(state.cameraYaw) * horizontal,
      target.y + Math.sin(state.cameraPitch) * state.cameraDist + 0.3,
      target.z + Math.cos(state.cameraYaw) * horizontal,
    );
    desired.y = Math.max(desired.y, 1.1);
    camera.position.lerp(desired, Math.min(1, dt * 7));
    if (state.cameraShake > 0) {
      state.cameraShake = Math.max(0, state.cameraShake - dt);
      const amount = state.cameraShake * 0.9;
      camera.position.x += rand(-amount, amount) * 0.12;
      camera.position.y += rand(-amount, amount) * 0.08;
    }
    camera.lookAt(target);
    sun.position.set(state.playerPos.x + 36, 58, state.playerPos.z + 20);
    sun.target.position.set(state.playerPos.x, 0, state.playerPos.z);
    sun.target.updateMatrixWorld();
  }

  function updateEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      effect.life -= dt;
      const sprite = effect.sprite;
      if (!effect.fadeOnly) {
        sprite.position.x += effect.vx * dt;
        sprite.position.y += effect.vy * dt;
        sprite.position.z += effect.vz * dt;
        effect.vy -= dt * 0.4;
      } else {
        sprite.position.y += effect.vy * dt;
      }
      sprite.material.opacity = clamp(effect.life / (effect.maxLife * 0.7), 0, 1);
      if (effect.life <= 0) {
        scene.remove(sprite);
        sprite.material.map?.dispose();
        sprite.material.dispose();
        effects.splice(i, 1);
      }
    }
  }

  function animateWater(region, dt) {
    const data = regions[region];
    for (const ripple of data.water.ripples) {
      ripple.userData.phase = (ripple.userData.phase + dt * 0.16) % 1;
      const t = ripple.userData.phase;
      const s = 0.4 + t * 4.2;
      ripple.scale.set(s, s, s);
      ripple.material.opacity = 0.24 * (1 - t);
    }
    data.water.water.material.opacity = 0.82 + Math.sin(state.time * 0.8) * 0.025;
  }

  const clock = new THREE.Clock();
  let readySignalled = false;
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    state.time += dt;

    if (state.active) {
      updatePlayer(dt);
      updateNearest();
    }
    for (const animal of regions[state.region].animals) {
      animateAnimal(animal, dt);
    }
    animateWater(state.region, dt);
    updateCamera(dt);
    updateEffects(dt);

    // Ambient camp animation
    camp.fireLight.intensity = 18 + Math.sin(state.time * 9) * 4 + Math.random() * 2;
    camp.flame.scale.setScalar(0.94 + Math.sin(state.time * 12) * 0.06);
    camp.beacon.material.emissiveIntensity = 1.2 + Math.sin(state.time * 2.2) * 0.9;
    camp.beaconLight.intensity = 3 + Math.sin(state.time * 2.2) * 2;
    for (const cloud of clouds.children) {
      cloud.position.x += cloud.userData.speed * dt;
      if (cloud.position.x > 165) cloud.position.x = -165;
    }

    renderer.render(scene, camera);
    if (!readySignalled) {
      readySignalled = true;
      onReady?.();
    }
  }

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  applyRegionVisuals("savanna");
  setRegion("savanna");
  player.root.position.copy(state.playerPos);
  player.root.rotation.y = Math.PI;
  setLabelVisibility(true);
  frame();

  return {
    setRegion,
    setActive,
    setHat,
    setAvatar,
    setLabelVisibility,
    triggerInteract,
    flash,
    capture,
    celebrate,
    get region() {
      return state.region;
    },
    get nearest() {
      return state.nearest;
    },
  };
}
