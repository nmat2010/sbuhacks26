let ctx: AudioContext | null = null;

/** Filtered noise sweeping up with a square glide under it: the launch. Silent if audio is unavailable. */
export function whoosh(direction: 'up' | 'down' = 'up'): void {
  try {
    ctx = ctx ?? new AudioContext();
    if (ctx.state !== 'running') void ctx.resume();
    const ac = ctx;
    const t = ac.currentTime;
    const secs = 0.6;
    const frames = Math.floor(ac.sampleRate * secs);
    const buffer = ac.createBuffer(1, frames, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const noise = ac.createBufferSource();
    noise.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    const [f0, f1] = direction === 'down' ? [1800, 140] : [140, 1800];
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + secs);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.1, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + secs);
    noise.connect(filter).connect(gain).connect(ac.destination);
    noise.start(t);
    noise.stop(t + secs + 0.02);
    const osc = ac.createOscillator();
    osc.type = 'square';
    const [p0, p1] = direction === 'down' ? [620, 70] : [70, 620];
    osc.frequency.setValueAtTime(p0, t);
    osc.frequency.exponentialRampToValueAtTime(p1, t + secs * 0.85);
    const og = ac.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.03, t + 0.03);
    og.gain.exponentialRampToValueAtTime(0.0001, t + secs * 0.9);
    osc.connect(og).connect(ac.destination);
    osc.start(t);
    osc.stop(t + secs);
  } catch {
    // no audio: the transition is silent
  }
}

/** A short blip for each charge beat. */
export function blip(freq: number): void {
  try {
    ctx = ctx ?? new AudioContext();
    if (ctx.state !== 'running') void ctx.resume();
    const ac = ctx;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.03, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  } catch {
    // silent
  }
}
