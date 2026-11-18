// All sound in Solmar City is synthesised with WebAudio — there are no audio
// files. The context is created lazily on the first call, so every method is
// safe to call before the player's first click or keypress.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenNodes = null;
    this.musicTimer = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.03);
  }

  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = null) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 0.25, freq = 1200) {
    const ctx = this.ensure();
    if (!ctx || this.muted) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }

  uiClick() { this.tone(660, 0.07, 'triangle', 0.15); }
  pickup() { this.tone(880, 0.09, 'sine', 0.2); this.tone(1320, 0.12, 'sine', 0.18, 0.07); }
  missionSting() {
    this.tone(523, 0.14, 'triangle', 0.22);
    this.tone(659, 0.14, 'triangle', 0.22, 0.12);
    this.tone(784, 0.22, 'triangle', 0.24, 0.24);
  }
  gunshot() { this.noise(0.14, 0.4, 3000); this.tone(150, 0.1, 'square', 0.2, 0, 60); }
  punch() { this.noise(0.08, 0.3, 700); }
  crash() { this.noise(0.3, 0.45, 500); this.tone(90, 0.28, 'sawtooth', 0.18, 0, 40); }
  skid() { this.noise(0.16, 0.1, 2600); }

  // A soft two-oscillator engine hum whose pitch follows the car's speed.
  engineHum(speed01) {
    const ctx = this.ensure();
    if (!ctx) return;
    if (!this.engineOsc) {
      this.engineOsc = ctx.createOscillator();
      this.engineGain = ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    }
    const t = ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 165, t, 0.08);
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : 0.028 + speed01 * 0.05, t, 0.1);
  }
  engineOff() {
    if (this.engineGain && this.ctx) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
  }

  // Two-tone police siren loop.
  siren(on) {
    const ctx = this.ensure();
    if (!ctx) return;
    if (on && !this.sirenNodes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 840;
      lfo.frequency.value = 0.65;
      lfoGain.gain.value = 190;
      lfo.connect(lfoGain).connect(osc.frequency);
      gain.gain.value = 0.035;
      osc.connect(gain).connect(this.master);
      osc.start();
      lfo.start();
      this.sirenNodes = { osc, lfo, gain };
    } else if (!on && this.sirenNodes) {
      const { osc, lfo, gain } = this.sirenNodes;
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      const stopAt = ctx.currentTime + 0.25;
      try { osc.stop(stopAt); lfo.stop(stopAt); } catch { /* already stopped */ }
      this.sirenNodes = null;
    }
  }

  // A laid-back original loop: soft bass line plus hat ticks, scheduled
  // bar by bar. Quiet enough to sit under the game.
  startMusic() {
    const ctx = this.ensure();
    if (!ctx || this.musicTimer) return;
    const bassLine = [110, 110, 130.8, 98, 110, 110, 164.8, 146.8];
    let step = 0;
    const playBar = () => {
      if (this.muted) return;
      const base = step * 4;
      for (let i = 0; i < 4; i++) {
        this.tone(bassLine[(base + i) % bassLine.length], 0.22, 'triangle', 0.1, i * 0.24);
        this.noise(0.03, 0.03, 6000);
      }
      step++;
    };
    playBar();
    this.musicTimer = setInterval(playBar, 960);
  }
  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}
