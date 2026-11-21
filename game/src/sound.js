// Sound, synthesized only: no audio files, no network. Every effect is an
// oscillator through a gain envelope, made lazily on the first user gesture
// (browsers block audio before one). In a headless screenshot run there is
// no gesture, so every call is a safe no-op there.
export function createSound() {
  let context = null;

  function audio() {
    if (context) return context;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    } catch {
      return null;
    }
    return context;
  }

  function tone(freq, dur, type, vol, slideTo) {
    const ctx = audio();
    if (!ctx || ctx.state === 'suspended') return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {
      // Audio is decoration: never let it break the game.
    }
  }

  /** Unlock audio on the first gesture so later effects can sound. */
  function unlock() {
    const ctx = audio();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  return {
    unlock,
    /** A soft tick, panned by where the nearest guard is. */
    footstep(pan, vol) {
      const ctx = audio();
      if (!ctx || ctx.state === 'suspended') return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(90, ctx.currentTime);
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
        if (panner) {
          panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), ctx.currentTime);
          osc.connect(gain).connect(panner).connect(ctx.destination);
        } else {
          osc.connect(gain).connect(ctx.destination);
        }
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      } catch { /* ignore */ }
    },
    pickup() { tone(880, 0.12, 'sine', 0.12, 1320); },
    alarm() { tone(220, 0.35, 'sawtooth', 0.1, 110); tone(330, 0.3, 'square', 0.06, 165); },
    caught() { tone(160, 0.5, 'sawtooth', 0.14, 60); },
    levelClear() { tone(523, 0.14, 'sine', 0.12); setTimeout(() => tone(784, 0.2, 'sine', 0.12), 130); },
    win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'sine', 0.12), i * 140)); },
    click() { tone(660, 0.06, 'sine', 0.08); },
  };
}
