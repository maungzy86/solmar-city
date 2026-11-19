// Carmen Solis's jobs: a four-mission story chain that then loops as
// repeatable work. Drive to the gold beacon to start, then follow the
// objective banner — a fare to the Marina, a hot package across town against
// the clock, a checkpoint hustle around the bay, and a cool-off run where
// the delivery only counts once the police heat is gone. Finishing pays
// cash, advances the story, and saves the game.

import * as THREE from 'three';
import { CONFIG } from './config.js';

const POINTS = {
  plaza: { x: 16, z: 34 },
  marina: { x: -228, z: 252 },
  oldTown: { x: -186, z: -186 },
  downtown: { x: 186, z: -114 },
  hustle: [
    { x: 246, z: 246 },
    { x: -246, z: 246 },
    { x: -246, z: -72 },
    { x: 18, z: -216 },
  ],
};

const COMPLETE_LINES = {
  fare: "Carmen: 'Clean run, Milo. Aurelio's boys were watching the marina again.'",
  package: "Carmen: 'Whatever was in that box, the Syndicate wanted it back. Don't ask.'",
  hustle: "Carmen: 'You just outran half the bay. The Vane crew noticed. So did I.'",
  cooloff: "Carmen: 'Cold as ice, Milo. That's how you stay free in Solmar Bay.'",
};

