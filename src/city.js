// Procedural Solmar Bay: an 8x8 grid of blocks in four districts (Downtown
// towers north-east, Old Town north-west, the Marina south-west, Beachfront
// south-east), a palm-lined beach and ocean to the south, a canal with
// bridges cutting across the north, and a fountain plaza at the centre.
// Everything is drawn from boxes, planes and canvas-painted facades — no
// external images. Buildings register axis-aligned colliders that the
// player, cars and crowds all collide with.

import * as THREE from 'three';
import { CONFIG, roadLines, canalZ } from './config.js';

const FACADE_COLORS = [0xf2d5a0, 0xe8a87c, 0xdfe8ec, 0xf5efe0, 0xcfe0d8, 0xf0b8a0, 0xbcd3e8, 0xe6d7f0];

// Paint one building facade on an offscreen canvas: base colour, a grid of
// windows (some lit by the low sun), and a shopfront band at street level.
function facadeTexture(rng, baseHex, floors, litRatio) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  const base = new THREE.Color(baseHex);
  g.fillStyle = `#${base.getHexString()}`;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, 226, 128, 30);
  const rows = Math.max(3, floors);
  const rh = 226 / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < 4; col++) {
      const lit = rng.chance(litRatio);
      g.fillStyle = lit ? 'rgba(255,214,130,0.95)' : 'rgba(38,58,74,0.9)';
      g.fillRect(10 + col * 30, 8 + r * rh, 18, rh - 12);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(10 + col * 30, 8 + r * rh, 18, 3);
    }
    if (rng.chance(0.5)) { // balcony rail
      g.fillStyle = 'rgba(60,50,40,0.5)';
      g.fillRect(4, 8 + r * rh + rh - 10, 120, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function palmTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 256);
  g.strokeStyle = '#8a6844';
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(58, 256);
  g.quadraticCurveTo(64, 170, 66, 96);
  g.stroke();
  g.strokeStyle = '#3f9e4d';
  g.lineWidth = 6;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * (0.08 + i * 0.14);
    g.beginPath();
    g.moveTo(66, 96);
    g.quadraticCurveTo(66 + Math.cos(a) * 34, 96 + Math.sin(a) * 30 - 14, 66 + Math.cos(a) * 58, 96 + Math.sin(a) * 52 + 16);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const lines = roadLines();
  const cz = canalZ();
  const C = CONFIG;

  // --- light: warm late-afternoon sun + soft sky fill -------------------
  const sun = new THREE.DirectionalLight(C.colors.sun, 2.6);
  sun.position.set(-140, 190, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -320; sun.shadow.camera.right = 320;
  sun.shadow.camera.top = 320; sun.shadow.camera.bottom = -320;
  sun.shadow.camera.far = 700;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfe3f2, 0x8a6f4d, 0.95));

  // --- ground, roads, beach, ocean --------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshLambertMaterial({ color: C.colors.sand }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 60;
  ground.receiveShadow = true;
  scene.add(ground);

  const asphalt = new THREE.MeshLambertMaterial({ color: C.colors.asphalt });
  const roadGeoV = new THREE.PlaneGeometry(C.roadWidth, C.cityHalf * 2 + C.roadWidth);
  const roadGeoH = new THREE.PlaneGeometry(C.cityHalf * 2 + C.roadWidth, C.roadWidth);
  for (const x of lines) {
    const r = new THREE.Mesh(roadGeoV, asphalt);
    r.rotation.x = -Math.PI / 2;
    r.position.set(x, 0.02, 0);
    r.receiveShadow = true;
    scene.add(r);
  }
  for (const z of lines) {
    if (z === cz) continue; // the canal replaces this road
    const r = new THREE.Mesh(roadGeoH, asphalt);
    r.rotation.x = -Math.PI / 2;
    r.position.set(0, 0.02, z);
    r.receiveShadow = true;
    scene.add(r);
  }

  // Centre dashes as one instanced mesh.
  const dashGeo = new THREE.BoxGeometry(0.35, 0.04, 3.2);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf7e8b0 });
  const dashCount = 9 * 68 * 2;
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  const m4 = new THREE.Matrix4();
  let di = 0;
  for (const x of lines) {
    for (let z = -C.cityHalf + 4; z < C.cityHalf && di < dashCount; z += 8.5) {
      if (Math.abs(z - cz) < 8) continue;
      m4.makeTranslation(x, 0.05, z);
      dashes.setMatrixAt(di++, m4);
    }
  }
  for (const z of lines) {
    if (z === cz) continue;
    for (let x = -C.cityHalf + 4; x < C.cityHalf && di < dashCount; x += 8.5) {
      m4.makeRotationY(Math.PI / 2);
      m4.setPosition(x, 0.05, z);
      dashes.setMatrixAt(di++, m4);
    }
  }
  dashes.count = di;
  scene.add(dashes);

  // Ocean: a big plane south of the beach, plus the canal water strip.
  const seaMat = new THREE.MeshLambertMaterial({ color: C.colors.sea });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(1400, 500), seaMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.15, C.oceanZ + 240);
  scene.add(ocean);
  const canal = new THREE.Mesh(new THREE.PlaneGeometry(C.cityHalf * 2 + 40, C.roadWidth + 2), new THREE.MeshLambertMaterial({ color: 0x2b7d92 }));
  canal.rotation.x = -Math.PI / 2;
  canal.position.set(0, -0.1, cz);
  scene.add(canal);

  // Bridges over the canal at every north-south road, and bank colliders
  // between them so the water can only be crossed on a bridge.
  const deckMat = new THREE.MeshLambertMaterial({ color: 0x9c8f7a });
  const sortedX = [...lines].sort((a, b) => a - b);
  for (let k = 0; k < sortedX.length; k++) {
    const x = sortedX[k];
    const deck = new THREE.Mesh(new THREE.BoxGeometry(11, 0.5, C.roadWidth + 7), deckMat);
    deck.position.set(x, 0.28, cz);
    deck.castShadow = true;
    deck.receiveShadow = true;
    scene.add(deck);
    const nextX = sortedX[k + 1];
    if (nextX !== undefined) {
      const midX = (x + nextX) / 2;
      const segW = (nextX - x) / 2 - 6;
      for (const side of [-1, 1]) {
        colliders.push({ minX: midX - segW, maxX: midX + segW, minZ: cz + side * 6.4 - 1.2, maxZ: cz + side * 6.4 + 1.2 });
      }
    }
  }

  // --- blocks: sidewalks, buildings, plaza -------------------------------
  const facades = FACADE_COLORS.map((col, i) => new THREE.MeshLambertMaterial({ map: facadeTexture(rng, col, 6 + i, 0.35) }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6e5a49 });
  const walkMat = new THREE.MeshLambertMaterial({ color: C.colors.sidewalk });
  const plazaMat = new THREE.MeshLambertMaterial({ color: C.colors.plaza });
  const walkGeo = new THREE.BoxGeometry(C.blockSize + 3, 0.24, C.blockSize + 3);
  const isPlaza = (i, j) => (i === 3 || i === 4) && (j === 3 || j === 4);

  for (let i = 0; i < C.blocksPerSide; i++) {
    for (let j = 0; j < C.blocksPerSide; j++) {
      const x0 = -C.cityHalf + i * C.pitch + C.roadWidth / 2;
      const z0 = -C.cityHalf + j * C.pitch + C.roadWidth / 2;
      const cx = x0 + C.blockSize / 2;
      const czz = z0 + C.blockSize / 2;
      const plaza = isPlaza(i, j);
      const pad = new THREE.Mesh(walkGeo, plaza ? plazaMat : walkMat);
      pad.position.set(cx, 0.12, czz);
      pad.receiveShadow = true;
      scene.add(pad);
      if (plaza) continue;

      const north = j <= 2;
      const east = i >= 4;
      const downtown = north && east;
      const oldTown = north && !east;
      // Lots: downtown gets one tower, other districts 2-4 smaller buildings.
      const lots = downtown
        ? [{ dx: 0, dz: 0, w: 44, d: 44 }]
        : [
            { dx: -15, dz: -15, w: 24, d: 24 }, { dx: 15, dz: -15, w: 24, d: 24 },
            { dx: -15, dz: 15, w: 24, d: 24 }, { dx: 15, dz: 15, w: 24, d: 24 },
          ].filter(() => rng.chance(0.72));
      for (const lot of lots) {
        const h = downtown ? rng.range(26, 54) : oldTown ? rng.range(8, 17) : rng.range(9, 23);
        const mat = facades[rng.int(0, facades.length - 1)];
        const b = new THREE.Mesh(new THREE.BoxGeometry(lot.w, h, lot.d), mat);
        b.position.set(cx + lot.dx, h / 2 + 0.24, czz + lot.dz);
        b.castShadow = true;
        b.receiveShadow = true;
        scene.add(b);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(lot.w + 1.5, 0.7, lot.d + 1.5), roofMat);
        roof.position.set(cx + lot.dx, h + 0.55, czz + lot.dz);
        roof.castShadow = true;
        scene.add(roof);
        if (rng.chance(0.5)) {
          const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3.4, 8), roofMat);
          tank.position.set(cx + lot.dx + rng.range(-8, 8), h + 2.4, czz + lot.dz + rng.range(-8, 8));
          tank.castShadow = true;
          scene.add(tank);
        }
        colliders.push({
          minX: cx + lot.dx - lot.w / 2, maxX: cx + lot.dx + lot.w / 2,
          minZ: czz + lot.dz - lot.d / 2, maxZ: czz + lot.dz + lot.d / 2,
        });
      }
    }
  }

  // Plaza fountain (centre block) — a low cylinder with a water disc.
  const fountain = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.6, 1.4, 20), new THREE.MeshLambertMaterial({ color: 0xb8a888 }));
  fountain.position.set(0, 0.7, 0);
  fountain.castShadow = true;
  scene.add(fountain);
  const fwater = new THREE.Mesh(new THREE.CircleGeometry(6.4, 20), new THREE.MeshLambertMaterial({ color: 0x3fa7bd }));
  fwater.rotation.x = -Math.PI / 2;
  fwater.position.set(0, 1.42, 0);
  scene.add(fwater);
  colliders.push({ minX: -7.6, maxX: 7.6, minZ: -7.6, maxZ: 7.6 });

  // --- palms (crossed textured planes), lamps, traffic lights ------------
  const palmTex = palmTexture();
  const palmMat = new THREE.MeshLambertMaterial({ map: palmTex, alphaTest: 0.45, side: THREE.DoubleSide });
  const palmGeo = new THREE.PlaneGeometry(9, 13);
  function palm(x, z, s) {
    const grp = new THREE.Group();
    for (const rot of [0, Math.PI / 2]) {
      const p = new THREE.Mesh(palmGeo, palmMat);
      p.rotation.y = rot;
      p.position.y = 6.2;
      p.castShadow = true;
      grp.add(p);
    }
    grp.position.set(x, 0, z);
    grp.scale.setScalar(s);
    scene.add(grp);
  }
  for (let x = -280; x <= 280; x += 24) palm(x + rng.range(-3, 3), 306 + rng.range(-2, 4), rng.range(0.85, 1.2));
  for (let k = 0; k < 26; k++) {
    const side = rng.chance(0.5) ? -1 : 1;
    const along = lines[rng.int(0, lines.length - 1)];
    const off = rng.range(-280, 280);
    if (rng.chance(0.5)) palm(along + side * 9.5, off, rng.range(0.8, 1.05));
    else palm(off, along + side * 9.5, rng.range(0.8, 1.05));
  }

  const poleGeo = new THREE.CylinderGeometry(0.16, 0.2, 6.4, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x445055 });
  const headGeo = new THREE.SphereGeometry(0.42, 8, 6);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffe6a3 });
  const lampSpots = [];
  for (const x of lines) for (const z of lines) if ((Math.round(x + z) / 72) % 2 === 0) lampSpots.push([x + 7.5, z + 7.5]);
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
  lampSpots.forEach(([x, z], idx) => {
    m4.makeTranslation(x, 3.2, z);
    poles.setMatrixAt(idx, m4);
    m4.makeTranslation(x, 6.5, z);
    heads.setMatrixAt(idx, m4);
  });
  scene.add(poles);
  scene.add(heads);

  // --- pier and marina ----------------------------------------------------
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 0.6, 64), woodMat);
  pier.position.set(-120, 0.5, C.oceanZ + 26);
  pier.castShadow = true;
  scene.add(pier);
  const hullCols = [0xe2483d, 0xf2f2f2, 0x3d7be2, 0xf2b134, 0x53a05a];
  for (let bIdx = 0; bIdx < 6; bIdx++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.4, 10), new THREE.MeshLambertMaterial({ color: hullCols[bIdx % hullCols.length] }));
    hull.position.y = 0.4;
    boat.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 3.6), new THREE.MeshLambertMaterial({ color: 0xf5efe0 }));
    cabin.position.set(0, 1.7, -0.6);
    boat.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 7, 5), poleMat);
    mast.position.set(0, 4.4, 1.6);
    boat.add(mast);
    boat.position.set(-252 + bIdx * 17, 0, 344 + (bIdx % 2) * 14);
    boat.rotation.y = rng.range(-0.2, 0.2);
    scene.add(boat);
  }

  // Parked-car spawn points along the avenues (used by vehicles.js) and the
  // player's start, on the plaza's south sidewalk.
  const carSpawns = [];
  const spawnDefs = [
    [-282, -60, 0], [-138, 30, 1], [-60, -282, 2], [30, 138, 3], [138, -30, 0],
    [282, 60, 1], [66, 282, 2], [-282, 210, 3], [210, -282, 0], [-30, -138, 1],
    [282, -210, 2], [-210, 282, 3], [60, 66, 0], [-66, -60, 1],
  ];
  const models = ['cometa', 'brisa', 'tortuga', 'faro', 'taxi'];
  spawnDefs.forEach(([x, z, lane], idx) => {
    carSpawns.push({ x, z, heading: (lane % 2 === 0 ? 0 : Math.PI) + (idx % 3 === 0 ? Math.PI / 2 : 0), model: models[idx % models.length] });
  });

  return {
    colliders,
    roads: lines,
    spawnPoints: { player: { x: 12, z: 62 }, cars: carSpawns },
    bounds: { minX: -300, maxX: 300, minZ: -300, maxZ: 322 },
  };
}

// Push a circle (x/z position + radius) out of every AABB collider it
// overlaps. Shared by the player, cars, traffic, pedestrians and police.
export function resolveCollisions(pos, radius, colliders) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = nx + (dx / d) * radius;
      pos.z = nz + (dz / d) * radius;
    } else {
      // Centre inside the box: leave by the shallowest side.
      const left = pos.x - c.minX;
      const right = c.maxX - pos.x;
      const top = pos.z - c.minZ;
      const bottom = c.maxZ - pos.z;
      const m = Math.min(left, right, top, bottom);
      if (m === left) pos.x = c.minX - radius;
      else if (m === right) pos.x = c.maxX + radius;
      else if (m === top) pos.z = c.minZ - radius;
      else pos.z = c.maxZ + radius;
    }
  }
  return pos;
}
