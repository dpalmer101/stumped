/** Synthesised sounds; nothing plays until unlock() runs inside a user gesture. */
export class Sound {
  private ctx: AudioContext | null = null;

  constructor(public muted: boolean) {}

  unlock(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
    } catch {
      this.ctx = null;
    }
  }

  private tone(
    freq: number,
    start: number,
    length: number,
    type: OscillatorType = "square",
    volume = 0.08,
  ) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }

  private noise(start: number, length: number, volume: number, filterFreq: number) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + start;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + length * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start(t);
  }

  /** Timer pulse; pitch rises as time runs out. */
  pulse(msLeft: number): void {
    this.tone(msLeft <= 5000 ? 880 : msLeft <= 10_000 ? 660 : 440, 0, 0.08, "square", 0.05);
  }

  miss(): void {
    this.tone(180, 0, 0.12, "triangle", 0.1);
  }

  hit(runs: number): void {
    this.noise(0, 0.06, 0.4, 4000);
    if (runs >= 4) this.noise(0.05, runs >= 12 ? 2.2 : 1.2, runs >= 12 ? 0.35 : 0.2, 1200);
    if (runs >= 12) {
      [523, 659, 784, 1047].forEach((f, i) => {
        this.tone(f, 0.1 + i * 0.1, 0.18);
      });
    }
  }

  out(): void {
    this.tone(523, 0, 0.18);
    this.tone(392, 0.18, 0.18);
    this.tone(262, 0.36, 0.35);
  }
}
