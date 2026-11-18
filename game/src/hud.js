// The HUD: DOM overlays driven by the game loop — health, cash, speed,
// wanted stars, the objective banner, toasts, the bust meter and a red
// damage flash. The minimap canvas itself is drawn by minimap.js.

export class Hud {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      health: document.getElementById('health-bar'),
      cash: document.getElementById('cash'),
      clock: document.getElementById('clock'),
      wanted: document.getElementById('wanted'),
      speed: document.getElementById('speed'),
      objective: document.getElementById('objective'),
      minimap: document.getElementById('minimap'),
      bustWrap: document.getElementById('bust-wrap'),
      bustBar: document.getElementById('bust-bar'),
      crosshair: document.getElementById('crosshair'),
      vignette: document.getElementById('vignette'),
      toast: document.getElementById('toast'),
    };
    this.toastTimer = null;
    this.lastStars = -1;
    this.lastObjective = '';
    this.setWanted(0);
  }

  showHud() { this.el.hud.classList.remove('hidden'); }
  hideHud() { this.el.hud.classList.add('hidden'); }

  setHealth(v) {
    this.el.health.style.width = `${Math.max(0, Math.min(100, v))}%`;
  }

  setCash(v) {
    this.el.cash.textContent = `$${Math.floor(v).toLocaleString('en-US')}`;
  }

  setClock(text) { this.el.clock.textContent = text; }

  setSpeed(kmh, visible) {
    this.el.speed.classList.toggle('hidden', !visible);
    if (visible) this.el.speed.textContent = `${Math.round(Math.abs(kmh))} km/h`;
  }

  setWanted(stars) {
    if (stars === this.lastStars) return;
    this.lastStars = stars;
    let html = '';
    for (let i = 0; i < 5; i++) html += `<span class="${i < stars ? 'star-on' : 'star-off'}">★</span>`;
    this.el.wanted.innerHTML = html;
  }

  setObjective(title, sub) {
    const key = `${title}|${sub}`;
    if (key === this.lastObjective) return;
    this.lastObjective = key;
    if (!title) {
      this.el.objective.classList.add('hidden');
      return;
    }
    this.el.objective.classList.remove('hidden');
    this.el.objective.innerHTML = `${title}<span class="obj-sub">${sub || ''}</span>`;
  }

  toast(text, ms = 4200) {
    this.el.toast.textContent = text;
    this.el.toast.classList.remove('hidden');
    requestAnimationFrame(() => this.el.toast.classList.add('show'));
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.el.toast.classList.remove('show');
      setTimeout(() => this.el.toast.classList.add('hidden'), 300);
    }, ms);
  }

  setBust(frac) {
    if (frac <= 0) {
      this.el.bustWrap.classList.add('hidden');
      return;
    }
    this.el.bustWrap.classList.remove('hidden');
    this.el.bustBar.style.width = `${Math.min(100, frac * 100)}%`;
  }

  setCrosshair(visible) {
    this.el.crosshair.classList.toggle('hidden', !visible);
  }

  flashDamage() {
    this.el.vignette.style.opacity = '1';
    setTimeout(() => { this.el.vignette.style.opacity = '0'; }, 130);
  }

  showScreen(id) {
    for (const s of ['screen-title', 'screen-pause', 'screen-busted']) {
      document.getElementById(s).classList.toggle('hidden', s !== id);
    }
  }

  hideScreens() {
    for (const s of ['screen-title', 'screen-pause', 'screen-busted']) {
      document.getElementById(s).classList.add('hidden');
    }
  }
}
