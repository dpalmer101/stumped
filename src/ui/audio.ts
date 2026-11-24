const APPLAUSE_BANDS = [750, 1050, 1350, 1600];

const crowdFor = (runs: number) => ({
  length: runs >= 12 ? 3.5 : runs >= 4 ? 2.25 : 1.2,
  people: runs >= 12 ? 50 : runs >= 6 ? 28 : runs >= 4 ? 18 : runs >= 2 ? 8 : 4,
});

/** Synthesised sounds; nothing plays until unlock() runs inside a user gesture. */
export class Sound {
  private ctx: AudioContext | null = null;
  /** Everything plays through this, so muting silences sounds already under way. */
  private master: GainNode | null = null;

  constructor(private isMuted: boolean) {}

  get muted(): boolean {
    return this.isMuted;
  }

  set muted(value: boolean) {
    this.isMuted = value;
    if (this.master && this.ctx)
      this.master.gain.setValueAtTime(value ? 0 : 1, this.ctx.currentTime);
  }

  unlock(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.isMuted ? 0 : 1;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
      return;
    }
    // Mix the applause while nothing's happening, so a big hit doesn't stall a frame.
    const warm = () => {
      for (const runs of [1, 2, 4, 6, 12]) {
        const { length, people } = crowdFor(runs);
        this.applauseBuffers(length, people);
      }
    };
    if ("requestIdleCallback" in window) requestIdleCallback(warm);
    else setTimeout(warm, 500);
  }

  private tone(
    freq: number,
    start: number,
    length: number,
    type: OscillatorType = "square",
    volume = 0.08,
  ) {
    if (!this.ctx || !this.master || this.isMuted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }

  private noise(start: number, length: number, volume: number, filterFreq: number) {
    if (!this.ctx || !this.master || this.isMuted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(length);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + length * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
  }

  /** Timer pulse; pitch rises as time runs out. */
  pulse(msLeft: number): void {
    this.tone(msLeft <= 5000 ? 880 : msLeft <= 10_000 ? 660 : 440, 0, 0.08, "square", 0.05);
  }

  miss(): void {
    this.tone(180, 0, 0.12, "triangle", 0.1);
  }

  private noiseBuffer(length: number): AudioBuffer | null {
    if (!this.ctx) return null;
    const buffer = this.ctx.createBuffer(
      1,
      Math.ceil(this.ctx.sampleRate * length),
      this.ctx.sampleRate,
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private clapSample: AudioBuffer | null = null;

  /**
   * One hand clap: a few noise spikes a few milliseconds apart (palms never meet all at once),
   * then a quick decay.
   */
  private clap(): AudioBuffer | null {
    if (this.clapSample || !this.ctx) return this.clapSample;
    const rate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, Math.ceil(rate * 0.12), rate);
    const data = buffer.getChannelData(0);
    const spikes = [0, 0.004, 0.009];
    for (let i = 0; i < data.length; i++) {
      const t = i / rate;
      const flam = spikes.reduce(
        (sum, at) => (t >= at ? sum + Math.exp(-(t - at) / 0.004) : sum),
        0,
      );
      const tail = t >= 0.009 ? 0.45 * Math.exp(-(t - 0.009) / 0.04) : 0;
      data[i] = (Math.random() * 2 - 1) * Math.min(1, flam + tail);
    }
    this.clapSample = buffer;
    return buffer;
  }

  /** Mixed applause per crowd size, made once: mixing takes a few milliseconds. */
  private applauseCache = new Map<string, AudioBuffer[]>();

  /**
   * Applause: each person claps at their own steady pace. Claps are mixed into one buffer per
   * hand pitch, so a big crowd is a handful of nodes, not hundreds.
   */
  private applauseBuffers(length: number, people: number): AudioBuffer[] {
    const key = `${length}:${people}`;
    const cached = this.applauseCache.get(key);
    if (cached || !this.ctx) return cached ?? [];
    const sample = this.clap()?.getChannelData(0);
    if (!sample) return [];
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const bands = APPLAUSE_BANDS.map(() => new Float32Array(Math.ceil(rate * (length + 0.5))));
    for (let p = 0; p < people; p++) {
      const data = bands[p % bands.length];
      if (!data) continue;
      const loudness = 0.6 + Math.random() * 0.8;
      const gap = 1 / (4 + Math.random() * 2.5);
      // People join in quickly and stop at different times.
      const stop = length * (0.55 + Math.random() * 0.45);
      for (let t = Math.random() * 0.2; t < stop; t += gap * (0.9 + Math.random() * 0.2)) {
        const speed = 0.85 + Math.random() * 0.3;
        const offset = Math.floor(t * rate);
        for (let i = 0; offset + i < data.length; i++) {
          const pos = i * speed;
          const j = Math.floor(pos);
          if (j + 1 >= sample.length) break;
          const a = sample[j] ?? 0;
          const k = offset + i;
          data[k] = (data[k] ?? 0) + loudness * (a + ((sample[j + 1] ?? 0) - a) * (pos - j));
        }
      }
    }
    const buffers = bands.map((data) => {
      const buffer = ctx.createBuffer(1, data.length, rate);
      buffer.copyToChannel(data, 0);
      return buffer;
    });
    this.applauseCache.set(key, buffers);
    return buffers;
  }

  private applause(start: number, length: number, people: number, volume: number) {
    if (!this.ctx || !this.master || this.isMuted) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = volume;
    // Takes the edge off, like hearing the crowd from the middle rather than the front row.
    const soften = ctx.createBiquadFilter();
    soften.type = "lowpass";
    soften.frequency.value = 2800;
    out.connect(soften).connect(this.master);
    this.applauseBuffers(length, people).forEach((buffer, i) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      // Hands of different sizes ring at different pitches.
      const body = ctx.createBiquadFilter();
      body.type = "bandpass";
      body.frequency.value = APPLAUSE_BANDS[i] ?? 1000;
      body.Q.value = 1;
      src.connect(body).connect(out);
      src.start(ctx.currentTime + start);
    });
  }

  /**
   * Crowd voices: many detuned, wobbling voices through vowel formants, so it reads as people
   * rather than a synth. "Aah" rising for a cheer, "ooh" sinking for a groan.
   */
  private voices(
    start: number,
    length: number,
    volume: number,
    { pitch, glide, formants }: { pitch: number; glide: number; formants: number[] },
  ) {
    if (!this.ctx || !this.master || this.isMuted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + start;
    const out = ctx.createGain();
    out.gain.value = volume;
    out.connect(this.master);
    const vowel = formants.map((f, i) => {
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = f;
      band.Q.value = 6;
      const g = ctx.createGain();
      g.gain.value = [1, 0.6, 0.25][i] ?? 0.2;
      band.connect(g).connect(out);
      return band;
    });
    // Breath under the voices.
    const breath = ctx.createBufferSource();
    breath.buffer = this.noiseBuffer(length);
    const breathGain = ctx.createGain();
    breathGain.gain.setValueAtTime(0.0001, t);
    breathGain.gain.exponentialRampToValueAtTime(0.25, t + 0.2);
    breathGain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    breath.connect(breathGain);
    for (const band of vowel) breathGain.connect(band);
    breath.start(t);
    breath.stop(t + length);

    for (let i = 0; i < 18; i++) {
      const at = t + Math.random() * 0.25;
      const end = at + length * (0.7 + Math.random() * 0.3);
      const f = pitch * (0.75 + Math.random() * 0.6);
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(f, at);
      osc.frequency.exponentialRampToValueAtTime(f * glide, end);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 4 + Math.random() * 3;
      const depth = ctx.createGain();
      depth.gain.value = f * 0.025;
      lfo.connect(depth).connect(osc.frequency);
      const env = ctx.createGain();
      const peak = 0.03 + Math.random() * 0.04;
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(peak, at + 0.15);
      env.gain.setValueAtTime(peak, at + (end - at) * 0.4);
      env.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(env);
      for (const band of vowel) env.connect(band);
      for (const node of [osc, lfo]) {
        node.start(at);
        node.stop(end + 0.05);
      }
    }
  }

  hit(runs: number): void {
    this.noise(0, 0.06, 0.4, 4000);
    // The crowd grows with the shot: polite applause for a single, a roar for out of the ground.
    const { length, people } = crowdFor(runs);
    this.applause(0.15, length, people, runs >= 4 ? 0.5 : 0.6);
    if (runs >= 4) {
      const big = runs >= 12 ? 1 : runs >= 6 ? 0.7 : 0.4;
      this.voices(0.05, runs >= 12 ? 3.2 : 0.9 + big * 1.2, 0.5 + big * 0.7, {
        pitch: 260,
        glide: 1.2,
        formants: [750, 1200, 2600],
      });
    }
    if (runs >= 12) {
      [523, 659, 784, 1047].forEach((f, i) => {
        this.tone(f, 0.1 + i * 0.1, 0.18);
      });
    }
  }

  out(): void {
    this.voices(0, 1.35, 1, { pitch: 170, glide: 0.7, formants: [450, 800, 2400] });
    this.tone(523, 0, 0.18, "square", 0.04);
    this.tone(392, 0.18, 0.18, "square", 0.04);
    this.tone(262, 0.36, 0.35, "square", 0.04);
  }
}
