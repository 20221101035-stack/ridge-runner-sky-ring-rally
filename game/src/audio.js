// audio.js — every sound is synthesised live with WebAudio: no audio files,
// no network, just oscillators and filtered noise. The engine hum follows
// the throttle, the wind follows the speed.

export function createAudio() {
  const audio = {
    ctx: null,
    muted: false,
    engineOsc: null,
    engineOsc2: null,
    engineGain: null,
    windSource: null,
    windFilter: null,
    windGain: null,
    started: false,
  };

  function ensureContext() {
    if (audio.ctx) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      audio.ctx = new Ctx();
    } catch {
      return false;
    }
    return true;
  }

  audio.unlock = () => {
    if (!ensureContext()) return;
    if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
    if (audio.started) return;
    audio.started = true;

    // Engine: two detuned saws through a low-pass, pitch follows throttle.
    audio.engineOsc = audio.ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 62;
    audio.engineOsc2 = audio.ctx.createOscillator();
    audio.engineOsc2.type = 'sawtooth';
    audio.engineOsc2.frequency.value = 93.5;
    const engineFilter = audio.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    audio.engineGain = audio.ctx.createGain();
    audio.engineGain.gain.value = 0;
    audio.engineOsc.connect(engineFilter);
    audio.engineOsc2.connect(engineFilter);
    engineFilter.connect(audio.engineGain);
    audio.engineGain.connect(audio.ctx.destination);
    audio.engineOsc.start();
    audio.engineOsc2.start();

    // Wind: looped white noise through a band-pass.
    const len = audio.ctx.sampleRate;
    const buffer = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    audio.windSource = audio.ctx.createBufferSource();
    audio.windSource.buffer = buffer;
    audio.windSource.loop = true;
    audio.windFilter = audio.ctx.createBiquadFilter();
    audio.windFilter.type = 'bandpass';
    audio.windFilter.frequency.value = 700;
    audio.windFilter.Q.value = 0.6;
    audio.windGain = audio.ctx.createGain();
    audio.windGain.gain.value = 0;
    audio.windSource.connect(audio.windFilter);
    audio.windFilter.connect(audio.windGain);
    audio.windGain.connect(audio.ctx.destination);
    audio.windSource.start();
  };

  audio.update = (throttle, speed, flying) => {
    if (!audio.ctx || !audio.started || audio.muted) return;
    const t = audio.ctx.currentTime;
    const engineLevel = flying ? 0.045 + throttle * 0.05 : 0.02;
    audio.engineGain.gain.setTargetAtTime(engineLevel, t, 0.1);
    audio.engineOsc.frequency.setTargetAtTime(52 + throttle * 66, t, 0.1);
    audio.engineOsc2.frequency.setTargetAtTime(78 + throttle * 99, t, 0.1);
    const windLevel = flying ? Math.min(0.12, (speed / 90) * 0.12) : 0;
    audio.windGain.gain.setTargetAtTime(windLevel, t, 0.15);
    audio.windFilter.frequency.setTargetAtTime(500 + speed * 9, t, 0.15);
  };

  function blip(freq, start, duration, type, level) {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime + start;
    const osc = audio.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = audio.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(audio.ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  audio.ring = () => {
    blip(880, 0, 0.5, 'sine', 0.16);
    blip(1318.5, 0.07, 0.6, 'sine', 0.13);
    blip(1760, 0.14, 0.7, 'sine', 0.08);
  };

  audio.warn = () => {
    blip(220, 0, 0.18, 'square', 0.07);
    blip(220, 0.22, 0.18, 'square', 0.07);
  };

  audio.crash = () => {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime;
    const len = Math.floor(audio.ctx.sampleRate * 0.5);
    const buffer = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const gain = audio.ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(audio.ctx.destination);
    src.start(t);
    blip(55, 0, 0.5, 'sine', 0.3);
  };

  audio.fanfare = () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(f, i * 0.11, 0.55, 'triangle', 0.14));
  };

  audio.toggleMute = () => {
    audio.muted = !audio.muted;
    if (audio.ctx) {
      const target = audio.muted ? 0 : 1;
      audio.ctx.destination.gain?.setTargetAtTime?.(target, audio.ctx.currentTime, 0.05);
    }
    if (audio.muted && audio.engineGain) audio.engineGain.gain.value = 0;
    if (audio.muted && audio.windGain) audio.windGain.gain.value = 0;
    return audio.muted;
  };

  return audio;
}
