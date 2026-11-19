// Solmar City — the entry module. It builds the renderer, scene and every
// subsystem, owns the game state (cash, wanted heat, bust meter, stats),
// wires input to the player and cars, and runs the frame loop. Everything
// else lives in the module named for its job; this file is the glue.

import * as THREE from 'three';
import { CONFIG, citySeed } from './config.js';
import { createRng } from './rng.js';
import { InputTracker } from './input.js';
import { SoundBank } from './audio.js';
import { buildCity } from './city.js';
import { Player } from './player.js';
import { VehicleManager } from './vehicles.js';
import { TrafficManager } from './traffic.js';
import { PedestrianManager } from './peds.js';
import { PoliceManager } from './police.js';
import { MissionManager } from './missions.js';
import { CombatSystem } from './combat.js';
import { RaceManager } from './race.js';
import { DayNight } from './daynight.js';
import { ChaseCamera } from './camera.js';
import { Hud } from './hud.js';
import { drawMinimap } from './minimap.js';
import { saveGame, loadGame, clearSave } from './save.js';
import { applyShotMode } from './shots.js';

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') || '', 10);
const rng = createRng(Number.isFinite(seedParam) ? seedParam : citySeed());

// --- renderer & scene ------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('gl').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.colors.sky);
scene.fog = new THREE.Fog(CONFIG.colors.fog, 150, 640);
const camera3d = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);

