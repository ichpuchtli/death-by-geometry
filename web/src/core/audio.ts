import { SFX_NAMES, SFXName, GENERATED_SFX, MASTER_VOLUME, SFX_VOLUME, MUSIC_VOLUME } from '../config';

// ============================================================
// AudioManager — SFX + Procedural Music
// ============================================================

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private music: ProceduralMusic | null = null;
  private _muted = false;
  private _initialized = false;
  private _loading = false;

  get muted(): boolean { return this._muted; }
  get initialized(): boolean { return this._initialized; }

  /** Must be called from a user gesture (click/touch) */
  async init(): Promise<void> {
    if (this._initialized || this._loading) return;
    this._loading = true;

    try {
      this.ctx = new AudioContext();

      // Resume if suspended (Safari requirement)
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      // Gain chain: source -> sfx/musicGain -> masterGain -> destination
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = MASTER_VOLUME;
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = SFX_VOLUME;
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = MUSIC_VOLUME;
      this.musicGain.connect(this.masterGain);

      // Load all SFX (WAV + generated MP3)
      await this.loadAllSFX();
      await this.loadGeneratedSFX();

      // Create procedural music
      this.music = new ProceduralMusic(this.ctx, this.musicGain);

      // Restore mute state from localStorage
      const stored = localStorage.getItem('gg_muted');
      if (stored === 'true') {
        this._muted = true;
        this.masterGain.gain.value = 0;
      }

      this._initialized = true;
    } catch (e) {
      console.warn('Audio init failed:', e);
    }
    this._loading = false;
  }

  private async loadAllSFX(): Promise<void> {
    const promises = SFX_NAMES.map(async (name) => {
      try {
        const resp = await fetch(`./sounds/${name}.wav`);
        const arrayBuf = await resp.arrayBuffer();
        const audioBuf = await this.ctx!.decodeAudioData(arrayBuf);
        this.buffers.set(name, audioBuf);
      } catch (e) {
        console.warn(`Failed to load SFX: ${name}`, e);
      }
    });
    await Promise.all(promises);
  }

  private async loadGeneratedSFX(): Promise<void> {
    const entries = Object.entries(GENERATED_SFX);
    const promises = entries.map(async ([name, path]) => {
      try {
        const resp = await fetch(path);
        const arrayBuf = await resp.arrayBuffer();
        const audioBuf = await this.ctx!.decodeAudioData(arrayBuf);
        this.buffers.set(name, audioBuf);
      } catch (e) {
        console.warn(`Failed to load generated SFX: ${name}`, e);
      }
    });
    await Promise.all(promises);
  }

  /**
   * Procedural shotgun blast for the player's weapon. `pellets` is how many parallel
   * bullets went out this trigger pull (2–6). More pellets → a lower, beefier, wider
   * boom; fewer → a tight snappy crack. Short (~0.12s) and modest volume so the ~3/s
   * cadence never fatigues.
   */
  playShoot(pellets: number): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const t = Math.max(0, Math.min(1, (pellets - 2) / 4)); // 2→0 .. 6→1
    const dur = 0.11 + t * 0.06;

    // 1. Punch — sine thump that drops in pitch; deeper with more pellets
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    const startF = 220 - t * 70; // 220 → 150 Hz
    thump.frequency.setValueAtTime(startF, now);
    thump.frequency.exponentialRampToValueAtTime(48, now + dur);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.26 + t * 0.14, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.03);
    thump.connect(tg);
    tg.connect(this.sfxGain);
    thump.start(now);
    thump.stop(now + dur + 0.06);

    // 2. Crack — bandpassed noise burst; center drops (beefier) with more pellets
    const nlen = dur;
    const nbuf = ctx.createBuffer(1, (ctx.sampleRate * nlen) | 0, ctx.sampleRate);
    const nd = nbuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = nbuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    const cf = 1900 - t * 950; // 1900 → 950 Hz
    bp.frequency.setValueAtTime(cf, now);
    bp.frequency.exponentialRampToValueAtTime(cf * 0.4, now + nlen);
    bp.Q.value = 1 + t * 1.5;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.16 + t * 0.1, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + nlen);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(this.sfxGain);
    noise.start(now);

    // 3. Snap transient — a tiny high click for the attack edge
    const click = ctx.createOscillator();
    click.type = 'square';
    click.frequency.setValueAtTime(520 - t * 120, now);
    click.frequency.exponentialRampToValueAtTime(180, now + 0.03);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.09, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    click.connect(cg);
    cg.connect(this.sfxGain);
    click.start(now);
    click.stop(now + 0.05);
  }

  /** Play the game over transition sound */
  playGameOver(): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const buf = this.buffers.get('gameover');
    if (!buf) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buf;
    source.connect(this.sfxGain);
    source.start(0);
  }

  /** Play medal reveal flourish */
  playMedalReveal(): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const buf = this.buffers.get('medal-reveal');
    if (!buf) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.7;
    source.connect(gain);
    gain.connect(this.sfxGain);
    source.start(0);
  }

  playSFX(name: SFXName): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const buf = this.buffers.get(name);
    if (!buf) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buf;
    source.connect(this.sfxGain);
    source.start(0);
  }

  /** Play SFX at a reduced volume (for formation leakthrough) */
  playSFXAtVolume(name: SFXName, volume: number): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const buf = this.buffers.get(name);
    if (!buf) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.sfxGain);
    source.start(0);
  }

  /** Play a procedural group spawn sound for a formation */
  playFormationSpawn(formation: string, count: number): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    switch (formation) {
      case 'swarm': this.playFormationSwarm(count); break;
      case 'surround': this.playFormationSurround(count); break;
      case 'wall': this.playFormationWall(count); break;
      case 'pincer': this.playFormationPincer(count); break;
      case 'ambush': this.playFormationAmbush(count); break;
      case 'cascade': this.playFormationCascade(count); break;
    }
  }

  /** Swarm: Steady machine gun rattle, pitch rises */
  private playFormationSwarm(count: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const duration = Math.min(2.0, count * 0.04);
    // White noise source
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * duration | 0, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    // Bandpass filter: 600Hz → 900Hz
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(600, now);
    bp.frequency.linearRampToValueAtTime(900, now + duration);
    bp.Q.value = 2;
    // Square-wave LFO for amplitude modulation (25Hz = machine gun rattle)
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 25;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    const lfoOffset = ctx.createGain();
    lfoOffset.gain.value = 0.5;
    // AM: use lfo to modulate a gain node
    const amGain = ctx.createGain();
    amGain.gain.value = 0.5;
    lfo.connect(lfoGain);
    lfoGain.connect(amGain.gain);
    // Envelope
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0, now);
    env.gain.linearRampToValueAtTime(0.25, now + 0.03);
    env.gain.setValueAtTime(0.25, now + duration * 0.8);
    env.gain.exponentialRampToValueAtTime(0.001, now + duration);
    noise.connect(bp);
    bp.connect(amGain);
    amGain.connect(env);
    env.connect(this.sfxGain!);
    lfo.start(now);
    lfo.stop(now + duration);
    noise.start(now);
  }

  /** Surround: Sweeping whirr */
  private playFormationSurround(count: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const duration = Math.min(1.0, count * 0.02);
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * duration | 0, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    // Bandpass sweep: 800 → 1000 → 600
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(800, now);
    bp.frequency.linearRampToValueAtTime(1000, now + duration * 0.4);
    bp.frequency.linearRampToValueAtTime(600, now + duration);
    bp.Q.value = 3;
    // LFO: 20 → 28Hz
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.setValueAtTime(20, now);
    lfo.frequency.linearRampToValueAtTime(28, now + duration);
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    const amGain = ctx.createGain();
    amGain.gain.value = 0.5;
    lfo.connect(lfoGain);
    lfoGain.connect(amGain.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0, now);
    env.gain.linearRampToValueAtTime(0.22, now + 0.02);
    env.gain.setValueAtTime(0.22, now + duration * 0.7);
    env.gain.exponentialRampToValueAtTime(0.001, now + duration);
    noise.connect(bp);
    bp.connect(amGain);
    amGain.connect(env);
    env.connect(this.sfxGain!);
    lfo.start(now);
    lfo.stop(now + duration);
    noise.start(now);
  }

  /** Wall: Heavy stamps + sub-bass layer */
  private playFormationWall(_count: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const duration = 0.4;
    // Noise layer
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * duration | 0, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 300;
    bp.Q.value = 1.5;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 15;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    const amGain = ctx.createGain();
    amGain.gain.value = 0.5;
    lfo.connect(lfoGain);
    lfoGain.connect(amGain.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0, now);
    env.gain.linearRampToValueAtTime(0.3, now + 0.02);
    env.gain.setValueAtTime(0.3, now + duration * 0.6);
    env.gain.exponentialRampToValueAtTime(0.001, now + duration);
    noise.connect(bp);
    bp.connect(amGain);
    amGain.connect(env);
    env.connect(this.sfxGain!);
    lfo.start(now);
    lfo.stop(now + duration);
    noise.start(now);
    // Sub-bass layer
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(60, now);
    sub.frequency.exponentialRampToValueAtTime(30, now + duration);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.35, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + duration);
    sub.connect(sg);
    sg.connect(this.sfxGain!);
    sub.start(now);
    sub.stop(now + duration + 0.05);
  }

  /** Pincer: Double tap — two bursts with gap */
  private playFormationPincer(count: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const burstLen = Math.min(0.3, count * 0.015);
    const gap = 0.12;
    // Two bursts at different BP centers
    const centers = [500, 700];
    for (let b = 0; b < 2; b++) {
      const t = now + b * (burstLen + gap);
      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * burstLen | 0, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = centers[b];
      bp.Q.value = 2;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 30;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.5;
      const amGain = ctx.createGain();
      amGain.gain.value = 0.5;
      lfo.connect(lfoGain);
      lfoGain.connect(amGain.gain);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0, t);
      env.gain.linearRampToValueAtTime(0.25, t + 0.015);
      env.gain.setValueAtTime(0.25, t + burstLen * 0.7);
      env.gain.exponentialRampToValueAtTime(0.001, t + burstLen);
      noise.connect(bp);
      bp.connect(amGain);
      amGain.connect(env);
      env.connect(this.sfxGain!);
      lfo.start(t);
      lfo.stop(t + burstLen);
      noise.start(t);
    }
  }

  /** Ambush: Sharp crackle, decaying */
  private playFormationAmbush(count: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const duration = Math.min(1.0, count * 0.05);
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * duration | 0, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    // BP: 1200 → 600 (descending crackle)
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1200, now);
    bp.frequency.exponentialRampToValueAtTime(600, now + duration);
    bp.Q.value = 4;
    // LFO: 35 → 20Hz (decelerating)
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.setValueAtTime(35, now);
    lfo.frequency.linearRampToValueAtTime(20, now + duration);
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    const amGain = ctx.createGain();
    amGain.gain.value = 0.5;
    lfo.connect(lfoGain);
    lfoGain.connect(amGain.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0, now);
    env.gain.linearRampToValueAtTime(0.28, now + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, now + duration);
    noise.connect(bp);
    bp.connect(amGain);
    amGain.connect(env);
    env.connect(this.sfxGain!);
    lfo.start(now);
    lfo.stop(now + duration);
    noise.start(now);
  }

  /** Cascade: Accelerating stutter */
  private playFormationCascade(count: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const duration = Math.min(2.5, count * 0.05);
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * duration | 0, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    // BP: 500 → 1200 (ascending)
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(500, now);
    bp.frequency.exponentialRampToValueAtTime(1200, now + duration);
    bp.Q.value = 2.5;
    // LFO: 15 → 40Hz (accelerating)
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.setValueAtTime(15, now);
    lfo.frequency.exponentialRampToValueAtTime(40, now + duration);
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    const amGain = ctx.createGain();
    amGain.gain.value = 0.5;
    lfo.connect(lfoGain);
    lfoGain.connect(amGain.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0, now);
    env.gain.linearRampToValueAtTime(0.2, now + 0.03);
    env.gain.linearRampToValueAtTime(0.25, now + duration * 0.7);
    env.gain.exponentialRampToValueAtTime(0.001, now + duration);
    noise.connect(bp);
    bp.connect(amGain);
    amGain.connect(env);
    env.connect(this.sfxGain!);
    lfo.start(now);
    lfo.stop(now + duration);
    noise.start(now);
  }

  toggleMute(): boolean {
    this._muted = !this._muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this._muted ? 0 : MASTER_VOLUME;
    }
    try {
      localStorage.setItem('gg_muted', String(this._muted));
    } catch { /* ignore */ }
    return this._muted;
  }

  /** Update music intensity (0 = ambient/menu, 1 = max chaos) */
  setMusicIntensity(intensity: number): void {
    if (this.music) this.music.setIntensity(intensity);
  }

  startMusic(): void {
    if (this.music) this.music.start();
  }

  stopMusic(): void {
    if (this.music) this.music.stop();
  }

  /** Procedural kill signature SFX per enemy family */
  playKillSignature(family: string): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    switch (family) {
      case 'rhombus': this.playKillCrystal(); break;
      case 'pinwheel': this.playKillSpin(); break;
      case 'sierpinski': this.playKillFractal(); break;
    }
  }

  /** Sharp crystalline ping for rhombus kills */
  private playKillCrystal(): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2400, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.15);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  /** Spinning whoosh for pinwheel kills */
  private playKillSpin(): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(1600, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.3);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800;
    filter.Q.value = 2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  /** Layered fractal tones for sierpinski kills */
  private playKillFractal(): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const freqs = [880, 660, 440];
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const t = now + i * 0.06;
      osc.frequency.setValueAtTime(freqs[i], t);
      osc.frequency.exponentialRampToValueAtTime(freqs[i] * 0.3, t + 0.3);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.4);
    }
  }

  /** Rising sweep + impact for phase transitions */
  playPhaseTransition(): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Rising sweep
    const sweep = ctx.createOscillator();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(100, now);
    sweep.frequency.exponentialRampToValueAtTime(800, now + 0.4);
    const sweepFilter = ctx.createBiquadFilter();
    sweepFilter.type = 'lowpass';
    sweepFilter.frequency.setValueAtTime(200, now);
    sweepFilter.frequency.exponentialRampToValueAtTime(4000, now + 0.4);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.25, now);
    sg.gain.linearRampToValueAtTime(0.35, now + 0.3);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    sweep.connect(sweepFilter);
    sweepFilter.connect(sg);
    sg.connect(this.sfxGain);
    sweep.start(now);
    sweep.stop(now + 0.8);
    // Impact hit
    const impact = ctx.createOscillator();
    impact.type = 'sine';
    impact.frequency.setValueAtTime(200, now + 0.4);
    impact.frequency.exponentialRampToValueAtTime(60, now + 0.7);
    const ig = ctx.createGain();
    ig.gain.setValueAtTime(0.4, now + 0.4);
    ig.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    impact.connect(ig);
    ig.connect(this.sfxGain);
    impact.start(now + 0.4);
    impact.stop(now + 1.0);
  }

  /** Distinct arrival sting for elite enemies */
  playEliteArrive(): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Rising chime — two quick ascending tones
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const t = now + i * 0.08;
      osc.frequency.setValueAtTime(600 + i * 400, t);
      osc.frequency.exponentialRampToValueAtTime(800 + i * 500, t + 0.1);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  /** Satisfying crunch+chime for elite kills */
  playEliteKill(): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Bright major chord stab
    const freqs = [523, 659, 784]; // C5, E5, G5
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freqs[i], now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(now);
      osc.stop(now + 0.45);
    }
    // Sub thud
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(80, now);
    sub.frequency.exponentialRampToValueAtTime(30, now + 0.25);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.3, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    sub.connect(sg);
    sg.connect(this.sfxGain!);
    sub.start(now);
    sub.stop(now + 0.35);
  }

  /** Short warning buzz for incoming formation telegraph */
  playTelegraphWarning(): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.setValueAtTime(0.12, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  /** Empowering chime for recovery window start */
  playRecoveryStart(): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Rising power chord — bright ascending tones
    const freqs = [330, 440, 660]; // E4, A4, E5
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const t = now + i * 0.06;
      osc.frequency.setValueAtTime(freqs[i], t);
      osc.frequency.exponentialRampToValueAtTime(freqs[i] * 1.2, t + 0.15);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.45);
    }
    // Bright shimmer
    const shimmer = ctx.createOscillator();
    shimmer.type = 'triangle';
    shimmer.frequency.setValueAtTime(1320, now + 0.1);
    shimmer.frequency.exponentialRampToValueAtTime(880, now + 0.5);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.06, now + 0.1);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    shimmer.connect(sg);
    sg.connect(this.sfxGain!);
    shimmer.start(now + 0.1);
    shimmer.stop(now + 0.55);
  }

  /** Warning tone for recovery expiry */
  playRecoveryExpire(): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Descending two-tone warning
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const t = now + i * 0.12;
      osc.frequency.setValueAtTime(660 - i * 220, t);
      osc.frequency.exponentialRampToValueAtTime(330 - i * 110, t + 0.15);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(t);
      osc.stop(t + 0.25);
    }
  }

  /** Procedural BlackHole death explosion — scales with absorbed count */
  playBlackHoleDeath(absorbed: number): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const intensity = Math.min(absorbed / 12, 1);

    // 1. Deep sub-bass boom (swept sine 80Hz → 20Hz) — louder for supernova
    const boom = ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(80 + intensity * 40, now);
    boom.frequency.exponentialRampToValueAtTime(20, now + 1.0);
    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0.8 + intensity * 0.2, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 1.8 + intensity * 0.7);
    boom.connect(boomGain);
    boomGain.connect(this.sfxGain);
    boom.start(now);
    boom.stop(now + 2.0 + intensity * 0.7);

    // 2. Noise burst (white noise through bandpass for crunch)
    const noiseLen = 1.2 + intensity * 1.0;
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * noiseLen, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const noiseBP = ctx.createBiquadFilter();
    noiseBP.type = 'bandpass';
    noiseBP.frequency.setValueAtTime(400 + intensity * 600, now);
    noiseBP.frequency.exponentialRampToValueAtTime(80, now + noiseLen);
    noiseBP.Q.value = 1.5;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.45 + intensity * 0.35, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + noiseLen);
    noise.connect(noiseBP);
    noiseBP.connect(noiseGain);
    noiseGain.connect(this.sfxGain);
    noise.start(now);

    // 3. Reverb-like tail — descending tone cluster (longer tail: 2.5s)
    for (let i = 0; i < 3; i++) {
      const tail = ctx.createOscillator();
      tail.type = 'triangle';
      tail.frequency.setValueAtTime(200 + i * 80 + intensity * 100, now);
      tail.frequency.exponentialRampToValueAtTime(40 + i * 10, now + 2.0);
      const tGain = ctx.createGain();
      tGain.gain.setValueAtTime(0.14, now);
      tGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
      tail.connect(tGain);
      tGain.connect(this.sfxGain);
      tail.start(now + 0.02 * i);
      tail.stop(now + 2.7);
    }

    // 4. Metallic ring layer — shimmering high harmonic
    const ring = ctx.createOscillator();
    ring.type = 'sine';
    ring.frequency.setValueAtTime(1800 + intensity * 600, now);
    ring.frequency.exponentialRampToValueAtTime(600, now + 2.0);
    const ringGain = ctx.createGain();
    ringGain.gain.setValueAtTime(0.08 + intensity * 0.06, now);
    ringGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
    ring.connect(ringGain);
    ringGain.connect(this.sfxGain);
    ring.start(now);
    ring.stop(now + 2.7);
  }

  /** Supernova warning: rising sub-bass drone + high whine (1.5s) */
  playSupernovaWarning(): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1. Sub-bass drone: 30Hz rising to 50Hz over 1.5s
    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.setValueAtTime(30, now);
    drone.frequency.linearRampToValueAtTime(50, now + 1.5);
    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0.1, now);
    droneGain.gain.linearRampToValueAtTime(0.5, now + 1.2);
    droneGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    drone.connect(droneGain);
    droneGain.connect(this.sfxGain);
    drone.start(now);
    drone.stop(now + 1.6);

    // 2. High whine: 3kHz rising to 5kHz
    const whine = ctx.createOscillator();
    whine.type = 'sine';
    whine.frequency.setValueAtTime(3000, now);
    whine.frequency.exponentialRampToValueAtTime(5000, now + 1.5);
    const whineGain = ctx.createGain();
    whineGain.gain.setValueAtTime(0.02, now);
    whineGain.gain.linearRampToValueAtTime(0.12, now + 1.3);
    whineGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    whine.connect(whineGain);
    whineGain.connect(this.sfxGain);
    whine.start(now);
    whine.stop(now + 1.6);
  }

  /** Gravitational collapse — building low rumble + rising tension (~500ms) */
  playGravityCollapse(): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // Deep sub-rumble: sawtooth 30Hz, lowpass filtered, building volume
    const rumble = ctx.createOscillator();
    rumble.type = 'sawtooth';
    rumble.frequency.setValueAtTime(30, now);
    rumble.frequency.linearRampToValueAtTime(70, now + 0.5);
    const rumbleLP = ctx.createBiquadFilter();
    rumbleLP.type = 'lowpass';
    rumbleLP.frequency.setValueAtTime(60, now);
    rumbleLP.frequency.linearRampToValueAtTime(200, now + 0.45);
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.05, now);
    rg.gain.linearRampToValueAtTime(0.5, now + 0.4);
    rg.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    rumble.connect(rumbleLP);
    rumbleLP.connect(rg);
    rg.connect(this.sfxGain);
    rumble.start(now);
    rumble.stop(now + 0.6);

    // Rising tension sine: 150Hz → 800Hz, quiet, creates unease
    const tension = ctx.createOscillator();
    tension.type = 'sine';
    tension.frequency.setValueAtTime(150, now);
    tension.frequency.exponentialRampToValueAtTime(800, now + 0.45);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.02, now);
    tg.gain.linearRampToValueAtTime(0.2, now + 0.35);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    tension.connect(tg);
    tg.connect(this.sfxGain);
    tension.start(now);
    tension.stop(now + 0.55);

    // Sucking noise: bandpass noise sweeping down (sounds like air rushing inward)
    const noiseLen = 0.5;
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * noiseLen | 0, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const nBP = ctx.createBiquadFilter();
    nBP.type = 'bandpass';
    nBP.frequency.setValueAtTime(2000, now);
    nBP.frequency.exponentialRampToValueAtTime(100, now + 0.45);
    nBP.Q.value = 3;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.05, now);
    ng.gain.linearRampToValueAtTime(0.25, now + 0.3);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    noise.connect(nBP);
    nBP.connect(ng);
    ng.connect(this.sfxGain);
    noise.start(now);
  }

  /** Massive gravitational rebound — sub-bass impact + bright scatter (~1.5s) */
  playGravityRebound(): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1. Sub-bass impact: hard-hitting sine 120Hz → 20Hz
    const impact = ctx.createOscillator();
    impact.type = 'sine';
    impact.frequency.setValueAtTime(120, now);
    impact.frequency.exponentialRampToValueAtTime(20, now + 0.6);
    const ig = ctx.createGain();
    ig.gain.setValueAtTime(0.8, now);
    ig.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    impact.connect(ig);
    ig.connect(this.sfxGain);
    impact.start(now);
    impact.stop(now + 1.2);

    // 2. Noise crunch: white noise burst through sweeping bandpass
    const noiseLen = 0.8;
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * noiseLen | 0, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const nBP = ctx.createBiquadFilter();
    nBP.type = 'bandpass';
    nBP.frequency.setValueAtTime(800, now);
    nBP.frequency.exponentialRampToValueAtTime(100, now + noiseLen);
    nBP.Q.value = 1.5;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + noiseLen);
    noise.connect(nBP);
    nBP.connect(ng);
    ng.connect(this.sfxGain);
    noise.start(now);

    // 3. Bright scatter: descending triangle tones (debris flying outward)
    const scatterFreqs = [2400, 1800, 1200];
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const t = now + i * 0.03;
      osc.frequency.setValueAtTime(scatterFreqs[i], t);
      osc.frequency.exponentialRampToValueAtTime(200 + i * 50, t + 0.5);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.12, t);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(sg);
      sg.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.7);
    }

    // 4. Reverb tail: low rumble decay
    const tail = ctx.createOscillator();
    tail.type = 'sine';
    tail.frequency.setValueAtTime(60, now + 0.3);
    tail.frequency.exponentialRampToValueAtTime(25, now + 1.5);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.2, now + 0.3);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    tail.connect(tg);
    tg.connect(this.sfxGain);
    tail.start(now + 0.3);
    tail.stop(now + 1.6);
  }

  /** Low rumbling warning for incoming miniboss */
  playMinibossWarning(): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Deep pulsing rumble
    const rumble = ctx.createOscillator();
    rumble.type = 'sawtooth';
    rumble.frequency.setValueAtTime(40, now);
    rumble.frequency.setValueAtTime(45, now + 0.5);
    rumble.frequency.setValueAtTime(40, now + 1.0);
    rumble.frequency.setValueAtTime(50, now + 1.5);
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 120;
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0, now);
    rg.gain.linearRampToValueAtTime(0.35, now + 0.3);
    rg.gain.setValueAtTime(0.35, now + 2.0);
    rg.gain.exponentialRampToValueAtTime(0.001, now + 2.8);
    rumble.connect(rumbleFilter);
    rumbleFilter.connect(rg);
    rg.connect(this.sfxGain);
    rumble.start(now);
    rumble.stop(now + 3.0);
    // Warning klaxon — descending square wave pulses
    for (let i = 0; i < 3; i++) {
      const klaxon = ctx.createOscillator();
      klaxon.type = 'square';
      const t = now + i * 0.8;
      klaxon.frequency.setValueAtTime(300, t);
      klaxon.frequency.exponentialRampToValueAtTime(180, t + 0.3);
      const kFilter = ctx.createBiquadFilter();
      kFilter.type = 'lowpass';
      kFilter.frequency.value = 800;
      const kg = ctx.createGain();
      kg.gain.setValueAtTime(0.15, t);
      kg.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      klaxon.connect(kFilter);
      kFilter.connect(kg);
      kg.connect(this.sfxGain!);
      klaxon.start(t);
      klaxon.stop(t + 0.6);
    }
  }

  /** Dramatic bass drop for miniboss arrival */
  playMinibossArrive(): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Rising sweep into bass drop
    const sweep = ctx.createOscillator();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(60, now);
    sweep.frequency.exponentialRampToValueAtTime(400, now + 0.5);
    const sweepFilter = ctx.createBiquadFilter();
    sweepFilter.type = 'lowpass';
    sweepFilter.frequency.setValueAtTime(100, now);
    sweepFilter.frequency.exponentialRampToValueAtTime(2000, now + 0.5);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.2, now);
    sg.gain.linearRampToValueAtTime(0.4, now + 0.45);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    sweep.connect(sweepFilter);
    sweepFilter.connect(sg);
    sg.connect(this.sfxGain);
    sweep.start(now);
    sweep.stop(now + 0.9);
    // Bass impact
    const impact = ctx.createOscillator();
    impact.type = 'sine';
    impact.frequency.setValueAtTime(100, now + 0.5);
    impact.frequency.exponentialRampToValueAtTime(25, now + 1.2);
    const ig = ctx.createGain();
    ig.gain.setValueAtTime(0.6, now + 0.5);
    ig.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    impact.connect(ig);
    ig.connect(this.sfxGain);
    impact.start(now + 0.5);
    impact.stop(now + 1.6);
  }

  /** Cracking impact for miniboss stage break */
  playMinibossStageBreak(): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Heavy crack
    const crack = ctx.createOscillator();
    crack.type = 'sawtooth';
    crack.frequency.setValueAtTime(600, now);
    crack.frequency.exponentialRampToValueAtTime(80, now + 0.15);
    const cf = ctx.createBiquadFilter();
    cf.type = 'lowpass';
    cf.frequency.setValueAtTime(3000, now);
    cf.frequency.exponentialRampToValueAtTime(200, now + 0.2);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.4, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    crack.connect(cf);
    cf.connect(cg);
    cg.connect(this.sfxGain);
    crack.start(now);
    crack.stop(now + 0.4);
    // Sub thud
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(120, now);
    sub.frequency.exponentialRampToValueAtTime(30, now + 0.3);
    const subg = ctx.createGain();
    subg.gain.setValueAtTime(0.35, now);
    subg.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    sub.connect(subg);
    subg.connect(this.sfxGain);
    sub.start(now);
    sub.stop(now + 0.5);
  }

  /** Massive explosion chord for miniboss death */
  playMinibossDeath(): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Deep bass boom
    const boom = ctx.createOscillator();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(80, now);
    boom.frequency.exponentialRampToValueAtTime(15, now + 1.5);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.7, now);
    bg.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
    boom.connect(bg);
    bg.connect(this.sfxGain);
    boom.start(now);
    boom.stop(now + 2.2);
    // Triumph chord: C4, E4, G4, C5
    const freqs = [262, 330, 392, 523];
    for (const freq of freqs) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.15, now + 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      osc.connect(g);
      g.connect(this.sfxGain!);
      osc.start(now + 0.1);
      osc.stop(now + 1.3);
    }
    // Noise crash
    const noiseLen = 1.5;
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * noiseLen, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.setValueAtTime(800, now);
    nf.frequency.exponentialRampToValueAtTime(100, now + noiseLen);
    nf.Q.value = 1;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.3, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + noiseLen);
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(this.sfxGain);
    noise.start(now);
    // Shimmer tail
    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(1047, now + 0.5);
    shimmer.frequency.exponentialRampToValueAtTime(523, now + 2.0);
    const shg = ctx.createGain();
    shg.gain.setValueAtTime(0.08, now + 0.5);
    shg.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
    shimmer.connect(shg);
    shg.connect(this.sfxGain);
    shimmer.start(now + 0.5);
    shimmer.stop(now + 2.2);
  }

  /** Resume AudioContext if suspended (call on user gesture) */
  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }
}

