// Ambient traffic: cars that follow the road grid, keep to the right-hand
// lane, slow down for the car ahead, and sometimes turn at intersections.
// They never cross the canal except on its bridges, because they only ever
// travel along road lines and the bridges sit on those lines.

import { CONFIG, roadLines, canalZ } from './config.js';
import { createCarMesh } from './vehicles.js';

// Ambient traffic skews toward everyday cars: a uniform pick made the
// cometa sports car and the taxi as common as the family brisa, which
// read wrong on the street. Weights are relative, not percentages.
const MODEL_WEIGHTS = [['brisa', 4], ['faro', 3], ['tortuga', 2], ['taxi', 2], ['cometa', 1]];
const PAINTS = [0xe2483d, 0x3d7be2, 0xf2b134, 0x53a05a, 0xd8d3c3, 0x8a6fc9, 0xf28c28];

class TrafficCar {
  constructor(scene, rng, lines) {
    this.model = rng.weightedPick(MODEL_WEIGHTS);
    const built = createCarMesh(this.model, PAINTS[rng.int(0, PAINTS.length - 1)]);
    this.mesh = built.group;
    this.headLamps = built.headLamps;
    this.beam = built.beam;
    this.headlightsOn = false;
    scene.add(this.mesh);
    this.lines = lines;
    this.rng = rng;
    this.speed = 0;
    this.topSpeed = CONFIG.trafficTopSpeed * rng.range(0.75, 1.05);
    this.placeOnRandomRoad(rng);
  }

  // axis 'v': travelling along z on the vertical road x = fixed.
  // axis 'h': travelling along x on the horizontal road z = fixed.
  placeOnRandomRoad(rng) {
    const cz = canalZ();
    const usable = this.lines.filter((l) => l !== cz);
    if (rng.chance(0.5)) {
      this.axis = 'v';
      this.fixed = this.lines[rng.int(0, this.lines.length - 1)];
      this.along = rng.range(-280, 280);
    } else {
      this.axis = 'h';
      this.fixed = usable[rng.int(0, usable.length - 1)];
      this.along = rng.range(-280, 280);
    }
    this.dir = rng.chance(0.5) ? 1 : -1;
    this.speed = this.topSpeed * 0.7;
    this.syncMesh();
  }

  laneOffset() {
    // Right-hand traffic: 'v' lanes sit at fixed - dir*3, 'h' at fixed + dir*3.
    return this.axis === 'v' ? -this.dir * 3 : this.dir * 3;
  }

  get pos() { return this.mesh.position; }

  setHeadlights(on) {
    this.headlightsOn = on;
    for (const lamp of this.headLamps) lamp.material.color.setHex(on ? 0xfff2b0 : 0x555544);
    if (this.beam) this.beam.visible = on;
  }

  heading() {
    if (this.axis === 'v') return this.dir > 0 ? Math.PI : 0;
    return this.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
  }

  syncMesh() {
    if (this.axis === 'v') this.mesh.position.set(this.fixed + this.laneOffset(), 0, this.along);
    else this.mesh.position.set(this.along, 0, this.fixed + this.laneOffset());
    this.mesh.rotation.y = this.heading();
  }

  // Distance to the nearest obstacle ahead in this lane, or Infinity.
  gapAhead(others, playerCar) {
    let gap = Infinity;
    const consider = (ox, oz) => {
      if (this.axis === 'v') {
        if (Math.abs(ox - this.pos.x) > 2.4) return;
        const d = (oz - this.pos.z) * this.dir;
        if (d > 0 && d < gap) gap = d;
      } else {
        if (Math.abs(oz - this.pos.z) > 2.4) return;
        const d = (ox - this.pos.x) * this.dir;
        if (d > 0 && d < gap) gap = d;
      }
    };
    for (const o of others) if (o !== this) consider(o.pos.x, o.pos.z);
    if (playerCar) consider(playerCar.pos.x, playerCar.pos.z);
    return gap;
  }

  update(dt, others, playerCar) {
    const gap = this.gapAhead(others, playerCar);
    let target = this.topSpeed;
    if (gap < 7) target = 0;
    else if (gap < 14) target = this.topSpeed * 0.45;
    const accel = target > this.speed ? 6 : 16;
    this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), accel * dt);

    const prevAlong = this.along;
    this.along += this.dir * this.speed * dt;

    // Turning: crossing a junction line may swap the travel axis.
    for (const line of this.lines) {
      if (this.axis === 'v' && line === canalZ()) continue;
      const crossed = (prevAlong - line) * (this.along - line) <= 0 && prevAlong !== line;
      if (!crossed) continue;
      if (this.rng.chance(0.32)) {
        const oldFixed = this.fixed;
        if (this.axis === 'v') {
          this.axis = 'h';
          this.fixed = line;
          this.along = oldFixed;
        } else {
          this.axis = 'v';
          this.fixed = line;
          this.along = oldFixed;
        }
        this.dir = this.rng.chance(0.5) ? 1 : -1;
        break;
      }
    }

    if (this.along > 296 || this.along < -296) this.placeOnRandomRoad(this.rng);
    this.syncMesh();
  }
}

export class TrafficManager {
  constructor(scene, rng) {
    const lines = roadLines();
    this.cars = [];
    for (let i = 0; i < CONFIG.trafficCount; i++) this.cars.push(new TrafficCar(scene, rng, lines));
  }

  update(dt, playerCar) {
    for (const car of this.cars) car.update(dt, this.cars, playerCar);
  }

  setAllHeadlights(on) {
    for (const car of this.cars) if (car.headlightsOn !== on) car.setHeadlights(on);
  }

  all() { return this.cars; }
}
