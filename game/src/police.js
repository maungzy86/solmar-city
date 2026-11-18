// The Solmar Bay PD: interceptor cars that answer the wanted level. More
// stars means more cars. They navigate the road grid — a breadth-first
// route over the intersections (the canal row has no east-west road, but
// every north-south road crosses it on a bridge) — and switch to a direct
// chase for the last stretch. On foot they hold a ring around the player,
// which is what lets the bust meter in main.js fill.

import { CONFIG, roadLines } from './config.js';
import { Vehicle } from './vehicles.js';

export class PoliceManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.cops = [];
    this.lines = roadLines();
    this.spawnCooldown = 0;
  }

  desiredCops(stars) {
    return Math.max(0, Math.min(5, stars));
  }

  nearestNode(pos) {
    let bi = 0;
    let bj = 0;
    let bd = Infinity;
    for (let i = 0; i < this.lines.length; i++) {
      for (let j = 0; j < this.lines.length; j++) {
        const d = Math.hypot(this.lines[i] - pos.x, this.lines[j] - pos.z);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    return { i: bi, j: bj };
  }

  // Breadth-first route over intersections from node a to node b, returned
  // as a list of world points (excluding a itself, including b).
  route(a, b) {
    const key = (i, j) => i * 16 + j;
    const prev = new Map();
    const seen = new Set([key(a.i, a.j)]);
    const queue = [a];
    const canalRow = CONFIG.canalRow;
    while (queue.length) {
      const cur = queue.shift();
      if (cur.i === b.i && cur.j === b.j) break;
      const nexts = [];
      if (cur.j !== canalRow) { // east-west travel is impossible on the canal row
        nexts.push({ i: cur.i - 1, j: cur.j }, { i: cur.i + 1, j: cur.j });
      }
      nexts.push({ i: cur.i, j: cur.j - 1 }, { i: cur.i, j: cur.j + 1 });
      for (const n of nexts) {
        if (n.i < 0 || n.j < 0 || n.i >= this.lines.length || n.j >= this.lines.length) continue;
        const k = key(n.i, n.j);
        if (seen.has(k)) continue;
        seen.add(k);
        prev.set(k, cur);
        queue.push(n);
      }
    }
    const points = [];
    let cur = b;
    const startKey = key(a.i, a.j);
    while (cur && key(cur.i, cur.j) !== startKey) {
      points.unshift({ x: this.lines[cur.i], z: this.lines[cur.j] });
      cur = prev.get(key(cur.i, cur.j));
    }
    return points;
  }

  spawnCop(playerPos) {
    // Appear at a road intersection a good distance from the player.
    let best = null;
    let bestScore = -1;
    for (const x of this.lines) {
      for (const z of this.lines) {
        const d = Math.hypot(x - playerPos.x, z - playerPos.z);
        const score = -Math.abs(d - 95) + Math.random() * 12;
        if (d > 55 && score > bestScore) { bestScore = score; best = { x, z }; }
      }
    }
    if (!best) best = { x: 216, z: 216 };
    const cop = new Vehicle(this.scene, 'police', best.x, best.z, Math.random() * Math.PI * 2);
    cop.navRoute = [];
    cop.navIdx = 0;
    cop.replan = 0;
    cop.stuckFor = 0;
    cop.reverseFor = 0;
    this.cops.push(cop);
    return cop;
  }

  // Steer one cop toward an aim point; returns the step's impact.
  driveToward(cop, aim, dt, stopAt) {
    const dx = aim.x - cop.pos.x;
    const dz = aim.z - cop.pos.z;
    const dist = Math.hypot(dx, dz);
    const desired = Math.atan2(-dx, -dz);
    let diff = desired - cop.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    let steer = Math.max(-1, Math.min(1, -diff * 1.7));
    let throttle;
    if (cop.reverseFor > 0) {
      cop.reverseFor -= dt;
      throttle = -1;
      steer = -steer;
    } else if (dist > stopAt + 1.5) {
      throttle = Math.abs(diff) > 2.2 ? -0.4 : 1;
    } else if (dist < stopAt - 1.5) {
      throttle = -0.5;
    } else {
      throttle = 0;
    }
    const impact = cop.step(dt, { throttle, steer, handbrake: false }, this.world.colliders, this.world.bounds);
    // Stuck against a wall? Back out briefly and try again.
    if (throttle > 0 && Math.abs(cop.speed) < 0.6) {
      cop.stuckFor += dt;
      if (cop.stuckFor > 1.6) { cop.reverseFor = 0.8; cop.stuckFor = 0; }
    } else {
      cop.stuckFor = 0;
    }
    return impact;
  }

  update(dt, game) {
    const stars = game.stars();
    const want = this.desiredCops(stars);
    this.spawnCooldown -= dt;
    if (this.cops.length < want && this.spawnCooldown <= 0) {
      this.spawnCop(game.targetPos());
      this.spawnCooldown = 1.6;
    }
    // Surplus cops peel off and are removed once far away.
    if (this.cops.length > want) {
      const cop = this.cops[this.cops.length - 1];
      if (Math.hypot(cop.pos.x - game.targetPos().x, cop.pos.z - game.targetPos().z) > 60) {
        this.scene.remove(cop.mesh);
        this.cops.pop();
      }
    }

    const target = game.targetPos();
    const flash = Math.floor(performance.now() / 280) % 2 === 0;
    for (const cop of this.cops) {
      const bar = cop.mesh.userData.lightBar;
      if (bar) {
        bar.children[0].visible = flash;
        bar.children[1].visible = !flash;
      }
      const distToPlayer = Math.hypot(target.x - cop.pos.x, target.z - cop.pos.z);
      const stopAt = game.playerInCar() ? 3.2 : 5.6;
      if (distToPlayer < 30) {
        // Final stretch: straight at the player.
        const impact = this.driveToward(cop, target, dt, stopAt);
        if (impact > 8 && game.playerInCar()) game.onPoliceRamPlayer(impact);
        cop.navRoute = [];
        continue;
      }
      cop.replan -= dt;
      const waypoint = cop.navRoute[cop.navIdx];
      if (!waypoint || cop.replan <= 0) {
        cop.navRoute = this.route(this.nearestNode(cop.pos), this.nearestNode(target));
        cop.navIdx = 0;
        cop.replan = 2.5;
      }
      const wp = cop.navRoute[cop.navIdx];
      if (!wp) {
        this.driveToward(cop, target, dt, stopAt);
        continue;
      }
      if (Math.hypot(wp.x - cop.pos.x, wp.z - cop.pos.z) < 8) cop.navIdx++;
      this.driveToward(cop, wp, dt, 0);
    }
  }

  nearestDistance(pos) {
    let d = Infinity;
    for (const cop of this.cops) d = Math.min(d, Math.hypot(cop.pos.x - pos.x, cop.pos.z - pos.z));
    return d;
  }

  anyActive() { return this.cops.length > 0; }
  all() { return this.cops; }

  clear() {
    for (const cop of this.cops) this.scene.remove(cop.mesh);
    this.cops = [];
  }
}
