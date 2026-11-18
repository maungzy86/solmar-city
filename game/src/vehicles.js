// Cars: boxy low-poly models built from primitives (body, cabin, wheels,
// lights), and an arcade driving model — throttle, brake/reverse, steering
// that bites harder with speed, drag, handbrake, and building collision.
// The same Vehicle class is driven by the player, by traffic AI and by the
// police; only the inputs differ.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { resolveCollisions } from './city.js';

const BODY_SHAPES = {
  cometa: { w: 1.9, l: 4.4, bodyH: 0.55, cabinL: 1.9, cabinH: 0.5, cabinBack: -0.2 },
  brisa: { w: 1.85, l: 4.5, bodyH: 0.62, cabinL: 2.2, cabinH: 0.55, cabinBack: -0.1 },
  tortuga: { w: 2.05, l: 5.0, bodyH: 1.15, cabinL: 4.2, cabinH: 0.75, cabinBack: 0.25 },
  faro: { w: 2.0, l: 4.9, bodyH: 0.8, cabinL: 1.7, cabinH: 0.6, cabinBack: -0.95 },
  taxi: { w: 1.85, l: 4.5, bodyH: 0.62, cabinL: 2.2, cabinH: 0.55, cabinBack: -0.1 },
  police: { w: 1.9, l: 4.6, bodyH: 0.62, cabinL: 2.1, cabinH: 0.55, cabinBack: -0.1 },
};

const glassMat = new THREE.MeshLambertMaterial({ color: 0x223842 });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
const hubMat = new THREE.MeshLambertMaterial({ color: 0xb9c0c4 });

export function createCarMesh(modelKey, colorOverride) {
  const spec = CONFIG.carModels[modelKey];
  const shape = BODY_SHAPES[modelKey] || BODY_SHAPES.brisa;
  const color = colorOverride !== undefined ? colorOverride : spec.color;
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });

  const body = new THREE.Mesh(new THREE.BoxGeometry(shape.w, shape.bodyH, shape.l), paint);
  body.position.y = 0.35 + shape.bodyH / 2;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(shape.w - 0.3, shape.cabinH, shape.cabinL), glassMat);
  cabin.position.set(0, 0.35 + shape.bodyH + shape.cabinH / 2 - 0.05, shape.cabinBack);
  cabin.castShadow = true;
  group.add(cabin);

  if (modelKey === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0xffe27a }));
    sign.position.set(0, 0.35 + shape.bodyH + shape.cabinH + 0.08, shape.cabinBack);
    group.add(sign);
  }
  if (modelKey === 'police') {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.34), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.34), new THREE.MeshBasicMaterial({ color: 0x2e6bff }));
    blue.position.x = 0.3;
    bar.add(red); bar.add(blue);
    bar.position.set(0, 0.35 + shape.bodyH + shape.cabinH + 0.06, shape.cabinBack);
    group.add(bar);
    group.userData.lightBar = bar;
  }

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = {};
  const wheelPos = {
    fl: [-shape.w / 2, -shape.l / 2 + 0.95], fr: [shape.w / 2, -shape.l / 2 + 0.95],
    rl: [-shape.w / 2, shape.l / 2 - 0.95], rr: [shape.w / 2, shape.l / 2 - 0.95],
  };
  for (const [key, [x, z]] of Object.entries(wheelPos)) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.36, z);
    const tyre = new THREE.Mesh(wheelGeo, tyreMat);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.28, 8).rotateZ(Math.PI / 2), hubMat);
    pivot.add(tyre); pivot.add(hub);
    group.add(pivot);
    wheels[key] = pivot;
  }

  const lampMat = new THREE.MeshBasicMaterial({ color: 0x555544 });
  const lampGeo = new THREE.BoxGeometry(0.34, 0.16, 0.06);
  const headLamps = [];
  for (const sx of [-1, 1]) {
    const lamp = new THREE.Mesh(lampGeo, lampMat.clone());
    lamp.position.set(sx * (shape.w / 2 - 0.3), 0.62, -shape.l / 2 - 0.02);
    group.add(lamp);
    headLamps.push(lamp);
    const tail = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0x661111 }));
    tail.position.set(sx * (shape.w / 2 - 0.3), 0.66, shape.l / 2 + 0.02);
    group.add(tail);
  }

  // Damage smoke puff, shown when the car is beaten up.
  const smoke = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 7, 6),
    new THREE.MeshLambertMaterial({ color: 0x555555, transparent: true, opacity: 0.55 }),
  );
  smoke.position.set(0, 1.5, -shape.l / 2 + 0.6);
  smoke.visible = false;
  group.add(smoke);

  return { group, wheels, headLamps, smoke, shape };
}

