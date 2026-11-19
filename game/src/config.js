// Solmar City — every tuning constant for the game lives here, in one place,
// so the feel of the city can be adjusted without hunting through modules.

// World layout: an 8x8 grid of city blocks. Each block is 60 units of
// buildings/sidewalk with a 12-unit road between blocks, so the pitch from
// one road centre to the next is 72 units and the whole city spans 576.
export const CONFIG = {
  blocksPerSide: 8,
  blockSize: 60,
  roadWidth: 12,
  pitch: 72,
  cityHalf: 288,          // roads run from -288 to +288 on both axes
  beachZ: 300,            // sand starts just south of the last road
  oceanZ: 330,            // water plane starts here
  canalRow: 2,            // the east-west road at this row index is a canal

  // The player on foot.
  walkSpeed: 6.2,
  runSpeed: 10.5,
  playerRadius: 0.55,
  playerHealth: 100,
  punchRange: 2.4,
  punchCooldown: 0.38,
  shoveRange: 2.9,
  shoveCooldown: 0.65,
  comboWindow: 2.6,       // seconds between hits for the combo to keep counting

  // Cars (arcade handling). Speeds are units/second; multiply by 3.6 for km/h.
  car: {
    accel: 15,
    brake: 26,
    reverseTop: 9,
    drag: 0.55,
    gripTurn: 1.55,       // steering strength at speed
    radius: 1.35,
    health: 100,
  },
  carModels: {
    cometa: { name: 'Cometa GT', topSpeed: 41, accelMul: 1.25, color: 0xe2483d },
    brisa: { name: 'Brisa sedan', topSpeed: 30, accelMul: 0.95, color: 0x3d7be2 },
    tortuga: { name: 'Tortuga van', topSpeed: 24, accelMul: 0.8, color: 0xd8d3c3 },
    faro: { name: 'Faro pickup', topSpeed: 28, accelMul: 0.9, color: 0x53a05a },
    taxi: { name: 'Solmar Cab', topSpeed: 30, accelMul: 0.95, color: 0xf2b134 },
    police: { name: 'SBPD Interceptor', topSpeed: 38, accelMul: 1.15, color: 0xf2f2f2 },
  },

  // Traffic and crowds.
  trafficCount: 14,
  trafficTopSpeed: 17,
  pedCount: 26,

  // Wanted system: thresholds are "heat" points; each star is 20 points.
  wanted: {
    perStar: 20,
    maxStars: 5,
    decayPerSec: 0.55,    // heat lost while no crime is fresh
    crimeWindow: 6,       // seconds a crime stays "fresh" and blocks decay
    hitCar: 7,
    hitPed: 16,
    punchPed: 12,
    shovePed: 14,
    stealCar: 6,
    ramPolice: 18,
  },

  // Street race: a checkpoint time trial that starts on the beachfront
  // avenue. Checkpoints sit on road intersections (the canal is crossed on
  // the x=-216 bridge). Payout = base + per-second bonus under target.
  race: {
    start: { x: 216, z: 288 },
    checkpoints: [
      { x: 72, z: 288 }, { x: -144, z: 288 }, { x: -216, z: 144 },
      { x: -216, z: -72 }, { x: -72, z: -216 }, { x: 144, z: -216 },
      { x: 216, z: -72 }, { x: 216, z: 144 },
    ],
    targetTime: 95,       // seconds; beat it for the time bonus
    hardLimit: 170,       // seconds; past this the run is void
    basePay: 150,
    bonusPerSec: 5,
    slowPay: 60,          // finishing over target still pays this
    startRadius: 7,
    checkpointRadius: 9,
    countdown: 3,
  },

  // Day/night cycle: one full in-game day lasts cycleSeconds of real time.
  // The day starts at startHour (17:40, matching the old static label).
  day: {
    cycleSeconds: 300,
    startHour: 17 + 40 / 60,
  },

  // Police response.
  police: {
    bustRadius: 7,
    bustSeconds: 2.6,     // standing close & slow this long = busted
    finePerStar: 60,
  },

  startCash: 120,
  dayLabel: 'Solmar Bay · 17:40',

  colors: {
    sky: 0x9fd8e8,
    fog: 0xf6cf9a,
    sun: 0xffdfae,
    sand: 0xecd39a,
    sea: 0x2e8fa3,
    asphalt: 0x3c4147,
    sidewalk: 0xcfc4ae,
    plaza: 0xd9c9a3,
  },

  // Story beats, in order; missions.js turns these into playable jobs.
  missions: [
    { id: 'fare', title: 'First Fare', giver: 'Carmen Solis', reward: 150 },
    { id: 'package', title: 'Hot Package', giver: 'Carmen Solis', reward: 220 },
    { id: 'hustle', title: 'Harbor Hustle', giver: 'Carmen Solis', reward: 300 },
    { id: 'cooloff', title: 'Cool-Off Run', giver: 'Carmen Solis', reward: 340 },
  ],
};

// The default world seed: the same city for every new game unless a
// screenshot mode or a saved game overrides it.
export function citySeed() {
  return 7;
}

// Road centre coordinates along one axis, from south/west to north/east.
export function roadLines() {
  const lines = [];
  for (let k = 0; k <= CONFIG.blocksPerSide; k++) lines.push(-CONFIG.cityHalf + k * CONFIG.pitch);
  return lines;
}

// The z of the canal (it replaces the east-west road at canalRow).
export function canalZ() {
  return -CONFIG.cityHalf + CONFIG.canalRow * CONFIG.pitch;
}