// ============================================================
// ProceduralMusic — 4-layer adaptive synthwave
// ============================================================

class ProceduralMusic {
  private ctx: AudioContext;
  private output: GainNode;
  private playing = false;
  private intensity = 0;

  // Layers
  private bassOsc: OscillatorNode | null = null;
  private bassGain: GainNode | null = null;
  private padOsc: OscillatorNode | null = null;
  private padOsc2: OscillatorNode | null = null;
  private padGain: GainNode | null = null;

  // Rhythm layer
  private rhythmInterval: number = 0;
  private rhythmGain: GainNode | null = null;

  // Arpeggio layer
  private arpInterval: number = 0;
  private arpGain: GainNode | null = null;
  private arpOsc: OscillatorNode | null = null;
  private arpNoteIndex = 0;

  // Lead layer
  private leadGain: GainNode | null = null;
  private leadOsc: OscillatorNode | null = null;
  private leadInterval: number = 0;
  private leadNoteIndex = 0;

  // Musical scales (A minor pentatonic for synthwave feel)
  private bassNotes = [55, 65.41, 73.42, 82.41]; // A1, C2, D2, E2
  private arpNotes = [220, 261.63, 293.66, 329.63, 392, 440]; // A3, C4, D4, E4, G4, A4
  private leadNotes = [440, 523.25, 587.33, 659.26, 783.99, 880]; // A4, C5, D5, E5, G5, A5