export class Vehicle {
  constructor(scene, modelKey, x, z, heading, colorOverride) {
    const spec = CONFIG.carModels[modelKey];
    this.modelKey = modelKey;
    this.name = spec.name;
    this.topSpeed = spec.topSpeed;
    this.accelMul = spec.accelMul;
    const built = createCarMesh(modelKey, colorOverride);
    this.mesh = built.group;
    this.wheels = built.wheels;
    this.headLamps = built.headLamps;
    this.smoke = built.smoke;
    this.mesh.position.set(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.health = CONFIG.car.health;
    this.occupied = false;
    this.headlightsOn = false;
    this.wheelSpin = 0;
    this.crashCooldown = 0;
    scene.add(this.mesh);
    this.syncMesh();
  }

  get pos() { return this.mesh.position; }
  forward() { return { x: -Math.sin(this.heading), z: -Math.cos(this.heading) }; }

  setHeadlights(on) {
    this.headlightsOn = on;
    for (const lamp of this.headLamps) lamp.material.color.setHex(on ? 0xfff2b0 : 0x555544);
  }

  // One physics step. input: {throttle: -1..1, steer: -1..1, handbrake}.
  // Returns the impact speed of a fresh crash this step, or 0.
  step(dt, input, colliders, bounds) {
    const C = CONFIG.car;
    const before = this.speed;
    if (input.throttle > 0) {
      this.speed += C.accel * this.accelMul * input.throttle * dt;
    } else if (input.throttle < 0) {
      if (this.speed > 0.5) this.speed -= C.brake * dt;
      else this.speed += C.accel * 0.6 * input.throttle * dt;
    }
    const dragK = input.handbrake ? 2.6 : C.drag;
    this.speed -= this.speed * dragK * dt;
    if (input.handbrake) this.speed -= Math.sign(this.speed) * 9 * dt;
    this.speed = Math.max(-C.reverseTop, Math.min(this.topSpeed, this.speed));
    if (Math.abs(this.speed) < 0.04 && input.throttle === 0) this.speed = 0;

    const speedRatio = Math.min(1, Math.abs(this.speed) / 12);
    const steerDir = this.speed >= 0 ? 1 : -1;
    this.heading -= input.steer * C.gripTurn * speedRatio * steerDir * dt * (input.handbrake ? 1.5 : 1);

    const startX = this.pos.x;
    const startZ = this.pos.z;
    const f = this.forward();
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;

    resolveCollisions(this.pos, C.radius, colliders);
    this.pos.x = Math.max(bounds.minX, Math.min(bounds.maxX, this.pos.x));
    this.pos.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, this.pos.z));

    let impact = 0;
    const moved = Math.hypot(this.pos.x - startX, this.pos.z - startZ);
    const expected = Math.abs(this.speed) * dt;
    this.crashCooldown -= dt;
    if (expected > 0.02 && moved < expected * 0.35 && Math.abs(before) > 6 && this.crashCooldown <= 0) {
      impact = Math.abs(before);
      this.health = Math.max(0, this.health - impact * 1.1);
      this.speed = -before * 0.22;
      this.crashCooldown = 0.5;
    } else if (expected > 0.02 && moved < expected * 0.6) {
      this.speed *= 0.55;
    }

    // Wheels: front pair steers, all four spin with travel.
    this.wheelSpin += (this.speed * dt) / 0.36;
    for (const key of ['fl', 'fr']) this.wheels[key].rotation.y = -input.steer * 0.42;
    for (const key of ['fl', 'fr', 'rl', 'rr']) {
      this.wheels[key].children[0].rotation.x = this.wheelSpin;
      this.wheels[key].children[1].rotation.x = this.wheelSpin;
    }
    this.smoke.visible = this.health < 35;
    if (this.smoke.visible) {
      const s = 0.8 + Math.sin(performance.now() * 0.01) * 0.25;
      this.smoke.scale.setScalar(s);
    }
    this.syncMesh();
    return impact;
  }

  syncMesh() {
    this.mesh.rotation.y = this.heading;
  }
}

export class VehicleManager {
  constructor(scene, world) {
    this.cars = [];
    for (const s of world.spawnPoints.cars) {
      this.cars.push(new Vehicle(scene, s.model, s.x, s.z, s.heading));
    }
  }

  nearest(pos, range) {
    let best = null;
    let bestD = range;
    for (const car of this.cars) {
      const d = Math.hypot(car.pos.x - pos.x, car.pos.z - pos.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  all() { return this.cars; }
}
