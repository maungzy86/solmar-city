// Street races: a repeatable checkpoint time trial. A cyan beacon on the
// beachfront avenue marks the start — drive through it in any car and the
// run begins after a short countdown. Checkpoint rings then appear one at
// a time across the city (the route crosses the canal on a bridge). Beat
// the target time for the full payout plus a per-second bonus; finish over
// target for a smaller flat fee; run past the hard limit and the run is
// void. The best time is kept on the game object and persisted by save.js.

import * as THREE from 'three';
import { CONFIG } from './config.js';

// Pure payout rule, exported so the logic harness can pin it down.
export function racePayout(elapsed, cfg = CONFIG.race) {
  if (elapsed > cfg.hardLimit) return 0;
  if (elapsed <= cfg.targetTime) {
    return Math.round(cfg.basePay + (cfg.targetTime - elapsed) * cfg.bonusPerSec);
  }
  return cfg.slowPay;
}

export function formatRaceTime(seconds) {
  if (!Number.isFinite(seconds) || seconds === null || seconds === undefined) return '--:--.-';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export class RaceManager {
  // hooks: { toast, setObjective, setRaceHud(text|null), sound }
  constructor(scene, hooks) {
    this.hooks = hooks;
    this.cfg = CONFIG.race;
    this.state = 'idle'; // idle | countdown | racing
    this.countdownLeft = 0;
    this.lastBeep = -1;
    this.elapsed = 0;
    this.cpIndex = 0;

    const startMat = new THREE.MeshBasicMaterial({ color: 0x37e0d8, transparent: true, opacity: 0.3, depthWrite: false });
    this.startBeacon = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 26, 14, 1, true), startMat);
    this.startBeacon.position.set(this.cfg.start.x, 13, this.cfg.start.z);
    scene.add(this.startBeacon);
    this.startDiamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.4),
      new THREE.MeshBasicMaterial({ color: 0x37e0d8 }),
    );
    this.startDiamond.position.set(this.cfg.start.x, 4.4, this.cfg.start.z);
    scene.add(this.startDiamond);

    // The active checkpoint: a fat glowing ring standing on the road.
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x37e0d8, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.42, 10, 28), ringMat);
    this.ring.visible = false;
    scene.add(this.ring);
    const cpMat = new THREE.MeshBasicMaterial({ color: 0x37e0d8, transparent: true, opacity: 0.16, depthWrite: false });
    this.cpBeacon = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 30, 14, 1, true), cpMat);
    this.cpBeacon.visible = false;
    scene.add(this.cpBeacon);
  }

  active() { return this.state !== 'idle'; }

  currentTarget() {
    if (this.state === 'racing') return this.cfg.checkpoints[this.cpIndex] || null;
    return this.cfg.start;
  }

  marker() { return this.currentTarget(); }

  showCheckpoint() {
    const cp = this.cfg.checkpoints[this.cpIndex];
    if (!cp) return;
    this.ring.position.set(cp.x, 4.8, cp.z);
    this.cpBeacon.position.set(cp.x, 15, cp.z);
    this.ring.visible = true;
    this.cpBeacon.visible = true;
  }

  hideMarkers() {
    this.ring.visible = false;
    this.cpBeacon.visible = false;
  }

  beginCountdown() {
    this.state = 'countdown';
    this.countdownLeft = this.cfg.countdown;
    this.lastBeep = -1;
    this.cpIndex = 0;
    this.showCheckpoint();
    this.hooks.toast('Street race — hit every cyan ring. Beat the clock, get paid.');
  }

  finish(game) {
    const t = this.elapsed;
    const pay = racePayout(t);
    const isBest = game.raceBest === null || game.raceBest === undefined || t < game.raceBest;
    if (isBest) game.raceBest = t;
    game.addCash(pay);
    game.stats.racesDone = (game.stats.racesDone || 0) + 1;
    this.hooks.sound.raceWin();
    this.hooks.toast(isBest
      ? `Race finished in ${formatRaceTime(t)} — NEW BEST! (+$${pay})`
      : `Race finished in ${formatRaceTime(t)}. Best: ${formatRaceTime(game.raceBest)}. (+$${pay})`);
    this.state = 'idle';
    this.hideMarkers();
    this.hooks.setRaceHud(null);
    game.saveNow();
  }

  fail(game, reason) {
    this.hooks.sound.raceFail();
    this.hooks.toast(reason);
    this.state = 'idle';
    this.hideMarkers();
    this.hooks.setRaceHud(null);
  }

  // Silent reset (run ended / restarted mid-race): no sound, no toast.
  abort() {
    this.state = 'idle';
    this.hideMarkers();
    this.hooks.setRaceHud(null);
  }

  // Returns true while the race owns the objective banner.
  update(dt, game) {
    this.startDiamond.position.y = 4.4 + Math.sin(performance.now() * 0.003) * 0.5;
    this.startDiamond.rotation.y += dt * 1.8;
    this.startBeacon.visible = this.state === 'idle';
    this.startDiamond.visible = this.state === 'idle';
    if (this.state === 'idle') {
      if (game.playerInCar()) {
        const p = game.targetPos();
        const d = Math.hypot(p.x - this.cfg.start.x, p.z - this.cfg.start.z);
        if (d < this.cfg.startRadius) this.beginCountdown();
      }
      return false;
    }

    if (this.state === 'countdown') {
      this.countdownLeft -= dt;
      const beep = Math.ceil(this.countdownLeft);
      if (beep !== this.lastBeep && beep > 0) {
        this.lastBeep = beep;
        this.hooks.sound.countBeep(false);
      }
      if (this.countdownLeft <= 0) {
        this.state = 'racing';
        this.elapsed = 0;
        this.hooks.sound.countBeep(true);
        this.hooks.toast('GO!');
      }
      this.hooks.setObjective('Street Race — Beachfront Time Trial',
        this.countdownLeft > 0 ? `Starting in ${Math.max(1, Math.ceil(this.countdownLeft))}…` : 'GO!');
      this.hooks.setRaceHud(`Target ${formatRaceTime(this.cfg.targetTime)} · Best ${formatRaceTime(game.raceBest)}`);
      return true;
    }

    // racing
    this.elapsed += dt;
    this.ring.rotation.z += dt * 0.9;
    if (this.elapsed > this.cfg.hardLimit) {
      this.fail(game, `Out of time — the run is void. Target was ${formatRaceTime(this.cfg.targetTime)}.`);
      return false;
    }
    if (game.playerInCar()) {
      const cp = this.cfg.checkpoints[this.cpIndex];
      const p = game.targetPos();
      if (cp && Math.hypot(p.x - cp.x, p.z - cp.z) < this.cfg.checkpointRadius) {
        this.cpIndex++;
        this.hooks.sound.checkpoint();
        if (this.cpIndex >= this.cfg.checkpoints.length) {
          this.finish(game);
          return false;
        }
        this.showCheckpoint();
      }
    }
    const left = this.cfg.targetTime - this.elapsed;
    this.hooks.setObjective('Street Race — Beachfront Time Trial',
      `Checkpoint ${Math.min(this.cpIndex + 1, this.cfg.checkpoints.length)} of ${this.cfg.checkpoints.length}`);
    this.hooks.setRaceHud(
      `${formatRaceTime(this.elapsed)} / ${formatRaceTime(this.cfg.targetTime)}`
      + (left >= 0 ? ` · bonus window ${Math.ceil(left)}s` : ' · over target — finish for $60')
      + ` · Best ${formatRaceTime(game.raceBest)}`);
    return true;
  }
}