  private bassNoteIndex = 0;
  private bassChangeTimer = 0;

  constructor(ctx: AudioContext, output: GainNode) {
    this.ctx = ctx;
    this.output = output;
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;

    // Layer 1: Bass — deep sawtooth through lowpass
    this.bassGain = this.ctx.createGain();
    this.bassGain.gain.value = 0.3;
    const bassFilter = this.ctx.createBiquadFilter();
    bassFilter.type = 'lowpass';
    bassFilter.frequency.value = 200;
    bassFilter.Q.value = 2;
    this.bassOsc = this.ctx.createOscillator();
    this.bassOsc.type = 'sawtooth';
    this.bassOsc.frequency.value = this.bassNotes[0];
    this.bassOsc.connect(bassFilter);
    bassFilter.connect(this.bassGain);
    this.bassGain.connect(this.output);
    this.bassOsc.start();

    // Layer 1b: Pad — soft detuned triangle oscillators
    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.15;
    this.padOsc = this.ctx.createOscillator();
    this.padOsc.type = 'triangle';
    this.padOsc.frequency.value = 110;
    this.padOsc2 = this.ctx.createOscillator();
    this.padOsc2.type = 'triangle';
    this.padOsc2.frequency.value = 112; // slight detune for width
    this.padOsc.connect(this.padGain);
    this.padOsc2.connect(this.padGain);
    this.padGain.connect(this.output);
    this.padOsc.start();
    this.padOsc2.start();

    // Layer 2: Rhythm — periodic clicks/kicks
    this.rhythmGain = this.ctx.createGain();
    this.rhythmGain.gain.value = 0;
    this.rhythmGain.connect(this.output);
    this.startRhythm();

    // Layer 3: Arpeggio — fast notes
    this.arpGain = this.ctx.createGain();
    this.arpGain.gain.value = 0;
    const arpFilter = this.ctx.createBiquadFilter();
    arpFilter.type = 'lowpass';
    arpFilter.frequency.value = 2000;
    this.arpOsc = this.ctx.createOscillator();
    this.arpOsc.type = 'square';
    this.arpOsc.frequency.value = this.arpNotes[0];
    this.arpOsc.connect(arpFilter);
    arpFilter.connect(this.arpGain);
    this.arpGain.connect(this.output);
    this.arpOsc.start();
    this.startArpeggio();

    // Layer 4: Lead melody — sine with vibrato
    this.leadGain = this.ctx.createGain();
    this.leadGain.gain.value = 0;
    this.leadOsc = this.ctx.createOscillator();
    this.leadOsc.type = 'sine';
    this.leadOsc.frequency.value = this.leadNotes[0];
    this.leadOsc.connect(this.leadGain);
    this.leadGain.connect(this.output);
    this.leadOsc.start();
    this.startLead();

    this.setIntensity(0);
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;

    // Stop all oscillators
    [this.bassOsc, this.padOsc, this.padOsc2, this.arpOsc, this.leadOsc].forEach(osc => {
      if (osc) { try { osc.stop(); } catch { /* ignore */ } }
    });

    // Clear intervals
    if (this.rhythmInterval) clearInterval(this.rhythmInterval);
    if (this.arpInterval) clearInterval(this.arpInterval);
    if (this.leadInterval) clearInterval(this.leadInterval);

    this.bassOsc = this.padOsc = this.padOsc2 = this.arpOsc = this.leadOsc = null;
  }

