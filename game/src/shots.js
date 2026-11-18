// Screenshot modes, chosen with ?shot=title|drive|chase|mission&seed=N.
// Each arranges the game into a real, playable state that shows off a
// different side of Solmar City, then main.js flags window.__shotReady once
// a few frames have rendered with the HUD laid out.

export function applyShotMode(params, game) {
  const mode = params.get('shot');
  if (!mode) return false;

  if (mode === 'title') {
    // Title screen over a slow orbit of the city; main.js runs the orbit.
    game.setShotTick((t) => game.orbitTitleCamera(t));
    return true;
  }

  game.startRun(null);

  if (mode === 'drive' || mode === 'chase') {
    const car = game.vehicles.all().find((c) => c.modelKey === 'cometa') || game.vehicles.all()[0];
    car.pos.set(69, 0, 196);
    car.heading = 0; // north up the east avenue
    car.speed = mode === 'drive' ? 23 : 27;
    game.debugEnterCar(car);
    game.camera.yaw = car.heading;
    game.camera.snapTo(car.pos);
    if (mode === 'chase') {
      game.debugSetHeat(65); // three stars
      const copA = game.police.spawnCop(car.pos);
      copA.pos.set(73, 0, 224);
      copA.heading = 0;
      copA.speed = 21;
      const copB = game.police.spawnCop(car.pos);
      copB.pos.set(64, 0, 238);
      copB.heading = 0;
      copB.speed = 19;
      game.hud.toast('SBPD — pull over, Milo!');
    }
    return true;
  }

  if (mode === 'mission') {
    // On foot at the plaza, Carmen's first fare live on the objective banner,
    // a cab waiting at the kerb, the marina beacon on the minimap.
    game.player.pos.set(26, 0, 46);
    game.player.heading = Math.PI * 0.8;
    const cab = game.vehicles.all().find((c) => c.modelKey === 'taxi');
    if (cab) {
      cab.pos.set(20, 0, 38);
      cab.heading = Math.PI;
    }
    game.missions.jumpToActive();
    game.camera.yaw = game.player.heading;
    game.camera.snapTo(game.player.pos);
    return true;
  }

  return false;
}
