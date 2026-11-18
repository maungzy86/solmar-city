// Saving: a single localStorage record — cash, health, which mission comes
// next, where Milo is standing, and lifetime stats. Every function swallows
// its own errors: a browser that refuses storage must never break the game.

const KEY = 'solmar-city-save-v1';

export function saveGame(state) {
  try {
    const data = {
      cash: Math.floor(state.cash),
      health: state.health,
      missionIndex: state.missionIndex,
      loop: state.loop,
      player: { x: state.playerPos.x, z: state.playerPos.z },
      stats: state.stats,
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — nothing to clear */
  }
}