  setIntensity(val: number): void {
    this.intensity = Math.max(0, Math.min(1, val));
    if (!this.playing) return;

    const t = this.ctx.currentTime;
    const ramp = 0.5; // seconds to transition

    // Bass always plays; louder with intensity
    if (this.bassGain) {
      this.bassGain.gain.linearRampToValueAtTime(0.2 + this.intensity * 0.25, t + ramp);
    }

    // Pad fades slightly at high intensity
    if (this.padGain) {
      this.padGain.gain.linearRampToValueAtTime(0.15 - this.intensity * 0.05, t + ramp);
    }

    // Rhythm fades in after 0.2 intensity
    if (this.rhythmGain) {
      const rv = this.intensity > 0.2 ? Math.min((this.intensity - 0.2) / 0.3, 1) * 0.2 : 0;
      this.rhythmGain.gain.linearRampToValueAtTime(rv, t + ramp);
    }

    // Arpeggio fades in after 0.5 intensity
    if (this.arpGain) {
      const av = this.intensity > 0.5 ? Math.min((this.intensity - 0.5) / 0.3, 1) * 0.15 : 0;
      this.arpGain.gain.linearRampToValueAtTime(av, t + ramp);
    }

    // Lead fades in after 0.7 intensity (boss encounters)
    if (this.leadGain) {
      const lv = this.intensity > 0.7 ? Math.min((this.intensity - 0.7) / 0.3, 1) * 0.12 : 0;
      this.leadGain.gain.linearRampToValueAtTime(lv, t + ramp);
    }
  }