// Gradient sky dome, painted on a canvas: warm horizon, blue zenith. The
// material is kept so the day/night cycle can tint it after dark.
let domeMat = null;
{
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#5fb6d9');
  grad.addColorStop(0.55, '#9fd8e8');
  grad.addColorStop(0.8, '#f6cf9a');
  grad.addColorStop(1, '#f2a65a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  domeMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 20, 12), domeMat);
  scene.add(dome);
}

// --- world & actors ----------------------------------------------------------
const world = buildCity(scene, rng);
const player = new Player(scene, world.spawnPoints.player);
const vehicles = new VehicleManager(scene, world);
const traffic = new TrafficManager(scene, rng);
const peds = new PedestrianManager(scene, rng);
const police = new PoliceManager(scene, world);
const sound = new SoundBank();
const hud = new Hud();
const input = new InputTracker(renderer.domElement);
const chaseCam = new ChaseCamera(camera3d);

// The day/night cycle drives the city lighting built by buildCity.
const daynight = new DayNight({
  scene,
  sun: world.sun,
  hemi: world.hemi,
  domeMat,
  facadeMats: world.facadeMats,
  lampLights: world.lampLights,
  lampGlowMat: world.lampGlowMat,
  seaMat: world.seaMat,
});
let wasNight = daynight.isNight();
let lastClockLabel = '';

// --- game state ---------------------------------------------------------------
const game = {
  mode: 'title', // title | playing | paused | ended
  cash: CONFIG.startCash,
  heat: 0,
  lastCrimeAt: -99,
  lastDamageAt: -99,
  elapsed: 0,
  bustFrac: 0,
  inCar: null,
  raceBest: null,
  stats: { earned: 0, missionsDone: 0, carsDriven: 0, racesDone: 0 },
  shotTick: null,
  player,
  vehicles,
  police,
  hud,
  camera: chaseCam,

  stars() {
    return Math.max(0, Math.min(CONFIG.wanted.maxStars, Math.floor(this.heat / CONFIG.wanted.perStar)));
  },
  targetPos() { return this.inCar ? this.inCar.pos : player.pos; },
  targetHeading() { return this.inCar ? this.inCar.heading : player.heading; },
  playerInCar() { return this.inCar !== null; },

  addHeat(n) {
    this.heat = Math.max(0, Math.min(115, this.heat + n));
    hud.setWanted(this.stars());
  },
  crime(kind) {
    const points = CONFIG.wanted[kind] || 0;
    if (points > 0) {
      this.addHeat(points);
      this.lastCrimeAt = this.elapsed;
    }
  },
  addCash(n) {
    this.cash += n;
    if (n > 0) this.stats.earned += n;
    hud.setCash(this.cash);
  },
  damage(n) {
    player.health = Math.max(0, player.health - n);
    this.lastDamageAt = this.elapsed;
    hud.setHealth(player.health);
    hud.flashDamage();
  },
  saveNow() {
    saveGame({
      cash: this.cash,
      health: player.health,
      missionIndex: missions.index,
      loop: missions.loop,
      raceBest: this.raceBest,
      playerPos: { x: player.pos.x, z: player.pos.z },
      stats: this.stats,
    });
  },
  onPoliceRamPlayer() {
    // A cop ramming the player's car hurts a little; the crime is theirs.
    if (this.elapsed - this.lastDamageAt > 0.8) this.damage(2);
  },
  setShotTick(fn) { this.shotTick = fn; },
  orbitTitleCamera(t) {
    const a = t * 0.06;
    camera3d.position.set(Math.sin(a) * 150, 40, Math.cos(a) * 150);
    camera3d.lookAt(0, 4, 0);
  },
  debugSetHeat(n) { this.heat = n; hud.setWanted(this.stars()); },
  debugEnterCar(car) { enterCar(car, true); },
  startRun(saved) { startRun(saved); },
};

// While a street race is live it owns the objective banner; mission
// objective updates are held back until the race ends.
let raceOwnsBanner = false;
const race = new RaceManager(scene, {
  toast: (t) => hud.toast(t),
  setObjective: (title, sub) => hud.setObjective(title, sub),
  setRaceHud: (t) => hud.setRace(t),
  sound,
});
game.race = race;

const combat = new CombatSystem({
  sound,
  toast: (t) => hud.toast(t),
  hud,
});
game.combat = combat;

const missions = new MissionManager(scene, {
  toast: (t) => hud.toast(t),
  setObjective: (title, sub) => { if (!raceOwnsBanner) hud.setObjective(title, sub); },
  sting: () => sound.missionSting(),
  pickup: () => sound.pickup(),
});
game.missions = missions;

// --- run lifecycle --------------------------------------------------------------
function startRun(saved) {
  game.cash = saved ? saved.cash : CONFIG.startCash;
  player.health = saved ? Math.max(30, saved.health) : CONFIG.playerHealth;
  missions.index = saved ? saved.missionIndex : 0;
  missions.loop = saved ? (saved.loop || 0) : 0;
  missions.phase = 'offer';
  missions.step = 0;
  missions.syncBeacon();
  if (saved && saved.player) player.pos.set(saved.player.x, 0, saved.player.z);
  else player.pos.set(world.spawnPoints.player.x, 0, world.spawnPoints.player.z);
  if (saved && saved.stats) game.stats = { racesDone: 0, ...saved.stats };
  game.raceBest = saved && typeof saved.raceBest === 'number' ? saved.raceBest : null;
  game.heat = 0;
  game.bustFrac = 0;
  race.abort();
  combat.reset();
  exitCar(true);
  police.clear();
  hud.setCash(game.cash);
  hud.setHealth(player.health);
  hud.setWanted(0);
  hud.setClock(daynight.clockLabel());
  hud.hideScreens();
  hud.showHud();
  game.mode = 'playing';
  chaseCam.yaw = player.heading;
  chaseCam.snapTo(player.pos);
  sound.startMusic();
  hud.toast(saved ? 'Welcome back to Solmar Bay, Milo.' : "Carmen: 'Milo. Follow the gold beacon — I've got work.'");
}

function endRun(kind) {
  game.mode = 'ended';
  race.abort();
  sound.siren(false);
  sound.engineOff();
  const stars = game.stars();
  if (kind === 'busted') {
    const fine = Math.min(game.cash, stars * CONFIG.police.finePerStar + 40);
    game.addCash(-fine);
    document.querySelector('#screen-busted h1').textContent = 'BUSTED';
    document.getElementById('busted-text').textContent =
      `The Solmar Bay PD held you at ${stars} star${stars === 1 ? '' : 's'} and took $${fine} for their trouble.`;
  } else {
    const fine = Math.floor(game.cash * 0.1);
    game.addCash(-fine);
    document.querySelector('#screen-busted h1').textContent = 'WASTED';
    document.getElementById('busted-text').textContent =
      `The bay spits you back out on the Old Town kerb, $${fine} lighter. Walk it off.`;
    player.health = 70;
  }
  game.heat = 0;
  game.bustFrac = 0;
  police.clear();
  hud.setWanted(0);
  hud.showScreen('screen-busted');
  game.saveNow();
}

function respawn() {
  exitCar(true);
  player.pos.set(-252, 0, -252); // outside the Old Town station
  if (player.health < 55) player.health = 55;
  hud.setHealth(player.health);
  hud.hideScreens();
  hud.showHud();
  game.mode = 'playing';
  chaseCam.yaw = Math.PI;
  chaseCam.snapTo(player.pos);
  hud.toast('Free again. Try to keep it that way.');
}

// --- cars: entering, exiting, contact ------------------------------------------
function enterCar(car, silent = false) {
  game.inCar = car;
  car.occupied = true;
  player.group.visible = false;
  game.stats.carsDriven++;
  if (!silent) {
    sound.uiClick();
    hud.toast(`${car.name} — ${car.health < 35 ? 'she has seen better days.' : 'engine running.'}`);
    // Stealing is a crime when someone is close enough to see it.
    const witnessed = peds.all().some((p) => Math.hypot(p.pos.x - car.pos.x, p.pos.z - car.pos.z) < 26)
      || police.nearestDistance(car.pos) < 60;
    if (witnessed) {
      game.crime('stealCar');
      hud.toast('Someone saw that. The heat is up.');
    }
  }
}

function exitCar(silent = false) {
  const car = game.inCar;
  if (!car) return;
  game.inCar = null;
  car.occupied = false;
  const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
  player.pos.set(car.pos.x + side.x * 2.4, 0, car.pos.z + side.z * 2.4);
  player.heading = car.heading;
  player.group.visible = true;
  if (!silent) sound.uiClick();
  sound.engineOff();
}

function tryToggleCar() {
  if (game.inCar) {
    if (Math.abs(game.inCar.speed) < 1.2) exitCar();
    return;
  }
  const car = vehicles.nearest(player.pos, 3.6);
  if (car) enterCar(car);
}

// Circle contact between the player's car and every other car on the road.
function carContacts(dt) {
  const mine = game.inCar;
  if (!mine) return;
  const others = [...vehicles.all(), ...traffic.all(), ...police.all()];
  for (const other of others) {
    if (other === mine) continue;
    const dx = mine.pos.x - other.pos.x;
    const dz = mine.pos.z - other.pos.z;
    const d = Math.hypot(dx, dz);
    const minD = 2.6;
    if (d >= minD || d === 0) continue;
    const push = (minD - d) / 2;
    mine.pos.x += (dx / d) * push;
    mine.pos.z += (dz / d) * push;
    const closing = Math.abs(mine.speed);
    if (closing > 7) {
      sound.crash();
      game.damage(closing > 15 ? 5 : 2);
      mine.health = Math.max(0, mine.health - closing * 0.8);
      mine.speed *= -0.25;
      const isCop = police.all().includes(other);
      game.crime(isCop ? 'ramPolice' : 'hitCar');
      hud.toast(isCop ? 'You rammed a police interceptor!' : 'Crash! That will be noticed.');
    } else {
      mine.speed *= 0.6;
    }
  }
}

// --- screens & buttons -------------------------------------------------------------
const existingSave = loadGame();
if (existingSave) document.getElementById('btn-continue').classList.remove('hidden');
document.getElementById('btn-new').addEventListener('click', () => { sound.uiClick(); startRun(null); });
document.getElementById('btn-continue').addEventListener('click', () => { sound.uiClick(); startRun(loadGame()); });
document.getElementById('btn-resume').addEventListener('click', () => {
  sound.uiClick();
  game.mode = 'playing';
  hud.hideScreens();
  hud.showHud();
});
document.getElementById('btn-restart').addEventListener('click', () => { clearSave(); window.location.reload(); });
document.getElementById('btn-busted-ok').addEventListener('click', () => { sound.uiClick(); respawn(); });

window.addEventListener('resize', () => {
  camera3d.aspect = window.innerWidth / window.innerHeight;
  camera3d.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener('error', (e) => {
  hud.toast(`A glitch in the bay: ${e.message || 'unknown error'}`, 6000);
});

// --- per-frame update ------------------------------------------------------------------
function updatePlaying(dt) {
  game.elapsed += dt;
  const mouse = input.takeMouseDelta();
  if (mouse.x || mouse.y) chaseCam.orbit(mouse.x, mouse.y);

  if (input.consumePressed('Escape') || input.consumePressed('KeyP')) {
    game.mode = 'paused';
    document.getElementById('pause-stats').textContent =
      `$${Math.floor(game.cash)} in pocket · ${game.stats.missionsDone} jobs done · ${game.stats.carsDriven} cars driven · ${game.stats.racesDone || 0} races finished`;
    hud.showScreen('screen-pause');
    game.saveNow();
    return;
  }
  if (input.consumePressed('KeyM')) {
    sound.setMuted(!sound.muted);
    hud.toast(sound.muted ? 'Sound off.' : 'Sound on.');
  }
  if (input.consumePressed('KeyE')) tryToggleCar();
  if (input.consumePressed('KeyL') && game.inCar) {
    game.inCar.setHeadlights(!game.inCar.headlightsOn);
  }

  // The player, on foot or behind the wheel.
  let speedRatio = 0;
  if (game.inCar) {
    const car = game.inCar;
    const axis = input.axis();
    const impact = car.step(dt, {
      throttle: axis.z,
      steer: axis.x,
      handbrake: input.isDown('Space'),
    }, world.colliders, world.bounds);
    if (impact > 0) {
      sound.crash();
      if (impact > 13) {
        game.crime('hitCar');
        game.damage(impact > 18 ? 6 : 3);
      }
    }
    speedRatio = Math.abs(car.speed) / car.topSpeed;
    sound.engineHum(speedRatio);
    if (input.isDown('Space') && Math.abs(car.speed) > 8) sound.skid();
    hud.setSpeed(car.speed * 3.6, true);
  } else {
    player.update(dt, input, chaseCam.yaw, world);
    hud.setSpeed(0, false);
    // Combat: F or click punches, G shoves (see combat.js).
    if (input.consumePressed('KeyF') || input.takeClick()) combat.attack('punch', game, peds, police);
    if (input.consumePressed('KeyG')) combat.attack('shove', game, peds, police);
  }
  combat.update(dt);
  hud.setCrosshair(!game.inCar);

  // Contextual hint: combat keys near a pedestrian on foot, the race start
  // when approaching the cyan beacon in a car.
  if (game.inCar) {
    const dStart = Math.hypot(game.inCar.pos.x - CONFIG.race.start.x, game.inCar.pos.z - CONFIG.race.start.z);
    hud.setHint(!race.active() && dStart < 42 ? 'Street race — drive through the cyan beacon to start' : null);
  } else {
    hud.setHint(combat.nearestPedDist(player, peds) < 6 ? 'F / click — punch · G — shove' : null);
  }

  // Traffic, crowds, police, jobs.
  traffic.update(dt, game.inCar);
  const threats = [...traffic.all(), ...police.all()];
  if (game.inCar) threats.push(game.inCar);
  peds.update(dt, world, threats);
  const hitCheckCars = [...traffic.all(), ...police.all()];
  if (game.inCar) hitCheckCars.push(game.inCar);
  peds.checkCarHits(hitCheckCars, (ped, car) => {
    sound.crash();
    if (car === game.inCar) {
      game.crime('hitPed');
      game.damage(3);
      hud.toast('You hit someone! The bay is watching.');
    }
  });
  carContacts(dt);
  police.update(dt, game);
  raceOwnsBanner = race.update(dt, game);
  missions.update(dt, game);

  // HUD clock follows the day/night cycle (updated when the minute flips).
  const label = daynight.clockLabel();
  if (label !== lastClockLabel) {
    lastClockLabel = label;
    hud.setClock(label);
  }
  // Headlights come on automatically at nightfall, off again at dawn.
  const night = daynight.isNight();
  if (night !== wasNight) {
    wasNight = night;
    vehicles.setAllHeadlights(night);
    traffic.setAllHeadlights(night);
    for (const cop of police.all()) cop.setHeadlights(night);
    hud.toast(night ? 'Night falls on Solmar Bay — lights on.' : 'Dawn over the bay. Another day, another dollar.');
  }

  // Wanted decay while nothing fresh has happened.
  if (game.elapsed - game.lastCrimeAt > CONFIG.wanted.crimeWindow && game.heat > 0) {
    game.addHeat(-CONFIG.wanted.decayPerSec * dt * (game.stars() >= 3 ? 0.5 : 1));
    if (game.heat < 0.01) game.heat = 0;
    hud.setWanted(game.stars());
  }

  // Bust meter: a nearby officer + a nearly stopped target.
  const targetSpeed = game.inCar ? Math.abs(game.inCar.speed) : 0;
  const nearCop = police.nearestDistance(game.targetPos());
  if (game.stars() > 0 && nearCop < CONFIG.police.bustRadius && targetSpeed < 2.5) {
    game.bustFrac += dt / CONFIG.police.bustSeconds;
    if (game.bustFrac >= 1) { endRun('busted'); return; }
  } else {
    game.bustFrac = Math.max(0, game.bustFrac - dt * 1.4);
  }
  hud.setBust(game.bustFrac);

  // Health: slow recovery in calm moments; the end when it runs out.
  if (player.health <= 0) { endRun('wasted'); return; }
  if (game.stars() === 0 && game.elapsed - game.lastDamageAt > 5 && player.health < 100) {
    player.health = Math.min(100, player.health + dt * 1.4);
    hud.setHealth(player.health);
  }

  // Siren when the law is close.
  sound.siren(game.stars() > 0 && nearCop < 75);

  // Freshly spawned interceptors also get their lights on at night.
  if (wasNight) for (const cop of police.all()) if (!cop.headlightsOn) cop.setHeadlights(true);

  chaseCam.update(dt, game.targetPos(), game.targetHeading(), speedRatio, !input.dragging);
  drawMinimap(hud.el.minimap, {
    roads: world.roads,
    player: game.targetPos(),
    heading: game.targetHeading(),
    cops: police.all().map((c) => c.pos),
    marker: missions.marker(),
    raceMarker: race.marker(),
  });
}

// --- boot & loop -----------------------------------------------------------------------
const shotActive = applyShotMode(params, game);
window.__game = game;
hud.setClock(daynight.clockLabel());
if (!shotActive) hud.showScreen('screen-title');

const clock = new THREE.Clock();
let framesSinceBoot = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  if (game.mode !== 'paused') daynight.update(dt);
  if (game.mode === 'playing') updatePlaying(dt);
  else if (game.mode === 'paused' && (input.consumePressed('Escape') || input.consumePressed('KeyP'))) {
    game.mode = 'playing';
    hud.hideScreens();
    hud.showHud();
  } else if (game.mode === 'title') {
    game.elapsed += dt;
    if (game.shotTick) game.shotTick(game.elapsed);
    else game.orbitTitleCamera(game.elapsed);
  }
  renderer.render(scene, camera3d);
  input.endFrame();
  framesSinceBoot++;
  if (shotActive && framesSinceBoot > 6 && !window.__shotReady) window.__shotReady = true;
}
loop();
