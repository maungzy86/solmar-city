// On-foot combat: Milo's punch and two-handed shove. Attacks are resolved
// against the pedestrians in a short arc in front of the player — a punch
// staggers (twice puts them down), a shove always knocks down with a
// knockback slide. Bystanders panic and run; if anyone upright (or a cop)
// is close enough to see it, the wanted heat rises. Consecutive hits build
// a combo counter on the HUD. Everything is non-graphic: people fall over,
// sit up, and run away.

import { CONFIG } from './config.js';

export class CombatSystem {
  // hooks: { sound, crime(kind), toast(text), hud }
  constructor(hooks) {
    this.hooks = hooks;
    this.combo = 0;
    this.comboTimer = 0;
  }

  reset() {
    this.combo = 0;
    this.comboTimer = 0;
    this.hooks.hud.setCombo(0);
  }

  // Pedestrians the player could plausibly hit with an attack of `range`:
  // inside the range and inside the front arc (or very close in any
  // direction, so point-blank swings still connect).
  targetsInArc(player, peds, range) {
    const f = player.forward();
    const out = [];
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      const dx = ped.pos.x - player.pos.x;
      const dz = ped.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      const dot = d < 0.001 ? 1 : (dx * f.x + dz * f.z) / d;
      if (dot > 0.25 || d < 0.9) out.push({ ped, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  // Did anyone see it? An upright pedestrian within earshot, or any cop
  // within line-of-sight range. Downed pedestrians saw nothing.
  witnessed(player, peds, police) {
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.pos.x - player.pos.x, ped.pos.z - player.pos.z) < 24) return true;
    }
    return police.nearestDistance(player.pos) < 55;
  }

  registerHit(game) {
    this.combo++;
    this.comboTimer = CONFIG.comboWindow;
    this.hooks.hud.setCombo(this.combo);
    this.hooks.hud.flashHitmarker();
    if (this.combo === 3) this.hooks.toast('Combo x3 — the beach is getting a show.');
  }

  // Attempt one attack of kind 'punch' | 'shove'. Returns a result object
  // { fired, hit, result } — result is 'stumble' | 'down' | null.
  attack(kind, game, peds, police) {
    const player = game.player;
    const fired = kind === 'shove' ? player.shove() : player.punch();
    if (!fired) return { fired: false, hit: false, result: null };
    const range = kind === 'shove' ? CONFIG.shoveRange : CONFIG.punchRange;
    const targets = this.targetsInArc(player, peds.all(), range);
    // A swing always startles the immediate crowd.
    peds.scareNear(player.pos, 9);
    if (!targets.length) {
      this.hooks.sound.whiff();
      return { fired: true, hit: false, result: null };
    }
    const { ped } = targets[0];
    const result = kind === 'shove' ? ped.shove(player.pos) : ped.stumble(player.pos);
    if (kind === 'shove') this.hooks.sound.shoveSound();
    else this.hooks.sound.hitThump();
    this.registerHit(game);
    if (this.witnessed(player, peds.all(), police)) {
      game.crime(kind === 'shove' ? 'shovePed' : 'punchPed');
      this.hooks.toast(result === 'down'
        ? (kind === 'shove' ? 'Shoved flat — and people saw it.' : 'Down they go — and people saw it.')
        : 'That landed. People are staring.');
    } else {
      this.hooks.toast(result === 'down' ? 'Down — nobody saw a thing.' : 'A quiet stagger. Nobody noticed.');
    }
    return { fired: true, hit: true, result };
  }

  // Nearest standing pedestrian distance, for the contextual HUD hint.
  nearestPedDist(player, peds) {
    let d = Infinity;
    for (const ped of peds.all()) {
      if (ped.state === 'down') continue;
      d = Math.min(d, Math.hypot(ped.pos.x - player.pos.x, ped.pos.z - player.pos.z));
    }
    return d;
  }

  update(dt) {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0 && this.combo > 0) {
        this.combo = 0;
        this.hooks.hud.setCombo(0);
      }
    }
  }
}
