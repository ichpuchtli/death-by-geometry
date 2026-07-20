import { SFX_NAMES, SFXName, GENERATED_SFX, MASTER_VOLUME, SFX_VOLUME, MUSIC_VOLUME } from '../config';

/** Supernova detonation sound variants — A/B tested in the Threat Lab (`?threat=1`). */
export type SupernovaSoundVariant = 'classic' | 'subdrop' | 'doom' | 'quake';

/** Per-bullet-hit BlackHole sound variants — previewed in the BlackHole FX Lab (`?blackhole=1`). */
export type BlackHoleHitVariant = 'thud' | 'gulp' | 'crack';

// ============================================================
// AudioManager — SFX + Procedural Music
// ============================================================

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private music: ProceduralMusic | null = null;
  private _muted = false;
  private _initialized = false;
  private _loading = false;
  private wantMusic = false; // startMusic() called before init() finished → start once ready
  private timeScale = 1;

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
      this.musicFilter = this.ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 18000;
      this.musicGain.connect(this.musicFilter);
      this.musicFilter.connect(this.masterGain);

      // Load all SFX (WAV + generated MP3)
      await this.loadAllSFX();
      await this.loadGeneratedSFX();

      // Create procedural music
      this.music = new ProceduralMusic(this.ctx, this.musicGain);
      this.music.setTimeScale(this.timeScale);

      // Restore mute state from localStorage
      const stored = localStorage.getItem('gg_muted');
      if (stored === 'true') {
        this._muted = true;
        this.masterGain.gain.value = 0;
      }

      this._initialized = true;

      // If startMusic() was called before init finished (the normal first-run path — the game
      // starts on the same gesture that kicks off init), start the music now that it exists.
      if (this.wantMusic && !this._muted) {
        this.music.start();
      }
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
   * "Deep Thump" weapon blast (picked in the Player Design Lab) — a saturated sub-bass
   * kick that drops in pitch, so every trigger pull lands like a heavy percussive hit
   * rather than a bright crack. `pellets` (2–6) makes it a touch deeper, longer, and
   * louder as the weapon ramps, so a 6-pellet Hex Storm feels heavier than the 2-pellet
   * Twin. Saturated (tanh WaveShaper) so the low sub reads on laptop speakers.
   */
  playShoot(pellets: number): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const t = Math.max(0, Math.min(1, (pellets - 2) / 4)); // 2→0 .. 6→1
    const dur = 0.2 + t * 0.06; // 0.20 → 0.26s

    // Sub-bass thump: pitch drops from ~130→30 Hz; deeper/longer with more pellets.
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130 - t * 20, now); // 130 → 110 Hz
    o.frequency.exponentialRampToValueAtTime(32 - t * 6, now + dur); // 32 → 26 Hz
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.38 + t * 0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.04);
    const sat = this.makeSaturator(2.5 + t * 1.5); // harmonics so the sub cuts through
    o.connect(sat);
    sat.connect(g);
    g.connect(this.sfxGain);
    o.start(now);
    o.stop(now + dur + 0.08);

    // Tiny click transient for the attack edge so the hit reads at low volume.
    const click = ctx.createOscillator();
    click.type = 'triangle';
    click.frequency.setValueAtTime(320, now);
    click.frequency.exponentialRampToValueAtTime(90, now + 0.03);
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.07, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    click.connect(cg);
    cg.connect(this.sfxGain);
    click.start(now);
    click.stop(now + 0.05);
  }

  /**
   * Boss "subtle bite" — a soft, short tick played on each non-killing hit to a boss.
   * `intensity` (0 pristine → 1 near death) climbs the pitch + brightness so a boss
   * audibly "rings higher" as it takes damage, telegraphing that it's close to breaking.
   * Deliberately quiet + brief so it layers under the weapon fire without fatigue.
   */
  playBossHit(intensity: number): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const t = Math.min(1, Math.max(0, intensity));

    // Bright filtered blip whose pitch rises with damage.
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const base = 420 + t * 520; // 420 → 940 Hz
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.55, now + 0.06);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = base;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05 + t * 0.05, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);

    // Tiny noise transient for a crisp "chip off" edge.
    const chip = this.makeNoiseSource(0.03);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2600;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.04 + t * 0.03, now);
    cg.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    chip.connect(hp);
    hp.connect(cg);
    cg.connect(this.sfxGain);
    chip.start(now);
  }

  /**
   * Boss damage "chunk" — heavier punctuation when a boss crosses a damage milestone
   * (¼/½/¾ HP). A short cracked thud + a rising shard so a slab of the boss visibly and
   * audibly gives way. `intensity` (0→1) deepens/brightens it toward the final break.
   */
  playBossHitMilestone(intensity: number): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const t = Math.min(1, Math.max(0, intensity));

    // Low cracked thud — the structural give.
    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(180 - t * 40, now); // deeper as it nears death
    thud.frequency.exponentialRampToValueAtTime(48, now + 0.22);
    const sat = this.makeSaturator(2.5);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.32 + t * 0.12, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    thud.connect(sat);
    sat.connect(tg);
    tg.connect(this.sfxGain);
    thud.start(now);
    thud.stop(now + 0.34);

    // Bright shard crack — a rising sliver on top so it reads as fracturing, not just bass.
    const shard = ctx.createOscillator();
    shard.type = 'triangle';
    shard.frequency.setValueAtTime(700 + t * 500, now);
    shard.frequency.exponentialRampToValueAtTime(1500 + t * 700, now + 0.09);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.1, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    shard.connect(sg);
    sg.connect(this.sfxGain);
    shard.start(now);
    shard.stop(now + 0.16);
  }

  /** Play the game over transition sound */
  playGameOver(): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const buf = this.buffers.get('gameover');
    if (!buf) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buf;
    source.playbackRate.value = this.timeScale;
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
    source.playbackRate.value = this.timeScale;
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
    source.playbackRate.value = this.timeScale;
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
    source.playbackRate.value = this.timeScale;
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

  /** Apply the current universe time scale to procedural music pitch/tempo and its mix. */
  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0.2, Math.min(1, scale));
    if (this.music) this.music.setTimeScale(this.timeScale);
    if (this.ctx && this.musicFilter) {
      const cutoff = 900 + 17100 * this.timeScale * this.timeScale;
      this.musicFilter.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.04);
    }
  }

  /** Real-clock transition cue: a heavy descending gravitational fall. */
  playTimeDilationEnter(): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(105, now);
    sub.frequency.exponentialRampToValueAtTime(24, now + 0.32);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.7, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    const sat = this.makeSaturator(3);
    sub.connect(sat);
    sat.connect(sg);
    sg.connect(this.sfxGain);
    sub.start(now);
    sub.stop(now + 0.6);

    const fall = this.makeNoiseSource(0.48);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 4;
    bp.frequency.setValueAtTime(4200, now);
    bp.frequency.exponentialRampToValueAtTime(180, now + 0.42);
    const fg = ctx.createGain();
    fg.gain.setValueAtTime(0.28, now);
    fg.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    fall.connect(bp);
    bp.connect(fg);
    fg.connect(this.sfxGain);
    fall.start(now);
  }

  /** Real-clock transition cue: accelerating tape-spool wind-up and a clean snap. */
  playTimeDilationExit(): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const rise = ctx.createOscillator();
    rise.type = 'sawtooth';
    rise.frequency.setValueAtTime(55, now);
    rise.frequency.exponentialRampToValueAtTime(1300, now + 0.38);
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.06, now);
    rg.gain.linearRampToValueAtTime(0.26, now + 0.3);
    rg.gain.exponentialRampToValueAtTime(0.001, now + 0.43);
    rise.connect(rg);
    rg.connect(this.sfxGain);
    rise.start(now);
    rise.stop(now + 0.45);
    const snap = this.makeNoiseSource(0.05);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.001, now);
    ng.gain.setValueAtTime(0.45, now + 0.39);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
    snap.connect(hp);
    hp.connect(ng);
    ng.connect(this.sfxGain);
    snap.start(now + 0.39);
  }

  startMusic(): void {
    // startGame() calls this synchronously right after kicking off the async init() on the
    // first user gesture, so `this.music` isn't created yet — record the intent and let init()
    // start it once ready. Without this, music never plays on the first playthrough.
    this.wantMusic = true;
    if (this.music) this.music.start();
  }

  stopMusic(): void {
    this.wantMusic = false;
    if (this.music) this.music.stop();
  }

  /** Procedural kill signature SFX per enemy family */
  playKillSignature(family: string): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    switch (family) {
      case 'rhombus': this.playKillCrystal(); break;
      case 'pinwheel': this.playKillSpin(); break;
      case 'sierpinski': this.playKillFractal(); break;
      // Small orbs/children (circle flocks from supernovae, shards, minimandels) —
      // a short pitch-varied bubble pop so a whole flock crackles instead of going silent.
      case 'circle':
      case 'shard':
      case 'minimandel':
        this.playKillPop();
        break;
    }
  }

  /** Short, soft, pitch-varied bubble pop for small orbs/children (circle flock kills). */
  private playKillPop(): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const base = 820 + Math.random() * 520; // varied pitch so a flock reads as a crackle
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.38, now + 0.09);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.sfxGain!);
    osc.start(now);
    osc.stop(now + 0.14);
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

  /** Supernova warning: rising sub-bass drone + high whine. Duration matches the destabilize window. */
  playSupernovaWarning(durationMs: number = 1500): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = Math.max(0.2, durationMs / 1000);

    // 1. Sub-bass drone: 30Hz rising to 50Hz over the warning window
    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.setValueAtTime(30, now);
    drone.frequency.linearRampToValueAtTime(50, now + dur);
    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0.1, now);
    droneGain.gain.linearRampToValueAtTime(0.5, now + dur * 0.8);
    droneGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    drone.connect(droneGain);
    droneGain.connect(this.sfxGain);
    drone.start(now);
    drone.stop(now + dur + 0.1);

    // 2. High whine: 3kHz rising to 5kHz
    const whine = ctx.createOscillator();
    whine.type = 'sine';
    whine.frequency.setValueAtTime(3000, now);
    whine.frequency.exponentialRampToValueAtTime(5000, now + dur);
    const whineGain = ctx.createGain();
    whineGain.gain.setValueAtTime(0.02, now);
    whineGain.gain.linearRampToValueAtTime(0.12, now + dur * 0.87);
    whineGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    whine.connect(whineGain);
    whineGain.connect(this.sfxGain);
    whine.start(now);
    whine.stop(now + dur + 0.1);
  }

  /**
   * BlackHole spawn: a deep, ominous bass swell as the gravity well tears open in space.
   * Low & weighty — a saturated sub sweeping DOWN (matter collapsing inward), a slow detuned
   * beat for unease, and a low-passed noise rumble for the "tearing" texture. Roughly matches
   * the 3s spawn telegraph so the sound and the growing warning ring land together.
   */
  playBlackHoleSpawn(volume: number = 1): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const v = Math.min(1, Math.max(0, volume));

    // 1. Deep saturated sub — sweeps 70→28Hz as the well opens. Saturation adds harmonics so
    //    the sub reads as WEIGHT even on laptop speakers.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(70, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + 1.7);
    const sat = this.makeSaturator(3.0);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.exponentialRampToValueAtTime(0.6 * v, now + 0.3);
    subGain.gain.setValueAtTime(0.6 * v, now + 1.0);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 2.1);
    sub.connect(sat);
    sat.connect(subGain);
    subGain.connect(this.sfxGain);
    sub.start(now);
    sub.stop(now + 2.2);

    // 2. Detuned second sub — beats slowly against the first for a heavy, uneasy wobble.
    const sub2 = ctx.createOscillator();
    sub2.type = 'sine';
    sub2.frequency.setValueAtTime(73, now);
    sub2.frequency.exponentialRampToValueAtTime(30, now + 1.7);
    const sub2Gain = ctx.createGain();
    sub2Gain.gain.setValueAtTime(0.001, now);
    sub2Gain.gain.exponentialRampToValueAtTime(0.32 * v, now + 0.35);
    sub2Gain.gain.exponentialRampToValueAtTime(0.001, now + 2.1);
    sub2.connect(sub2Gain);
    sub2Gain.connect(this.sfxGain);
    sub2.start(now);
    sub2.stop(now + 2.2);

    // 3. Low-passed noise rumble — the "tearing open" texture, kept well below the subs.
    const noise = this.makeNoiseSource(2.0);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(420, now);
    lp.frequency.exponentialRampToValueAtTime(110, now + 1.8);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.001, now);
    nGain.gain.linearRampToValueAtTime(0.12 * v, now + 0.45);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 1.9);
    noise.connect(lp);
    lp.connect(nGain);
    nGain.connect(this.sfxGain);
    noise.start(now);
    noise.stop(now + 2.0);
  }

  /**
   * Per-bullet-hit BlackHole sound — a short, deep "gut punch" so every shot that lands on
   * the hole has weight (previously the hole was silent until spawn/stress/death). Three
   * variants, same dispatcher pattern as the supernova sounds; previewed in the BlackHole
   * FX Lab (`?blackhole=1`). Callers rate-limit (BH_HIT_SOUND_COOLDOWN_MS).
   * - 'thud'  — saturated sub thump 130→32Hz + low band-passed noise crunch (production default)
   * - 'gulp'  — darker "swallow": longer sub sweep 90→22Hz with a slow detuned beat
   * - 'crack' — sharper: a hollow knock transient over a short sub tail + bright tick
   */
  playBlackHoleHit(variant: BlackHoleHitVariant = 'thud', volume: number = 1): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const v = Math.min(1, Math.max(0, volume));
    switch (variant) {
      case 'thud': this.playBlackHoleHitThud(v); break;
      case 'gulp': this.playBlackHoleHitGulp(v); break;
      case 'crack': this.playBlackHoleHitCrack(v); break;
    }
  }

  private playBlackHoleHitThud(v: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    // Saturated sub thump — saturation adds harmonics so it reads on laptop speakers.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(130, now);
    sub.frequency.exponentialRampToValueAtTime(32, now + 0.22);
    const sat = this.makeSaturator(3.0);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.55 * v, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    sub.connect(sat);
    sat.connect(subGain);
    subGain.connect(this.sfxGain!);
    sub.start(now);
    sub.stop(now + 0.35);

    // Low crunch — band-passed noise dropping through the low mids.
    const noise = this.makeNoiseSource(0.25);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(300, now);
    bp.frequency.exponentialRampToValueAtTime(90, now + 0.22);
    bp.Q.value = 1.2;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.22 * v, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    noise.connect(bp);
    bp.connect(nGain);
    nGain.connect(this.sfxGain!);
    noise.start(now);
    noise.stop(now + 0.26);
  }

  private playBlackHoleHitGulp(v: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    // Longer, darker sub sweep — matter being swallowed.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(90, now);
    sub.frequency.exponentialRampToValueAtTime(22, now + 0.5);
    const sat = this.makeSaturator(3.0);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.5 * v, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    sub.connect(sat);
    sat.connect(subGain);
    subGain.connect(this.sfxGain!);
    sub.start(now);
    sub.stop(now + 0.62);

    // Detuned second sub — a brief uneasy beat against the first (spawn-sound DNA).
    const sub2 = ctx.createOscillator();
    sub2.type = 'sine';
    sub2.frequency.setValueAtTime(94, now);
    sub2.frequency.exponentialRampToValueAtTime(24, now + 0.5);
    const sub2Gain = ctx.createGain();
    sub2Gain.gain.setValueAtTime(0.26 * v, now);
    sub2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    sub2.connect(sub2Gain);
    sub2Gain.connect(this.sfxGain!);
    sub2.start(now);
    sub2.stop(now + 0.62);

    // Soft low rumble texture, well under the subs.
    const noise = this.makeNoiseSource(0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(240, now);
    lp.frequency.exponentialRampToValueAtTime(80, now + 0.4);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.1 * v, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    noise.connect(lp);
    lp.connect(nGain);
    nGain.connect(this.sfxGain!);
    noise.start(now);
    noise.stop(now + 0.44);
  }

  private playBlackHoleHitCrack(v: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    // Hollow knock transient — a mid triangle snap dropping fast.
    const knock = ctx.createOscillator();
    knock.type = 'triangle';
    knock.frequency.setValueAtTime(260, now);
    knock.frequency.exponentialRampToValueAtTime(90, now + 0.09);
    const knockGain = ctx.createGain();
    knockGain.gain.setValueAtTime(0.32 * v, now);
    knockGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    knock.connect(knockGain);
    knockGain.connect(this.sfxGain!);
    knock.start(now);
    knock.stop(now + 0.16);

    // Short sub tail so the knock still lands low.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(110, now);
    sub.frequency.exponentialRampToValueAtTime(34, now + 0.18);
    const sat = this.makeSaturator(3.0);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.4 * v, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    sub.connect(sat);
    sat.connect(subGain);
    subGain.connect(this.sfxGain!);
    sub.start(now);
    sub.stop(now + 0.28);

    // Bright tick — a short high noise snap for the impact surface.
    const noise = this.makeNoiseSource(0.08);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400;
    bp.Q.value = 1.5;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.12 * v, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    noise.connect(bp);
    bp.connect(nGain);
    nGain.connect(this.sfxGain!);
    noise.start(now);
    noise.stop(now + 0.09);
  }


  private stressOsc1: OscillatorNode | null = null;
  private stressOsc2: OscillatorNode | null = null;
  private stressLfo: OscillatorNode | null = null;
  private stressGain: GainNode | null = null;
  private stressTrem: GainNode | null = null;

  /**
   * Continuous wobbling low-bass loop signalling how unstable the most-fed BlackHole is.
   * `level` 0-1 (absorbedCount / MAX_ABSORB; 1 while destabilizing). At 0 it is silent.
   * The wobble (beat frequency between two detuned subs + tremolo rate) speeds up and the
   * pitch/volume rise as the well approaches critical — you can HEAR the stress build.
   */
  setBlackHoleStress(level: number): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const v = Math.min(1, Math.max(0, level));

    if (!this.stressGain) {
      this.stressGain = ctx.createGain();
      this.stressGain.gain.value = 0;
      this.stressTrem = ctx.createGain();
      this.stressTrem.gain.value = 0.7;
      this.stressOsc1 = ctx.createOscillator();
      this.stressOsc1.type = 'sine';
      this.stressOsc1.frequency.value = 32;
      this.stressOsc2 = ctx.createOscillator();
      this.stressOsc2.type = 'sine';
      this.stressOsc2.frequency.value = 33;
      this.stressLfo = ctx.createOscillator();
      this.stressLfo.type = 'sine';
      this.stressLfo.frequency.value = 3;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.3;
      this.stressLfo.connect(lfoDepth);
      lfoDepth.connect(this.stressTrem.gain);
      this.stressOsc1.connect(this.stressTrem);
      this.stressOsc2.connect(this.stressTrem);
      this.stressTrem.connect(this.stressGain);
      this.stressGain.connect(this.sfxGain);
      this.stressOsc1.start(t);
      this.stressOsc2.start(t);
      this.stressLfo.start(t);
    }

    // Smooth all params to avoid zipper noise; wobble beat 1→4 Hz, tremolo 3→9 Hz
    this.stressGain.gain.setTargetAtTime(v * v * 0.32, t, 0.12);
    this.stressOsc1!.frequency.setTargetAtTime(32 + v * 12, t, 0.25);
    this.stressOsc2!.frequency.setTargetAtTime(33 + v * 15, t, 0.25);
    this.stressLfo!.frequency.setTargetAtTime(3 + v * 6, t, 0.25);
  }

  /** Soft-clip waveshaper for adding harmonic saturation — makes sub-bass audible on small speakers. */
  private makeSaturator(amount: number): WaveShaperNode {
    const ctx = this.ctx!;
    const shaper = ctx.createWaveShaper();
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
    }
    shaper.curve = curve;
    return shaper;
  }

  private makeNoiseSource(lenSec: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, (ctx.sampleRate * lenSec) | 0, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  /**
   * Supernova detonation sound variants (Threat Lab A/B testing):
   * - 'classic'  — current production sound (playBlackHoleDeath)
   * - 'subdrop'  — cinematic bass drop: saturated 55→16Hz sub with a kick transient, long clean decay
   * - 'doom'     — distorted chaos: crushed square sub + heavy noise wall + detuned scream cluster
   * - 'quake'    — double-hit thunder: sharp crack, then a delayed deeper aftershock with tremolo rumble
   */
  playSupernovaVariant(variant: SupernovaSoundVariant, absorbed: number): void {
    if (!this._initialized || !this.ctx || !this.sfxGain) return;
    switch (variant) {
      case 'classic': this.playBlackHoleDeath(absorbed); break;
      case 'subdrop': this.playSupernovaSubdrop(absorbed); break;
      case 'doom': this.playSupernovaDoom(absorbed); break;
      case 'quake': this.playSupernovaQuake(absorbed); break;
    }
  }

  private playSupernovaSubdrop(absorbed: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const intensity = Math.min(absorbed / 12, 1);

    // Kick transient: fast 150→40Hz punch so the drop has an attack edge
    const kick = ctx.createOscillator();
    kick.type = 'sine';
    kick.frequency.setValueAtTime(150, now);
    kick.frequency.exponentialRampToValueAtTime(40, now + 0.12);
    const kickGain = ctx.createGain();
    kickGain.gain.setValueAtTime(0.9, now);
    kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    kick.connect(kickGain);
    kickGain.connect(this.sfxGain!);
    kick.start(now);
    kick.stop(now + 0.2);

    // The drop: saturated sub sine 55→16Hz, long decay. Saturation adds harmonics
    // so the sub reads as WEIGHT even on laptop speakers.
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(55, now + 0.02);
    sub.frequency.exponentialRampToValueAtTime(16, now + 1.4);
    const sat = this.makeSaturator(3.5);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(1.0 + intensity * 0.2, now + 0.02);
    subGain.gain.setValueAtTime(1.0 + intensity * 0.2, now + 0.6);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 3.0 + intensity);
    sub.connect(sat);
    sat.connect(subGain);
    subGain.connect(this.sfxGain!);
    sub.start(now + 0.02);
    sub.stop(now + 3.2 + intensity);

    // Air crack: brief bright noise so the low end feels like it displaced something
    const crack = this.makeNoiseSource(0.35);
    const crackHP = ctx.createBiquadFilter();
    crackHP.type = 'highpass';
    crackHP.frequency.value = 900;
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.5, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    crack.connect(crackHP);
    crackHP.connect(crackGain);
    crackGain.connect(this.sfxGain!);
    crack.start(now);
  }

  private playSupernovaDoom(absorbed: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const intensity = Math.min(absorbed / 12, 1);

    // Crushed square sub: 42→22Hz through lowpass + hard saturation = distorted engine-of-hell bass
    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.setValueAtTime(42, now);
    sub.frequency.exponentialRampToValueAtTime(22, now + 2.0);
    const subLP = ctx.createBiquadFilter();
    subLP.type = 'lowpass';
    subLP.frequency.setValueAtTime(320, now);
    subLP.frequency.exponentialRampToValueAtTime(70, now + 2.5);
    const sat = this.makeSaturator(6);
    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.9 + intensity * 0.2, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 3.5 + intensity);
    sub.connect(subLP);
    subLP.connect(sat);
    sat.connect(subGain);
    subGain.connect(this.sfxGain!);
    sub.start(now);
    sub.stop(now + 3.7 + intensity);

    // Noise wall: long crushed lowpassed noise — chaos bed
    const wall = this.makeNoiseSource(2.2);
    const wallLP = ctx.createBiquadFilter();
    wallLP.type = 'lowpass';
    wallLP.frequency.setValueAtTime(1400, now);
    wallLP.frequency.exponentialRampToValueAtTime(120, now + 2.2);
    const wallSat = this.makeSaturator(4);
    const wallGain = ctx.createGain();
    wallGain.gain.setValueAtTime(0.7 + intensity * 0.2, now);
    wallGain.gain.exponentialRampToValueAtTime(0.001, now + 2.2);
    wall.connect(wallLP);
    wallLP.connect(wallSat);
    wallSat.connect(wallGain);
    wallGain.connect(this.sfxGain!);
    wall.start(now);

    // Detuned scream cluster: 3 sawtooths diving 800→90Hz, slightly detuned = dissonant wail
    for (let i = 0; i < 3; i++) {
      const scream = ctx.createOscillator();
      scream.type = 'sawtooth';
      scream.frequency.setValueAtTime(800 * (1 + i * 0.013), now);
      scream.frequency.exponentialRampToValueAtTime(90, now + 1.6);
      const sGain = ctx.createGain();
      sGain.gain.setValueAtTime(0.09, now);
      sGain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
      scream.connect(sGain);
      sGain.connect(this.sfxGain!);
      scream.start(now + i * 0.015);
      scream.stop(now + 2.0);
    }
  }

  private playSupernovaQuake(absorbed: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const intensity = Math.min(absorbed / 12, 1);

    // Hit 1 — the crack: bright noise snap + fast 90→30Hz thump
    const crack = this.makeNoiseSource(0.25);
    const crackBP = ctx.createBiquadFilter();
    crackBP.type = 'bandpass';
    crackBP.frequency.value = 2400;
    crackBP.Q.value = 0.8;
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.65, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    crack.connect(crackBP);
    crackBP.connect(crackGain);
    crackGain.connect(this.sfxGain!);
    crack.start(now);

    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(90, now);
    thump.frequency.exponentialRampToValueAtTime(30, now + 0.25);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.8, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    thump.connect(thumpGain);
    thumpGain.connect(this.sfxGain!);
    thump.start(now);
    thump.stop(now + 0.4);

    // Hit 2 (350ms later) — the aftershock: deeper, bigger, saturated 45→14Hz
    const t2 = now + 0.35;
    const shock = ctx.createOscillator();
    shock.type = 'sine';
    shock.frequency.setValueAtTime(45, t2);
    shock.frequency.exponentialRampToValueAtTime(14, t2 + 1.8);
    const sat = this.makeSaturator(3);
    const shockGain = ctx.createGain();
    shockGain.gain.setValueAtTime(1.1 + intensity * 0.2, t2);
    shockGain.gain.exponentialRampToValueAtTime(0.001, t2 + 3.2 + intensity);
    shock.connect(sat);
    sat.connect(shockGain);
    shockGain.connect(this.sfxGain!);
    shock.start(t2);
    shock.stop(t2 + 3.4 + intensity);

    // Rumble tail with 6Hz tremolo — ground still shaking
    const rumble = this.makeNoiseSource(3.0);
    const rumbleLP = ctx.createBiquadFilter();
    rumbleLP.type = 'lowpass';
    rumbleLP.frequency.value = 140;
    const trem = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 6;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.3;
    lfo.connect(lfoDepth);
    lfoDepth.connect(trem.gain);
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.6, t2);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, t2 + 3.0);
    trem.gain.setValueAtTime(0.7, t2);
    rumble.connect(rumbleLP);
    rumbleLP.connect(trem);
    trem.connect(rumbleGain);
    rumbleGain.connect(this.sfxGain!);
    rumble.start(t2);
    lfo.start(t2);
    lfo.stop(t2 + 3.2);
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
  private timeScale = 1;

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

  setTimeScale(scale: number): void {
    const next = Math.max(0.2, Math.min(1, scale));
    const ratio = next / this.timeScale;
    this.timeScale = next;
    const now = this.ctx.currentTime;
    for (const osc of [this.bassOsc, this.padOsc, this.padOsc2, this.arpOsc, this.leadOsc]) {
      if (osc) osc.frequency.setTargetAtTime(Math.max(12, osc.frequency.value * ratio), now, 0.03);
    }
  }

  private startRhythm(): void {
    const kick = () => {
      if (!this.playing || !this.ctx || !this.rhythmGain) return;
      // Create a quick noise burst for percussion
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 80 * this.timeScale;
      const env = this.ctx.createGain();
      env.gain.value = 0.8;
      env.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
      osc.connect(env);
      env.connect(this.rhythmGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.12);
      // Frequency drop for kick feel
      osc.frequency.exponentialRampToValueAtTime(30 * this.timeScale, this.ctx.currentTime + 0.08);
    };

    // Tempo varies with intensity (120-160 BPM)
    const bpm = () => 120 + this.intensity * 40;
    const scheduleNext = () => {
      if (!this.playing) return;
      kick();
      this.rhythmInterval = window.setTimeout(scheduleNext, 60000 / bpm() / this.timeScale);
    };
    scheduleNext();
  }

  private startArpeggio(): void {
    const step = () => {
      if (!this.playing || !this.arpOsc) return;
      const note = this.arpNotes[this.arpNoteIndex % this.arpNotes.length];
      this.arpOsc.frequency.setValueAtTime(note * this.timeScale, this.ctx.currentTime);
      this.arpNoteIndex++;
    };

    // Arpeggio speed: 8th notes at current BPM
    const bpm = () => 120 + this.intensity * 40;
    const scheduleNext = () => {
      if (!this.playing) return;
      step();
      this.arpInterval = window.setTimeout(scheduleNext, 60000 / bpm() / 2 / this.timeScale);
    };
    scheduleNext();
  }

  private startLead(): void {
    const step = () => {
      if (!this.playing || !this.leadOsc) return;
      const note = this.leadNotes[this.leadNoteIndex % this.leadNotes.length];
      this.leadOsc.frequency.setValueAtTime(note * this.timeScale, this.ctx.currentTime);
      this.leadNoteIndex++;
    };

    const bpm = () => 120 + this.intensity * 40;
    const scheduleNext = () => {
      if (!this.playing) return;
      step();
      this.leadInterval = window.setTimeout(scheduleNext, 60000 / bpm() / this.timeScale);
    };
    scheduleNext();
  }
}
