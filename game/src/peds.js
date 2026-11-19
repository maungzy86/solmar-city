// Pedestrians: simple box figures who stroll the sidewalks between random
// corners, panic and run when a car bears down on them or a punch lands
// nearby, and fall over when a car actually hits them (the game is told, so
// it can raise the wanted level when the player is to blame).

import * as THREE from 'three';
import { CONFIG, roadLines } from './config.js';
import { resolveCollisions } from './city.js';

const SHIRTS = [0xe2725b, 0x5b8dd9, 0xf2d16b, 0x7bc47f, 0xd96bb0, 0xf5efe0, 0x64b6ac];

function buildFigure(shirtColor) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xb97e56 });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const legs = new THREE.MeshLambertMaterial({ color: 0x3a4152 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), shirt);
  torso.position.y = 1.06;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.38), skin);
  head.position.y = 1.64;
  g.add(head);
  const legGeo = new THREE.BoxGeometry(0.2, 0.72, 0.24);
  legGeo.translate(0, -0.32, 0);
  const legL = new THREE.Mesh(legGeo, legs);
  legL.position.set(-0.16, 0.72, 0);
  g.add(legL);
  const legR = new THREE.Mesh(legGeo, legs);
  legR.position.set(0.16, 0.72, 0);
  g.add(legR);
  return { group: g, legL, legR };
}

export class Pedestrian {
  constructor(scene, rng) {
    const built = buildFigure(SHIRTS[rng.int(0, SHIRTS.length - 1)]);
    this.group = built.group;
    this.legL = built.legL;
    this.legR = built.legR;
    this.rng = rng;
    this.lines = roadLines();
    this.group.position.set(rng.range(-260, 260), 0, rng.range(-260, 260));
    scene.add(this.group);
    this.heading = rng.range(0, Math.PI * 2);
    this.target = null;
    this.state = 'walk'; // walk | flee | down | stumble
    this.stateTimer = 0;
    this.phase = rng.range(0, 6);
    this.hitsTaken = 0;      // punches absorbed before the next fall
    this.slide = { x: 0, z: 0 }; // knockback velocity from a shove
    this.pickTarget();
  }

  get pos() { return this.group.position; }

  pickTarget() {
    // A point on a sidewalk: beside a random road, anywhere along it.
    const line = this.lines[this.rng.int(0, this.lines.length - 1)];
    const side = this.rng.chance(0.5) ? -1 : 1;
    const along = this.rng.range(-282, 282);
    if (this.rng.chance(0.5)) this.target = { x: line + side * 9.6, z: along };
    else this.target = { x: along, z: line + side * 9.6 };
  }

  scare(fromPos, seconds = 3) {
    if (this.state === 'down' || this.state === 'stumble') return;
    this.state = 'flee';
    this.stateTimer = seconds;
    this.fleeFrom = { x: fromPos.x, z: fromPos.z };
  }

  knockDown() {
    this.state = 'down';
    this.stateTimer = 4;
    this.hitsTaken = 0;
    this.group.rotation.x = -Math.PI / 2;
    this.group.rotation.z = 0;
    this.group.position.y = 0.25;
  }

  // A punch that connects: the first one staggers the pedestrian (they
  // wobble, then run), a second one while staggered puts them down.
  // Returns 'stumble' or 'down' so the caller can score the hit.
  stumble(fromPos) {
    if (this.state === 'down') return 'down';
    this.hitsTaken++;
    if (this.state === 'stumble' || this.hitsTaken >= 2) {
      this.knockDown();
      return 'down';
    }
    this.state = 'stumble';
    this.stateTimer = 0.85;
    this.fleeFrom = { x: fromPos.x, z: fromPos.z };
    return 'stumble';
  }

  // A two-handed shove: down immediately, with a knockback slide away
  // from whoever pushed. Non-graphic — they sit up and run off after.
  shove(fromPos) {
    const dx = this.pos.x - fromPos.x;
    const dz = this.pos.z - fromPos.z;
    const len = Math.hypot(dx, dz) || 1;
    this.slide.x = (dx / len) * 7.5;
    this.slide.z = (dz / len) * 7.5;
    this.knockDown();
    return 'down';
  }

