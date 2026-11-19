// The day/night cycle: one full in-game day every CONFIG.day.cycleSeconds
// of real time. The clock drives the sun's position, colour and strength,
// the sky and fog colours, the sky-dome tint, building-window glow
// (emissive on the facade materials), streetlamp point lights and lamp
// glow shells, and the sea colour. main.js reads isNight() to switch car
// headlights on automatically and clockLabel() for the HUD clock.

import * as THREE from 'three';
import { CONFIG } from './config.js';

// Keyframe palettes around the clock. night: 0 = full day, 1 = full night.
const STOPS = [
  { h: 0.0, sky: 0x0d2036, fog: 0x14293e, sun: 0x93b4e8, sunI: 0.22, hemiI: 0.3, night: 1 },
  { h: 5.0, sky: 0x0d2036, fog: 0x14293e, sun: 0x93b4e8, sunI: 0.22, hemiI: 0.3, night: 1 },
  { h: 6.5, sky: 0x7d9fc0, fog: 0xe09a5f, sun: 0xffb36b, sunI: 1.3, hemiI: 0.55, night: 0.35 },
  { h: 8.5, sky: 0x9fd8e8, fog: 0xd8e2da, sun: 0xfff0d0, sunI: 2.5, hemiI: 0.9, night: 0 },
  { h: 15.5, sky: 0x9fd8e8, fog: 0xe6ddc4, sun: 0xffe9bd, sunI: 2.6, hemiI: 0.95, night: 0 },
  { h: 17.67, sky: 0x9fd8e8, fog: 0xf6cf9a, sun: 0xffdfae, sunI: 2.6, hemiI: 0.95, night: 0 },
  { h: 19.0, sky: 0x6683b4, fog: 0xef9a58, sun: 0xff8c4a, sunI: 1.35, hemiI: 0.6, night: 0.3 },
  { h: 20.25, sky: 0x1a2f47, fog: 0x22384c, sun: 0xa9c2e8, sunI: 0.3, hemiI: 0.34, night: 0.9 },
  { h: 21.5, sky: 0x0d2036, fog: 0x14293e, sun: 0x93b4e8, sunI: 0.22, hemiI: 0.3, night: 1 },
  { h: 24.0, sky: 0x0d2036, fog: 0x14293e, sun: 0x93b4e8, sunI: 0.22, hemiI: 0.3, night: 1 },
];

const _a = new THREE.Color();
const _b = new THREE.Color();

function lerpColor(hexA, hexB, t, out) {
  _a.setHex(hexA);
  _b.setHex(hexB);
  out.copy(_a).lerp(_b, t);
  return out;
}

// The interpolated palette at a given hour (0..24). Pure — the harness
// pins day vs night values through this.
export function paletteAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < STOPS.length - 2 && STOPS[i + 1].h <= h) i++;
  const A = STOPS[i];
  const B = STOPS[i + 1];
  const t = Math.max(0, Math.min(1, (h - A.h) / Math.max(0.0001, B.h - A.h)));
  const out = { night: A.night + (B.night - A.night) * t, sunI: A.sunI + (B.sunI - A.sunI) * t, hemiI: A.hemiI + (B.hemiI - A.hemiI) * t };
  out.sky = lerpColor(A.sky, B.sky, t, new THREE.Color());
  out.fog = lerpColor(A.fog, B.fog, t, new THREE.Color());
  out.sun = lerpColor(A.sun, B.sun, t, new THREE.Color());
  return out;
}

export class DayNight {
  // refs: { scene, sun, hemi, domeMat, facadeMats, lampLights, lampGlowMat, seaMat }
  constructor(refs) {
    this.refs = refs;
    this.hour = CONFIG.day.startHour;
    this.night = 0;
    this.apply();
  }

  isNight() { return this.night > 0.55; }

  clockLabel() {
    const hh = Math.floor(this.hour);
    const mm = Math.floor((this.hour - hh) * 60);
    return `Solmar Bay · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  phaseName() {
    if (this.night > 0.8) return 'Night';
    if (this.hour >= 6 && this.hour < 8.5) return 'Sunrise';
    if (this.hour >= 17.5 && this.hour < 20.25) return 'Sunset';
    if (this.night > 0.3) return 'Dusk';
    return 'Day';
  }

  update(dt) {
    this.hour = (this.hour + (dt * 24) / CONFIG.day.cycleSeconds) % 24;
    this.apply();
  }

  apply() {
    const p = paletteAt(this.hour);
    this.night = p.night;
    const { scene, sun, hemi, domeMat, facadeMats, lampLights, lampGlowMat, seaMat } = this.refs;
    scene.background.copy(p.sky);
    scene.fog.color.copy(p.fog);
    if (domeMat) {
      // The dome texture is a day gradient; tint it toward the sky colour.
      domeMat.color.copy(p.sky).lerp(new THREE.Color(0xffffff), 1 - p.night * 0.82);
    }
    // Sun path: rises in the east (+x), sets in the west; at night a dim
    // blue "moon" light takes the same slot so shadows never vanish fully.
    const ang = ((this.hour - 6) / 12) * Math.PI; // 6h -> 0 (east horizon), 18h -> PI (west)
    const dayElev = Math.sin(ang);
    if (dayElev > -0.08) {
      sun.position.set(Math.cos(ang) * 230, Math.max(24, dayElev * 250), 90);
    } else {
      const mang = ((this.hour - 18 + 24) % 24 / 12) * Math.PI;
      sun.position.set(Math.cos(mang) * 180, Math.max(30, Math.sin(mang) * 190), -70);
    }
    sun.color.copy(p.sun);
    sun.intensity = p.sunI;
    hemi.intensity = p.hemiI;
    hemi.color.copy(p.sky).lerp(new THREE.Color(0xffffff), 0.35);
    for (const mat of facadeMats || []) mat.emissiveIntensity = p.night * 0.85;
    for (const light of lampLights || []) light.intensity = p.night * 30;
    if (lampGlowMat) lampGlowMat.opacity = p.night * 0.32;
    if (seaMat) seaMat.color.setHex(0x2e8fa3).lerp(new THREE.Color(0x10394d), p.night * 0.85);
  }
}