  private startRhythm(): void {
    const kick = () => {
      if (!this.playing || !this.ctx || !this.rhythmGain) return;
      // Create a quick noise burst for percussion
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 80;
      const env = this.ctx.createGain();
      env.gain.value = 0.8;
      env.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
      osc.connect(env);
      env.connect(this.rhythmGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.12);
      // Frequency drop for kick feel
      osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.08);
    };

    // Tempo varies with intensity (120-160 BPM)
    const bpm = () => 120 + this.intensity * 40;
    const scheduleNext = () => {
      if (!this.playing) return;
      kick();
      this.rhythmInterval = window.setTimeout(scheduleNext, 60000 / bpm());
    };
    scheduleNext();
  }

  private startArpeggio(): void {
    const step = () => {
      if (!this.playing || !this.arpOsc) return;
      const note = this.arpNotes[this.arpNoteIndex % this.arpNotes.length];
      this.arpOsc.frequency.setValueAtTime(note, this.ctx.currentTime);
      this.arpNoteIndex++;
    };

    // Arpeggio speed: 8th notes at current BPM
    const bpm = () => 120 + this.intensity * 40;
    const scheduleNext = () => {
      if (!this.playing) return;
      step();
      this.arpInterval = window.setTimeout(scheduleNext, 60000 / bpm() / 2);
    };
    scheduleNext();
  }

  private startLead(): void {
    const step = () => {
      if (!this.playing || !this.leadOsc) return;
      const note = this.leadNotes[this.leadNoteIndex % this.leadNotes.length];
      this.leadOsc.frequency.setValueAtTime(note, this.ctx.currentTime);
      this.leadNoteIndex++;
    };

    const bpm = () => 120 + this.intensity * 40;
    const scheduleNext = () => {
      if (!this.playing) return;
      step();
      this.leadInterval = window.setTimeout(scheduleNext, 60000 / bpm());
    };
    scheduleNext();
  }
}