export class MissionManager {
  constructor(scene, hooks) {
    this.hooks = hooks;
    this.index = 0;
    this.loop = 0;
    this.phase = 'offer'; // offer -> active -> offer ...
    this.step = 0;
    this.timer = 0;
    this.coolHintAt = -99; // last "too hot" warning time (game.elapsed)

    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffc93f, transparent: true, opacity: 0.34, depthWrite: false });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 26, 14, 1, true), beaconMat);
    this.beacon.position.y = 13;
    this.diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.5),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }),
    );
    this.beaconGroup = new THREE.Group();
    this.beaconGroup.add(this.beacon);
    this.beaconGroup.add(this.diamond);
    scene.add(this.beaconGroup);
    this.syncBeacon();
  }

  def() { return CONFIG.missions[this.index % CONFIG.missions.length]; }

  startPoint() {
    const id = this.def().id;
    if (id === 'fare') return POINTS.plaza;
    if (id === 'package') return POINTS.oldTown;
    if (id === 'cooloff') return POINTS.downtown;
    return POINTS.hustle[0];
  }

  marker() {
    if (this.phase === 'offer') return this.startPoint();
    const id = this.def().id;
    if (id === 'fare') return this.step === 0 ? POINTS.plaza : POINTS.marina;
    if (id === 'package') return this.step === 0 ? POINTS.oldTown : POINTS.downtown;
    if (id === 'cooloff') return this.step === 0 ? POINTS.downtown : POINTS.marina;
    return POINTS.hustle[Math.min(this.step, POINTS.hustle.length - 1)];
  }

  syncBeacon() {
    const m = this.marker();
    this.beaconGroup.position.set(m.x, 0, m.z);
  }

  objectiveText() {
    const d = this.def();
    const n = (this.index % CONFIG.missions.length) + 1;
    if (this.phase === 'offer') {
      return { title: `Mission ${n} — ${d.title}`, sub: `Drive to the gold beacon to start · $${d.reward + this.loop * 25}` };
    }
    if (d.id === 'fare') {
      return this.step === 0
        ? { title: `Mission ${n} — ${d.title}`, sub: 'Pick up Carmen at the plaza' }
        : { title: `Mission ${n} — ${d.title}`, sub: 'Drive Carmen to the Marina' };
    }
    if (d.id === 'package') {
      return this.step === 0
        ? { title: `Mission ${n} — ${d.title}`, sub: 'Collect the package in Old Town' }
        : { title: `Mission ${n} — ${d.title}`, sub: `Deliver it Downtown — ${Math.max(0, Math.ceil(this.timer))}s left` };
    }
    if (d.id === 'cooloff') {
      return this.step === 0
        ? { title: `Mission ${n} — ${d.title}`, sub: 'Pick up the marked envelope Downtown' }
        : { title: `Mission ${n} — ${d.title}`, sub: `Reach the Marina hideout with NO police heat — ${Math.max(0, Math.ceil(this.timer))}s left` };
    }
    return { title: `Mission ${n} — ${d.title}`, sub: `Checkpoint ${this.step + 1} of ${POINTS.hustle.length}` };
  }

  // Used by screenshot mode: begin the current mission's work immediately.
  jumpToActive() {
    this.phase = 'active';
    this.step = this.def().id === 'fare' ? 1 : 0;
    this.syncBeacon();
    const o = this.objectiveText();
    this.hooks.setObjective(o.title, o.sub);
  }

  complete(game) {
    const d = this.def();
    const pay = d.reward + this.loop * 25;
    game.addCash(pay);
    game.stats.missionsDone++;
    this.hooks.sting();
    this.hooks.toast(`${COMPLETE_LINES[d.id]}  (+$${pay})`);
    this.index++;
    if (this.index % CONFIG.missions.length === 0) this.loop++;
    this.phase = 'offer';
    this.step = 0;
    this.timer = 0;
    this.syncBeacon();
    game.saveNow();
  }

  update(dt, game) {
    this.diamond.position.y = 4.4 + Math.sin(performance.now() * 0.003) * 0.5;
    this.diamond.rotation.y += dt * 1.8;
    const m = this.marker();
    const p = game.targetPos();
    const dist = Math.hypot(p.x - m.x, p.z - m.z);
    const o = this.objectiveText();
    this.hooks.setObjective(o.title, o.sub);

    if (this.phase === 'offer') {
      if (dist < 6.5) {
        this.phase = 'active';
        this.step = 0;
        const d = this.def();
        if (d.id === 'fare') this.hooks.toast("Carmen: 'Marina, Milo. And keep it smooth — I'm watching the mirrors.'");
        if (d.id === 'package') this.hooks.toast("Carmen: 'Box is in the trunk. Downtown, fast. Do not open it.'");
        if (d.id === 'hustle') this.hooks.toast("Carmen: 'Four corners of the bay. Show me what that right foot does.'");
        if (d.id === 'cooloff') this.hooks.toast("Carmen: 'Envelope's Downtown. The pickup will be seen — lose the heat, then bring it to the Marina.'");
        this.syncBeacon();
      }
      return;
    }

    const d = this.def();
    if (d.id === 'fare') {
      if (this.step === 0 && dist < 6.5) {
        this.step = 1;
        this.hooks.toast("Carmen: 'That's me in. Marina — the pier with the blue boats.'");
        this.syncBeacon();
      } else if (this.step === 1 && dist < 8) {
        this.complete(game);
      }
    } else if (d.id === 'package') {
      if (this.step === 0 && dist < 6.5) {
        this.step = 1;
        this.timer = 140;
        game.addHeat(CONFIG.wanted.perStar); // the pickup was seen
        this.hooks.toast('Someone saw the pickup — the heat is up.');
        this.syncBeacon();
      } else if (this.step === 1) {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.hooks.toast("Carmen: 'Too slow. The buyer walked. Start over, Milo.'");
          this.phase = 'offer';
          this.step = 0;
          this.syncBeacon();
        } else if (dist < 8) {
          this.complete(game);
        }
      }
    } else if (d.id === 'cooloff') {
      if (this.step === 0 && dist < 6.5) {
        this.step = 1;
        this.timer = 220;
        game.addHeat(CONFIG.wanted.perStar * 2); // the pickup was seen — two stars
        this.hooks.toast('The pickup lit you up — two stars. Lose them, then reach the Marina hideout.');
        this.syncBeacon();
      } else if (this.step === 1) {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.hooks.toast("Carmen: 'Too slow — the hideout went dark. Start over, Milo.'");
          this.phase = 'offer';
          this.step = 0;
          this.syncBeacon();
        } else if (dist < 8) {
          if (game.stars() > 0) {
            // At the door but still hot: the delivery does not count yet.
            if (game.elapsed - this.coolHintAt > 4) {
              this.coolHintAt = game.elapsed;
              this.hooks.toast('Too hot — lose the police before you roll into the hideout!');
            }
          } else {
            this.complete(game);
          }
        }
      }
    } else if (d.id === 'hustle') {
      if (dist < 9) {
        this.step++;
        this.hooks.pickup();
        if (this.step >= POINTS.hustle.length) this.complete(game);
        else this.syncBeacon();
      }
    }
  }
}