  update(dt, world, threats) {
    this.stateTimer -= dt;
    // Knockback slide (from a shove) applies in every state and decays.
    if (this.slide.x !== 0 || this.slide.z !== 0) {
      this.pos.x += this.slide.x * dt;
      this.pos.z += this.slide.z * dt;
      const decay = Math.max(0, 1 - dt * 5);
      this.slide.x *= decay;
      this.slide.z *= decay;
      if (Math.abs(this.slide.x) < 0.05 && Math.abs(this.slide.z) < 0.05) { this.slide.x = 0; this.slide.z = 0; }
      resolveCollisions(this.pos, 0.4, world.colliders);
    }
    if (this.state === 'down') {
      if (this.stateTimer <= 0) {
        this.state = 'flee';
        this.stateTimer = 2.5;
        this.fleeFrom = { x: this.pos.x + 5, z: this.pos.z };
        this.group.rotation.x = 0;
        this.group.position.y = 0;
      }
      return;
    }
    if (this.state === 'stumble') {
      // Wobble in place, arms up, then bolt when the timer runs out.
      this.group.rotation.z = Math.sin(this.phase * 6) * 0.22;
      this.phase += dt * 3;
      if (this.stateTimer <= 0) {
        this.group.rotation.z = 0;
        this.state = 'flee';
        this.stateTimer = 3;
      }
      return;
    }
    // React to fast cars bearing down.
    for (const t of threats) {
      const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      if (d < 5 && Math.abs(t.speed) > 7) this.scare(t.pos, 2.5);
    }

    let speed = 2.1;
    let tx;
    let tz;
    if (this.state === 'flee') {
      speed = 6.4;
      tx = this.pos.x + (this.pos.x - this.fleeFrom.x);
      tz = this.pos.z + (this.pos.z - this.fleeFrom.z);
      if (this.stateTimer <= 0) { this.state = 'walk'; this.pickTarget(); }
    } else {
      if (!this.target || Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 1.6) this.pickTarget();
      tx = this.target.x;
      tz = this.target.z;
    }
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    this.heading = Math.atan2(-(dx / len), -(dz / len));
    this.pos.x += (dx / len) * speed * dt;
    this.pos.z += (dz / len) * speed * dt;
    resolveCollisions(this.pos, 0.4, world.colliders);
    this.pos.x = Math.max(world.bounds.minX, Math.min(world.bounds.maxX, this.pos.x));
    this.pos.z = Math.max(world.bounds.minZ, Math.min(world.bounds.maxZ - 6, this.pos.z));
    this.phase += dt * (this.state === 'flee' ? 12 : 7);
    const swing = Math.sin(this.phase) * 0.5;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.group.rotation.y = this.heading;
  }
}

export class PedestrianManager {
  constructor(scene, rng) {
    this.peds = [];
    for (let i = 0; i < CONFIG.pedCount; i++) this.peds.push(new Pedestrian(scene, rng));
  }

  // Check car-vs-pedestrian contact. onHit(ped, car) fires once per knockdown.
  checkCarHits(cars, onHit) {
    for (const ped of this.peds) {
      if (ped.state === 'down') continue;
      for (const car of cars) {
        const d = Math.hypot(car.pos.x - ped.pos.x, car.pos.z - ped.pos.z);
        if (d < 1.5 && Math.abs(car.speed) > 3.5) {
          ped.knockDown();
          onHit(ped, car);
          break;
        }
      }
    }
  }

  scareNear(pos, radius) {
    for (const ped of this.peds) {
      if (Math.hypot(ped.pos.x - pos.x, ped.pos.z - pos.z) < radius) ped.scare(pos, 3);
    }
  }

  update(dt, world, threats) {
    for (const ped of this.peds) ped.update(dt, world, threats);
  }

  all() { return this.peds; }
}
