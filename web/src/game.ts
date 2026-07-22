import { Renderer } from './renderer/sprite-batch';
import { BloomPass } from './renderer/bloom';
import { SpringMassGrid } from './renderer/grid';
import { Camera } from './core/camera';
import { Input } from './core/input';
import { AudioManager } from './core/audio';
import { Player } from './entities/player';
import { BulletPool } from './entities/bullet';
import { Enemy } from './entities/enemies/enemy';
import { ExplosionPool } from './entities/explosion';
import { AimIndicator } from './entities/crosshair';
import { ParticleField, FieldAttractor } from './renderer/particle-field';
import { MatterField } from './renderer/matter-field';
import { DebrisField } from './renderer/debris-field';
import { HUD } from './ui/hud';
import { VirtualJoystickRenderer } from './ui/virtual-joystick';
import { renderOffscreenIndicators } from './ui/offscreen-indicators';
import { WaveManager } from './spawner/wave-manager';
import { Starfield } from './renderer/starfield';
import { checkCollisions } from './core/collision';
import { Vec2 } from './core/vector';
import { HapticsManager } from './core/haptics';
import { LifecycleSystem } from './systems/lifecycle-system';
import { CombatSystem } from './systems/combat-system';
import { SpawnSystem } from './systems/spawn-system';
import { GravitySystem } from './systems/gravity-system';
import { BossSystem } from './systems/boss-system';
import { TimeDilationSystem } from './systems/time-dilation-system';
import type { TimeDilationSnapshot } from './systems/time-dilation-system';
import { separateEnemies as runSeparation } from './systems/separation';
import { Bot } from './ai/bot';
import { Wingman } from './entities/wingman';
import { RunStats, computeMedals } from './core/run-stats';
import { createEnemy } from './spawner/enemy-factory';
import { BlackHole } from './entities/enemies/blackhole';
import { CircleEnemy } from './entities/enemies/circle';
import {
  WEAPON_STAGES,
  EXPLOSION_PARTICLE_COUNT_LARGE,
  EXPLOSION_PARTICLE_COUNT_DEATH,
  EXPLOSION_DURATION_DEFAULT,
  EXPLOSION_DURATION_LARGE,
  EXPLOSION_DURATION_DEATH,
  DIFFICULTY_PHASES,
  SCREEN_SHAKE_SMALL,
  SCREEN_SHAKE_LARGE,
  SCREEN_SHAKE_DEATH,
  ARENA_BORDER_COLOR,
  ARENA_BORDER_CORNER_COLOR,
  ARENA_BORDER_ALPHA,
  DEATH_SLOWMO_DURATION,
  DEATH_SLOWMO_TIME_SCALE,
  DEATH_SLOWMO_SHOCKWAVE_SPEED,
  PHASE_BANNER_DURATION,
  PHASE_BORDER_PULSE_DURATION,
  PHASE_DISPLAY_NAMES,
  HEAT_PHASE_BUMP,
  HEAT_BORDER_BRIGHTNESS_MAX,
  HEAT_BLOOM_BOOST_MAX,
  HEAT_GRID_TURBULENCE_MAX,
  RECOVERY_DURATION,
  RECOVERY_FIRE_RATE_MULT,
  RECOVERY_SHIELD_COLOR,
  RECOVERY_SHIELD_RADIUS,
  MedalDef,
  SUPERNOVA_HITSTOP,
  SUPERNOVA_FLASH_DURATION,
  DEATH_WARP_STRETCH,
  DEATH_WARP_TWIST,
  DEATH_WARP_REACH_MIN,
  DEATH_WARP_REACH_MULT,
  PARTICLE_FIELD_GAME_DENSITY,
  PARTICLE_FIELD_GAME_DENSITY_MOBILE,
  PARTICLE_FIELD_DUST_PULL,
  PARTICLE_FIELD_CIRCLE_PULL,
  PARTICLE_FIELD_CIRCLE_RADIUS,
  PARTICLE_FIELD_CIRCLE_SWIRL,
  PARTICLE_FIELD_CIRCLE_SHED,
  PARTICLE_FIELD_BH_EMIT_BASE,
  PARTICLE_FIELD_BH_EMIT_RATE,
  PARTICLE_FIELD_BH_EMIT_CRITICAL,
  PARTICLE_FIELD_BH_EMBER_BASE,
  PARTICLE_FIELD_BH_EMBER_COUNT,
  PARTICLE_FIELD_BH_HIT_DUST,
  PARTICLE_FIELD_BH_HIT_DUST_MOBILE,
  PARTICLE_FIELD_BH_HIT_DUST_SPREAD,
  PARTICLE_FIELD_BH_HIT_DUST_SPEED,
  PARTICLE_FIELD_BH_HIT_PARTICLES,
  PARTICLE_FIELD_BH_HIT_PARTICLES_MOBILE,
  PARTICLE_FIELD_BH_HIT_PARTICLES_SPREAD,
  PARTICLE_FIELD_BH_HIT_PARTICLES_SPEED,
  BH_HIT_MATTER_COUNT,
  BH_HIT_MATTER_COUNT_MOBILE,
  BH_HIT_MATTER_SPEED,
  BH_HIT_MATTER_SPREAD,
  BH_HIT_MATTER_LIFE,
  MATTER_FIELD_MAX,
  MATTER_FIELD_MAX_MOBILE,
  BH_MATTER_TRICKLE,
  BH_MATTER_TRICKLE_COUNT,
  BH_DISK_MOTES_MIN,
  BH_DISK_MOTES_MAX,
  BH_DISK_MOTES_MIN_MOBILE,
  BH_DISK_MOTES_MAX_MOBILE,
  BH_DISK_MOTE_LIFE,
  BH_DISK_MOTE_TANGENT,
  BH_DISK_HIT_SPRAY,
  BULLET_WAKE_LEAD,
  BULLET_WAKE_LEAD_RADIUS,
  BULLET_WAKE_BOW_WELL,
  BULLET_WAKE_BOW_WELL_RADIUS,
  BULLET_WAKE_TRAIL,
  BULLET_WAKE_TRAIL_RADIUS,
  BULLET_WAKE_AHEAD_MS,
  BULLET_WAKE_BEHIND_MS,
  BULLET_WAKE_MIN_SCALE,
} from './config';
import { gameSettings } from './settings';
import { showDesktopSettings, hideDesktopSettings } from './ui/settings-panel';
import { DesignLab } from './design-lab';

type GameState = 'menu' | 'playing' | 'death_slowmo' | 'gameover' | 'design_lab';

function isMobile(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export class Game {
  private renderer: Renderer;
  private bloom: BloomPass;
  private grid: SpringMassGrid;
  private lifecycle: LifecycleSystem;
  private camera: Camera;
  private input: Input;
  private audio: AudioManager;
  private player: Player;
  private bullets: BulletPool;
  private enemies: Enemy[] = [];
  private explosions: ExplosionPool;
  private field: ParticleField;       // ambient cosmic dust + thruster wake / impact sparklets (massy: dust + embers)
  private matter: MatterField;        // massless escaping matter lances (bullet-hit spray — no gravity)
  private debris: DebrisField;        // geometry shatter — killed units break into their own edges
  private prevPlayerX = 0;            // for the thruster wake delta
  private prevPlayerY = 0;
  private aimIndicator: AimIndicator;
  private hud: HUD;
  private joystickRenderer: VirtualJoystickRenderer;
  private waveManager: WaveManager;
  private starfield: Starfield;
  private haptics: HapticsManager;

  private state: GameState = 'menu';
  private gameTime = 0;
  private gameOverTime = 0;
  private totalTime = 0; // monotonic time for shader effects
  private mobile: boolean;
  private paused = false;

  // Death slowmo state
  private slowmoTimer = 0;
  private slowmoShockwaveRadius = 0;
  private slowmoOrigin = new Vec2(0, 0);
  private slowmoIsFinal = false; // true = game over after slowmo, false = respawn

  // Combat system (kill processing, heat, hitstop, kill signatures)
  private combat: CombatSystem;

  // Spawn system (wave-manager execution, caps, spawn SFX, formation telegraphs)
  private spawn: SpawnSystem;

  // Gravity system (BlackHole attraction, absorption/supernova, player pull, grid wells, circle flocks)
  private gravity: GravitySystem;
  private timeDilation: TimeDilationSystem;

  // Combat feedback: hitstop timer applied by Game
  private hitstopTimer = 0;

  // Combat feedback: phase transition
  private phaseBannerTimer = 0;
  private phaseBannerName = '';
  private phaseBorderPulseTimer = 0;

  // Recovery window (post-respawn buff)
  private recoveryTimer = 0;     // ms remaining
  private recoveryActive = false;
  private recoveryExpirePlayed = false;

  // Run stats tracking
  private runStats: RunStats = {
    score: 0, kills: 0, timeSurvived: 0, phaseReached: 'tutorial',
    peakHeat: 0, elitesKilled: 0, blackholesKilled: 0,
    minibossDefeated: false, livesUsed: 0, recoveriesUsed: 0, weaponStage: 0,
  };
  private gameOverMedals: MedalDef[] = [];
  private medalRevealPlayed = false;

  // Supernova screen flash (set by GravitySystem via onSupernovaDetonate callback)
  private supernovaFlashTimer = 0;

  // Design Lab
  private designLab: DesignLab | null = null;

  // AI agent: trained policy that plays the game (watch live). Toggle with `?bot=1` or the B key.
  private bot: Bot | null = null;
  private botEnabled = false;

  // AI wingman: a co-op ally driven by the same trained policy. Toggled via settings (aiWingman).
  private wingman: Wingman | null = null;

  // Boss encounters (Sierpinski + Mandelbrot generic state machines)
  private boss: BossSystem;

  constructor(private gameCanvas: HTMLCanvasElement, hudCanvas: HTMLCanvasElement) {
    this.mobile = isMobile();

    this.renderer = new Renderer(gameCanvas);
    {
      const cssW = gameCanvas.clientWidth;
      const cssH = gameCanvas.clientHeight;
      const aw = gameSettings.arenaWidth;
      const ah = gameSettings.arenaHeight;
      this.renderer.zoom = (this.mobile
        ? Math.max(cssW / aw, cssH / ah)
        : Math.min(cssW / aw, cssH / ah)) * gameSettings.zoomScale;
    }
    const gl = this.renderer.getGL();

    this.bloom = new BloomPass(gl);
    this.bloom.threshold = gameSettings.bloomThreshold;
    this.bloom.intensity = gameSettings.bloomIntensity;
    this.bloom.blurPasses = this.mobile ? 2 : gameSettings.bloomBlurPasses;
    this.bloom.blurRadius = gameSettings.bloomBlurRadius;

    this.grid = new SpringMassGrid(gl, this.mobile);
    this.lifecycle = new LifecycleSystem(this.mobile);
    this.camera = new Camera(this.renderer.width, this.renderer.height);
    this.camera.fixedView = !this.mobile;
    this.camera.clampToArena = !this.mobile;
    this.input = new Input(gameCanvas);
    this.input.setCamera(this.camera);
    this.input.setZoom(this.renderer.zoom);
    this.audio = new AudioManager();
    this.timeDilation = new TimeDilationSystem({
      onEnter: () => this.audio.playTimeDilationEnter(),
      onExit: () => this.audio.playTimeDilationExit(),
      onScale: (scale) => this.audio.setTimeScale(scale),
    });
    this.player = new Player(this.input);
    this.bullets = new BulletPool();
    this.explosions = new ExplosionPool();
    this.field = new ParticleField();
    this.field.density = this.mobile ? PARTICLE_FIELD_GAME_DENSITY_MOBILE : PARTICLE_FIELD_GAME_DENSITY;
    this.matter = new MatterField(this.mobile ? MATTER_FIELD_MAX_MOBILE : MATTER_FIELD_MAX);
    this.debris = new DebrisField();
    this.combat = new CombatSystem(this.mobile, {
      player: this.player,
      runStats: this.runStats,
      enemies: this.enemies,
      lifecycle: this.lifecycle,
      audio: this.audio,
      explosions: this.explosions,
      field: this.field,
      debris: this.debris,
      grid: this.grid,
      camera: this.camera,
      onMinibossDefeated: () => this.boss.onMandelbrotDefeated(),
      onSierpinskiBossDefeated: () => this.boss.onSierpinskiDefeated(),
    });
    this.aimIndicator = new AimIndicator();
    this.hud = new HUD(hudCanvas);
    this.joystickRenderer = new VirtualJoystickRenderer(hudCanvas);
    this.waveManager = new WaveManager();
    this.waveManager.onPhaseChange = (newPhase: string) => {
      const displayName = PHASE_DISPLAY_NAMES[newPhase];
      if (displayName) {
        this.phaseBannerTimer = PHASE_BANNER_DURATION;
        this.phaseBannerName = displayName;
        this.phaseBorderPulseTimer = PHASE_BORDER_PULSE_DURATION;
        this.audio.playPhaseTransition();
        // Track phase reached for run stats
        this.runStats.phaseReached = newPhase;
        // Heat bump on phase transition
        this.combat.bumpHeat(HEAT_PHASE_BUMP);
      }
    };
    this.spawn = new SpawnSystem({
      player: this.player,
      enemies: this.enemies,
      lifecycle: this.lifecycle,
      audio: this.audio,
      grid: this.grid,
      waveManager: this.waveManager,
    });
    this.gravity = new GravitySystem(this.mobile, {
      player: this.player,
      enemies: this.enemies,
      bullets: this.bullets,
      lifecycle: this.lifecycle,
      explosions: this.explosions,
      grid: this.grid,
      camera: this.camera,
      audio: this.audio,
      field: this.field,
      onSupernovaWarning: () => { this.phaseBorderPulseTimer = PHASE_BORDER_PULSE_DURATION; },
      onSupernovaDetonate: () => {
        this.haptics.supernova();
        this.hitstopTimer = Math.max(this.hitstopTimer, SUPERNOVA_HITSTOP);
        this.supernovaFlashTimer = SUPERNOVA_FLASH_DURATION;
      },
    });
    this.boss = new BossSystem({
      player: this.player,
      enemies: this.enemies,
      lifecycle: this.lifecycle,
      grid: this.grid,
      camera: this.camera,
      audio: this.audio,
      waveManager: this.waveManager,
      hud: this.hud,
      onWarning: (durationMs) => { this.phaseBorderPulseTimer = durationMs; },
      requestHitstop: (ms) => { this.hitstopTimer = Math.max(this.hitstopTimer, ms); },
    });
    this.starfield = new Starfield(80, gameSettings.arenaWidth, gameSettings.arenaHeight);
    this.haptics = new HapticsManager();

    // Click/touch to start + init audio
    // Use touchend for iOS Safari reliability (touchstart preventDefault in Input
    // suppresses synthetic click, and passive/non-passive conflicts cause issues).
    // Also kick audio on touchstart: iOS unlocks WebAudio most reliably on the
    // earliest gesture, and this resumes a context parked by lock/call/Siri without
    // waiting for the finger to lift.
    gameCanvas.addEventListener('click', () => this.onInteract());
    gameCanvas.addEventListener('touchstart', () => this.ensureAudio(), { passive: true });
    gameCanvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.onInteract();
    }, { passive: false });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') {
        this.audio.toggleMute();
      }
      if (e.code === 'KeyF') {
        this.input.autoFire = !this.input.autoFire;
      }
      // Toggle the AI agent (watch it play). Starts a run from the menu/game over.
      if (e.code === 'KeyB') {
        this.setBotEnabled(!this.botEnabled);
        if (this.botEnabled && this.state !== 'playing') this.onInteract();
      }
      // Pause during gameplay: P to toggle pause + show/hide config panel
      if (e.code === 'KeyP' && (this.state === 'playing' || this.state === 'death_slowmo')) {
        this.paused = !this.paused;
        if (this.paused && !this.mobile) {
          showDesktopSettings();
        } else if (!this.paused && !this.mobile) {
          hideDesktopSettings();
        }
      }
      // Design Lab: D to enter from menu, D/Escape to exit
      if (e.code === 'KeyD' && this.state === 'menu') {
        this.enterDesignLab();
      } else if ((e.code === 'KeyD' || e.code === 'Escape') && this.state === 'design_lab') {
        this.exitDesignLab();
      }
      // Design Lab: 1-5 to switch spawn type
      if (this.state === 'design_lab' && e.code.startsWith('Digit')) {
        this.designLab?.onKeyDown(e.code);
      }
    });

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.resize(), 100);
    });
    this.resize();
    this.hud.setTouchMode(this.mobile);
    this.hud.drawMenu();
    if (!this.mobile) showDesktopSettings();
    // Show system cursor on menu
    gameCanvas.style.cursor = 'default';

    // AI agent auto-start via `?bot=1` (handy for recorded/automated demo runs)
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('bot') === '1') {
      this.setBotEnabled(true);
      // Defer so the canvas/audio are ready, then start a run
      setTimeout(() => this.onInteract(), 300);
    }
  }

  /** Enable/disable the AI agent. Lazily constructs the policy-backed Bot on first use. */
  setBotEnabled(enabled: boolean): void {
    this.botEnabled = enabled;
    if (enabled && !this.bot) this.bot = new Bot();
    this.input.botControl = enabled && this.state === 'playing';
    this.botBadge(enabled);
  }

  /** Small on-screen badge so it's obvious the AI is driving. */
  private botBadge(show: boolean): void {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('bot-badge');
    if (show) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'bot-badge';
        el.textContent = '🤖 AI AGENT PLAYING';
        el.style.cssText =
          'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:9999;' +
          'font:600 14px system-ui,sans-serif;letter-spacing:1px;color:#0ff;' +
          'background:rgba(0,0,0,0.55);padding:6px 14px;border:1px solid #0ff;border-radius:4px;' +
          'pointer-events:none;text-shadow:0 0 6px #0ff;';
        document.body.appendChild(el);
      }
      el.style.display = 'block';
    } else if (el) {
      el.style.display = 'none';
    }
  }

  /**
   * Create/destroy the AI wingman to match the `aiWingman` setting. Called each playing
   * frame so toggling the setting (e.g. from the pause menu) takes effect immediately.
   */
  private syncWingman(): void {
    if (gameSettings.aiWingman && !this.wingman) {
      this.wingman = new Wingman(new Bot());
      this.wingman.spawnBeside(this.player.position.x, this.player.position.y);
      this.wingmanBadge(true);
    } else if (!gameSettings.aiWingman && this.wingman) {
      this.wingman = null;
      this.wingmanBadge(false);
    }
  }

  /** Small on-screen badge so it's obvious an AI ally is fighting alongside you. */
  private wingmanBadge(show: boolean): void {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('wingman-badge');
    if (show) {
      if (!el) {
        el = document.createElement('div');
        el.id = 'wingman-badge';
        el.textContent = '🤖 AI WINGMAN';
        el.style.cssText =
          'position:fixed;top:44px;left:50%;transform:translateX(-50%);z-index:9999;' +
          'font:600 13px system-ui,sans-serif;letter-spacing:1px;color:#4ad9ff;' +
          'background:rgba(0,0,0,0.55);padding:5px 12px;border:1px solid #4ad9ff;border-radius:4px;' +
          'pointer-events:none;text-shadow:0 0 6px #4ad9ff;';
        document.body.appendChild(el);
      }
      el.style.display = 'block';
    } else if (el) {
      el.style.display = 'none';
    }
  }

  /** Feed the AI agent's decision into the input layer for this frame. */
  private driveBot(): void {
    if (!this.botEnabled || !this.bot) return;
    this.input.botControl = true;
    const a = this.bot.computeAction(
      this.player, this.enemies, gameSettings.arenaWidth, gameSettings.arenaHeight,
    );
    this.input.botMove.set(a.moveX, a.moveY);
    this.input.botAimAngle = a.aimAngle;
    this.input.botFire = a.fire;
  }

  private resize(): void {
    {
      const cssW = this.gameCanvas.clientWidth;
      const cssH = this.gameCanvas.clientHeight;
      const aw = gameSettings.arenaWidth;
      const ah = gameSettings.arenaHeight;
      this.renderer.zoom = (this.mobile
        ? Math.max(cssW / aw, cssH / ah)
        : Math.min(cssW / aw, cssH / ah)) * gameSettings.zoomScale;
    }
    this.renderer.resize();
    this.camera.resize(this.renderer.width, this.renderer.height);
    this.bloom.resize(this.renderer.canvasWidth, this.renderer.canvasHeight);
    this.hud.resize();
    this.input.updateCanvasSize(this.gameCanvas.clientWidth);
    this.input.setZoom(this.renderer.zoom);
    if (this.state === 'menu') this.hud.drawMenu();
  }

  private ensureAudio(): void {
    // Init audio on first user gesture (non-blocking so game start isn't
    // prevented by audio failures on iOS Safari)
    if (!this.audio.initialized) {
      this.audio.init().catch(() => {});
    } else {
      this.audio.resume().catch(() => {});
    }
  }

  private onInteract(): void {
    this.ensureAudio();

    if (this.state === 'design_lab') {
      this.designLab?.onClick();
      return;
    }

    if (this.state === 'menu') {
      if (this.mobile && !document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
      this.startGame();
    } else if (this.state === 'gameover' && this.gameOverTime >= 1) {
      if (this.mobile && !document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
      this.startGame();
    }
    // death_slowmo: ignore interactions
  }

  private startGame(): void {
    this.state = 'playing';
    this.gameCanvas.style.cursor = 'none';
    if (!this.mobile) hideDesktopSettings();
    this.player.reset();
    this.bullets.clear();
    this.enemies.length = 0;
    this.gravity.clear();
    this.timeDilation.reset();
    this.explosions.clear();
    this.debris.clear();
    this.matter.clear();
    this.field.reseed();
    this.prevPlayerX = this.player.position.x;
    this.prevPlayerY = this.player.position.y;
    this.lifecycle.clear();
    this.combat.clear();
    this.waveManager.reset();
    this.hitstopTimer = 0;
    this.phaseBannerTimer = 0;
    this.phaseBannerName = '';
    this.phaseBorderPulseTimer = 0;
    this.spawn.clear();
    this.recoveryTimer = 0;
    this.recoveryActive = false;
    this.recoveryExpirePlayed = false;
    this.runStats = {
      score: 0, kills: 0, timeSurvived: 0, phaseReached: 'tutorial',
      peakHeat: 0, elitesKilled: 0, blackholesKilled: 0,
      minibossDefeated: false, livesUsed: 0, recoveriesUsed: 0, weaponStage: 0,
    };
    this.gameOverMedals = [];
    this.medalRevealPlayed = false;
    this.supernovaFlashTimer = 0;
    this.hud.resetJuice();
    this.boss.reset();
    // Drop any existing wingman so it re-spawns beside the fresh player (syncWingman recreates it)
    this.wingman = null;
    this.wingmanBadge(false);
    this.player.lives = gameSettings.startingLives;
    this.waveManager.spawnRateMultiplier = gameSettings.spawnRateMultiplier;
    if (gameSettings.startingPhase !== 'tutorial') {
      this.waveManager.jumpToPhase(gameSettings.startingPhase);
      this.gameTime = (DIFFICULTY_PHASES as Record<string, { start: number; end: number }>)[gameSettings.startingPhase]?.start ?? 0;
    } else {
      this.gameTime = 0;
    }
    // Rebuild grid + starfield with current arena/grid settings
    this.grid.rebuild(gameSettings.arenaWidth, gameSettings.arenaHeight, gameSettings.gridSpacing);
    this.starfield = new Starfield(80, gameSettings.arenaWidth, gameSettings.arenaHeight);
    this.applyVisualSettings();
    // Recompute zoom and canvas resolution for new arena + resolution scale
    this.resize();
    this.camera.snapTo(this.player.position);
    this.hud.clear();

    // Reset aim angle
    this.input.setAimAngle(0);
    // Hand control to the AI agent if it's enabled
    this.input.botControl = this.botEnabled;

    this.audio.playSFX('start');
    this.audio.startMusic();
    this.audio.setMusicIntensity(0);
  }

  /** Compute a 0-1 intensity value from current game state for adaptive music */
  private computeIntensity(): number {
    // Base intensity from time phase
    let base = 0;
    if (this.gameTime < DIFFICULTY_PHASES.tutorial.end) base = 0.05;
    else if (this.gameTime < DIFFICULTY_PHASES.rampUp.end) base = 0.25;
    else if (this.gameTime < DIFFICULTY_PHASES.midGame.end) base = 0.5;
    else if (this.gameTime < DIFFICULTY_PHASES.intense.end) base = 0.75;
    else base = 0.9;

    // Boost for enemy count
    const enemyBoost = Math.min(this.enemies.length / 40, 0.3);

    // Temporary intensity bump during phase transition
    let phaseBump = 0;
    if (this.phaseBorderPulseTimer > 0) {
      phaseBump = 0.15 * (this.phaseBorderPulseTimer / PHASE_BORDER_PULSE_DURATION);
    }

    // Heat adds to music density
    const heatBoost = this.combat.heatValue * 0.15;

    return Math.min(base + enemyBoost + phaseBump + heatBoost, 1);
  }

  /** Update during game over: keep enemies alive with idle animation + gravity */
  private updateGameOver(dt: number): void {
    this.gameOverTime += dt / 1000;

    // Play medal reveal sound after short delay (1.5s for stats to settle)
    if (!this.medalRevealPlayed && this.gameOverMedals.length > 0 && this.gameOverTime >= 1.5) {
      this.audio.playMedalReveal();
      this.medalRevealPlayed = true;
    }

    // Keep explosions animating
    this.explosions.update(dt);
    this.debris.update(dt);

    // Gentle idle rotation for enemies (no movement)
    for (const e of this.enemies) {
      if (!e.active) continue;
      e.rotation += dt * 0.001;
    }

    // Gravity: big enemies pull smaller ones slowly during game over
    for (const e of this.enemies) {
      if (!e.active) continue;
      for (const o of this.enemies) {
        if (o === e || !o.active || !(o instanceof BlackHole)) continue;
        const dx = o.position.x - e.position.x;
        const dy = o.position.y - e.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 10 && dist < 200) {
          const pull = 0.02 * dt / dist;
          e.position.x += dx * pull;
          e.position.y += dy * pull;
        }
      }
    }

    // Update gravity wells for grid warping
    this.gravity.updateGravityWells();

    // Redraw HUD with animation progress
    this.hud.drawGameOver(this.runStats, this.gameOverMedals, this.gameOverTime);

    // AI agent: auto-restart so it keeps playing for continuous live viewing
    if (this.botEnabled && this.gameOverTime >= 3) {
      this.startGame();
    }
  }

  update(dt: number): void {
    this.hud.updateFps(dt);

    // Update touch mode on HUD
    this.hud.setTouchMode(this.input.mode === 'touch');

    if (this.state === 'design_lab') {
      this.totalTime += dt / 1000;
      this.camera.updateShake(dt);
      this.designLab!.update(dt);
      return;
    }

    if (this.state === 'gameover') {
      this.totalTime += dt / 1000;
      this.camera.updateShake(dt);
      this.grid.update(dt);
      this.updateGameOver(dt);
      return;
    }

    if (this.state === 'death_slowmo') {
      this.totalTime += dt * DEATH_SLOWMO_TIME_SCALE / 1000;
      this.updateDeathSlowmo(dt);
      return;
    }

    if (this.state !== 'playing') {
      this.totalTime += dt / 1000;
      this.camera.updateShake(dt);
      this.grid.update(dt);
      return;
    }

    // Paused: skip gameplay but keep rendering and allow input
    if (this.paused) {
      this.grid.update(dt);
      this.audio.setMusicIntensity(this.computeIntensity());
      return;
    }

    if (this.input.isKeyDown('Escape')) {
      this.player.lives = 0;
      this.onPlayerDeath();
      return;
    }

    // Update combat feedback timers (always, even during hitstop)
    this.updateCombatFeedback(dt * this.timeDilation.timeScale);

    // Hitstop: freeze gameplay, keep visuals alive
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.totalTime += dt / 1000;
      this.camera.updateShake(dt);
      this.explosions.update(dt);
      this.debris.update(dt);
      this.gravity.updateGravityWells();
      this.grid.update(dt);
      this.audio.setMusicIntensity(this.computeIntensity());
      return;
    }

    const holes = this.enemies.filter((e): e is BlackHole => e instanceof BlackHole);
    const timeScale = this.timeDilation.update(
      dt,
      this.input.isTimeDilationHeld(),
      !this.botEnabled,
      holes,
      this.player.position.x,
      this.player.position.y,
    );
    const gameDt = dt * timeScale;
    this.totalTime += gameDt / 1000;
    this.camera.updateShake(gameDt);

    this.gameTime += gameDt / 1000;

    // AI agent decision for this frame (writes into the input layer)
    this.driveBot();

    // Player
    this.player.update(gameDt);
    this.gravity.applyPlayerPull(gameDt);

    // Shooting
    const shots = this.player.tryShoot();
    if (shots) {
      for (const angle of shots) {
        const b = this.bullets.spawn(this.player.position.x, this.player.position.y, angle);
        if (b) {
          this.lifecycle.spawnBullet(b);
        }
      }
      // Impact feedback: procedural blast (beefier with more pellets) + a subtle ship recoil.
      this.audio.playShoot(shots.length);
      this.player.kickRecoil(shots.length);
    }

    // AI wingman: an ally that observes + acts from its own position, sharing bullet pool + score
    this.syncWingman();
    if (this.wingman) {
      this.wingman.update(gameDt, this.enemies, gameSettings.arenaWidth, gameSettings.arenaHeight);
      const wShots = this.wingman.tryShoot(this.player.getWeaponStage());
      if (wShots) {
        for (const angle of wShots) {
          const b = this.bullets.spawn(this.wingman.position.x, this.wingman.position.y, angle);
          if (b) this.lifecycle.spawnBullet(b);
        }
      }
    }

    // Bullets
    this.bullets.update(gameDt);

    // Update bullet trails + clean up inactive
    this.lifecycle.updateBulletTrails(this.bullets);

    // BlackHole attraction — pull nearby non-blackhole enemies toward black holes
    this.gravity.applyAttraction(gameDt);

    // Shockwave ring effects + BlackHole stress-wobble audio level
    this.gravity.update(gameDt);

    // Update circle flock centroids (shared Vec2 refs held by each CircleEnemy)
    this.gravity.updateFlocks();

    // Enemies — Pass 1: AI + movement
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (e.isSpawning) {
        e.spawnTimer = Math.max(0, e.spawnTimer - gameDt / 1000);
        continue; // skip movement/AI during spawn
      }
      (e as { update(dt: number, playerPos?: Vec2, playerVel?: Vec2): void })
        .update(gameDt, this.player.position, this.player.velocity);
    }

    // Enemies — Pass 2: Separation (push overlapping enemies apart)
    this.separateEnemies();

    // Spawn — WaveManager execution, caps, spawn SFX, formation telegraphs
    this.spawn.update(gameDt);

    // Collision
    const result = checkCollisions(
      this.player,
      this.bullets.bullets,
      this.enemies,
    );

    // Process kills with per-family kill signatures
    this.combat.processKills(result);
    const combatHitstop = this.combat.consumeHitstop();
    if (combatHitstop > 0) {
      this.hitstopTimer = combatHitstop;
    }

    // Boss defeat → floating "+N" celebration at the boss's world position
    for (const kill of result.killedEnemies) {
      if (kill.enemy.isMiniboss && kill.scoreValue > 0) {
        this.hud.spawnBossHit(kill.position.x, kill.position.y, this.camera, kill.scoreValue);
      }
    }

    // Player hit
    if (result.playerHit) {
      this.player.lives--;
      this.runStats.livesUsed++;
      this.hud.onPlayerHit();
      this.camera.shake(12, 0.3);
      if (this.player.lives <= 0) {
        this.onPlayerDeath();
        return;
      } else {
        this.onPlayerRespawn();
      }
    }

    // Process staggered child spawns, heat decay, and kill effect timers
    this.combat.update(gameDt, this.gameTime);

    // Update trails for active enemies and clean up inactive ones
    this.lifecycle.cleanupEnemies(this.enemies);

    // Explosions
    this.explosions.update(gameDt);

    // Update gravity wells for grid warping during gameplay
    this.gravity.updateGravityWells();

    // Grid micro-forces from moving enemies
    for (const e of this.enemies) {
      if (!e.active || e.isSpawning) continue;
      const speed = e.velocity.magnitude();
      if (speed > 0.01) {
        this.grid.applyImpulse(e.position.x, e.position.y, speed * 2, 80);
      }
    }

    // Player wake on grid
    const pSpeed = this.player.velocity.magnitude();
    if (pSpeed > 0.01) {
      this.grid.applyImpulse(this.player.position.x, this.player.position.y, pSpeed * 3, 60);
    }

    // Bullet ↔ spacetime-fabric wake (Geometry Wars bow wave — Player Design Lab v2 pick).
    // A push impulse ahead of the bullet parts the fabric, a negative well at the bow
    // feeds the shader bulge, and a gentle inward pull behind closes the V. Strength
    // ramps with the weapon stage: subtle at the starting pellet count, full at max.
    const wakeStageIdx = WEAPON_STAGES.indexOf(this.player.getWeaponStage());
    const wakeT = WEAPON_STAGES.length > 1 ? wakeStageIdx / (WEAPON_STAGES.length - 1) : 1;
    const wakeScale = BULLET_WAKE_MIN_SCALE + (1 - BULLET_WAKE_MIN_SCALE) * wakeT;
    for (const b of this.bullets.bullets) {
      if (!b.active) continue;
      const bowX = b.position.x + b.velocity.x * BULLET_WAKE_AHEAD_MS;
      const bowY = b.position.y + b.velocity.y * BULLET_WAKE_AHEAD_MS;
      this.grid.applyImpulse(bowX, bowY, BULLET_WAKE_LEAD * wakeScale, BULLET_WAKE_LEAD_RADIUS);
      this.grid.applyGravityWell(bowX, bowY, BULLET_WAKE_BOW_WELL * wakeScale, BULLET_WAKE_BOW_WELL_RADIUS);
      this.grid.applyImpulse(
        b.position.x - b.velocity.x * BULLET_WAKE_BEHIND_MS,
        b.position.y - b.velocity.y * BULLET_WAKE_BEHIND_MS,
        BULLET_WAKE_TRAIL * wakeScale, BULLET_WAKE_TRAIL_RADIUS,
      );
    }

    // Run spring-mass physics
    this.grid.update(gameDt);

    // Camera
    this.camera.follow(this.player.position);

    // Ambient dust field + thruster wake + debris shards
    this.updateParticles(gameDt);

    // --- Heat system update ---
    this.updateHeat(gameDt);

    // --- Recovery window update ---
    this.updateRecovery(gameDt);

    // --- Boss encounter updates ---
    this.boss.update(gameDt);

    // Track weapon stage for run stats
    const wStage = this.player.getWeaponStage();
    const wIdx = WEAPON_STAGES.indexOf(wStage);
    if (wIdx > this.runStats.weaponStage) this.runStats.weaponStage = wIdx;

    // Music intensity
    this.audio.setMusicIntensity(this.computeIntensity());
  }

  /**
   * Advance the ambient dust field (reacting to BlackHole life-stages), the thruster wake,
   * and the geometry-shatter debris. Ported from the Particle Lab.
   */
  private updateParticles(dt: number): void {
    // (C) Thruster wake — dust kicked out behind the ship as it moves
    const dx = this.player.position.x - this.prevPlayerX;
    const dy = this.player.position.y - this.prevPlayerY;
    const moved = Math.hypot(dx, dy);
    if (moved > 0.5) {
      const behind = Math.atan2(-dy, -dx);
      const rx = this.player.position.x - (dx / moved) * 14;
      const ry = this.player.position.y - (dy / moved) * 14;
      this.field.spawnBurst(rx, ry, behind, 0.7, this.mobile ? 1 : 2, 2.2 + moved * 0.3, 190, 0.5);
    }
    this.prevPlayerX = this.player.position.x;
    this.prevPlayerY = this.player.position.y;

    // (A) Ambient dust: attractors from active BlackHoles, with life-stage heat coupling —
    // pull ramps with swallowed mass, heat (hue bias) spikes to near-white while destabilizing.
    const attractors: FieldAttractor[] = [];
    let destabilizing = false;
    for (const e of this.enemies) {
      if (!e.active) continue;
      // Dust-driven spawn accretion: a forming hole pulls + swirls the ambient dust into an
      // organic accretion ring (replaces the old perfect geometric spawn rings). The attractor
      // and rim emission ramp with spawn progress so the disk visibly tightens as it resolves.
      if (e.isSpawning) {
        if (e instanceof BlackHole) {
          const progress = 1 - e.spawnTimer / e.spawnDuration;
          attractors.push({
            x: e.position.x,
            y: e.position.y,
            strength: PARTICLE_FIELD_DUST_PULL * e.dustStrengthMult * (0.35 + progress * 0.75),
            radius: BlackHole.ATTRACT_RADIUS * e.dustRadiusMult * (0.5 + progress * 0.5),
            heat: 0.12 + progress * 0.28,
            swirl: Math.max(0.9, e.dustSwirl), // strong swirl → a spiralling ring, not straight infall
          });
          // Rain motes onto the growing footprint so there's always a visible converging ring.
          const footR = 70 + progress * 150;
          const count = this.mobile ? 2 : 4;
          for (let k = 0; k < count; k++) {
            const a = Math.random() * Math.PI * 2;
            const rr = footR * (0.85 + Math.random() * 0.3);
            const rx = e.position.x + Math.cos(a) * rr;
            const ry = e.position.y + Math.sin(a) * rr;
            const inward = Math.atan2(e.position.y - ry, e.position.x - rx);
            this.field.spawnBurst(rx, ry, inward, 1.2, 1, 0.14 + Math.random() * 0.2, 200 - progress * 45, 0.7);
          }
        }
        continue;
      }
      // Blue circles carry the BlackHole dust DNA: each is a small attractor so the ambient
      // dust field swirls into a tight accretion halo around it — the same "decorated with
      // the dust field" look the hole has, at circle scale (no satellite dots).
      if (e instanceof CircleEnemy) {
        attractors.push({
          x: e.position.x,
          y: e.position.y,
          strength: PARTICLE_FIELD_CIRCLE_PULL,
          radius: PARTICLE_FIELD_CIRCLE_RADIUS,
          swirl: PARTICLE_FIELD_CIRCLE_SWIRL,
        });
        // Active shed: a moving circle leaks a blue dust mote behind it so the dusty DNA
        // is visible even in fast play (the attractor above then swirls it into a halo).
        const csp = Math.hypot(e.velocity.x, e.velocity.y);
        if (csp > 0.03 && Math.random() < (this.mobile ? 0.3 : PARTICLE_FIELD_CIRCLE_SHED)) {
          const behind = Math.atan2(-e.velocity.y, -e.velocity.x);
          this.field.spawnBurst(e.position.x, e.position.y, behind, 1.4, 1, 0.4 + csp * 1.2, 205, 0.55);
        }
        continue;
      }
      if (!(e instanceof BlackHole)) continue;
      const inst = e.absorbedCount / BlackHole.MAX_ABSORB;
      let heat = inst * 0.5;
      if (e.destabilizing && !e.overloaded) {
        heat = 0.8 + 0.2 * Math.min(1, e.destabilizeTimer / e.destabilizeDuration);
        destabilizing = true;
      }
      attractors.push({
        x: e.position.x,
        y: e.position.y,
        strength: PARTICLE_FIELD_DUST_PULL * e.dustStrengthMult * (1 + inst * 1.2),
        radius: BlackHole.ATTRACT_RADIUS * e.dustRadiusMult,
        heat,
        swirl: e.dustSwirl,
      });
      // Bullet-impact response — every bullet that hit the hole this frame emits all
      // THREE elements of the hole's vocabulary from the impact point:
      //   MATTER (massless) lances spray outward and ESCAPE — no gravity, the headline.
      //   PARTICLES (massy embers) jet out hot, then visibly curve as the well recaptures them.
      //   DUST (massy) fans out slow + cool and rides the swirl back in.
      if (e.impactEjecta.length > 0) {
        const emberCount = this.mobile ? PARTICLE_FIELD_BH_HIT_PARTICLES_MOBILE : PARTICLE_FIELD_BH_HIT_PARTICLES;
        // A fat disk sprays more when shot — the extra dust is disk material knocked loose
        const dustCount = Math.round((this.mobile ? PARTICLE_FIELD_BH_HIT_DUST_MOBILE : PARTICLE_FIELD_BH_HIT_DUST) * (1 + e.diskCharge * BH_DISK_HIT_SPRAY));
        const matterCount = this.mobile ? BH_HIT_MATTER_COUNT_MOBILE : BH_HIT_MATTER_COUNT;
        for (const hitAngle of e.impactEjecta) {
          const hx = e.position.x + Math.cos(hitAngle) * e.collisionRadius * 0.9;
          const hy = e.position.y + Math.sin(hitAngle) * e.collisionRadius * 0.9;
          // MATTER — massless escaping lances (amber-white, sharp, straight)
          this.matter.spray(hx, hy, hitAngle, BH_HIT_MATTER_SPREAD, matterCount, BH_HIT_MATTER_SPEED, BH_HIT_MATTER_LIFE);
          // PARTICLES — hot ember jet along the impact direction (massy: curves back in)
          this.field.spawnBurst(hx, hy, hitAngle, PARTICLE_FIELD_BH_HIT_PARTICLES_SPREAD, emberCount, PARTICLE_FIELD_BH_HIT_PARTICLES_SPEED, 35, 0.7, 1);
          // DUST — slow cool fan flung wider, rides the disk's swirl afterwards
          this.field.spawnBurst(hx, hy, hitAngle, PARTICLE_FIELD_BH_HIT_DUST_SPREAD, dustCount, PARTICLE_FIELD_BH_HIT_DUST_SPEED, 190 + Math.random() * 130, 1.1);
        }
        e.impactEjecta.length = 0;
      }
      // Life-stage dust EMISSION — the hole actively sheds dust that rides its life cycle:
      // a steady trickle that thickens with swallowed mass and becomes a hot inrushing
      // storm as it destabilizes toward supernova. Motes appear on the rim and rain inward
      // (hue slides cool-blue → amber-hot with heat), so the disk visibly thickens + heats
      // as it fills.
      const rimBase = e.collisionRadius * 1.6;
      const emitHue = 210 - heat * 180;
      // `tangent` rotates the spawn direction away from pure inward rain toward an orbital
      // bias (sign follows the hole's dustSwirl), so collected dust settles INTO orbit.
      const emit = (count: number, speed: number, life: number, tangent = 0): void => {
        for (let k = 0; k < count; k++) {
          const a = Math.random() * Math.PI * 2;
          const rr = rimBase + Math.random() * e.collisionRadius * 1.4;
          const rx = e.position.x + Math.cos(a) * rr;
          const ry = e.position.y + Math.sin(a) * rr;
          const inward = Math.atan2(e.position.y - ry, e.position.x - rx);
          this.field.spawnBurst(rx, ry, inward + tangent, 1.1, 1, speed, emitHue, life);
        }
      };
      if (e.destabilizing && !e.overloaded) {
        emit(this.mobile ? 4 : PARTICLE_FIELD_BH_EMIT_CRITICAL, 0.25 + Math.random() * 0.2, 0.8);
      } else if (Math.random() < PARTICLE_FIELD_BH_EMIT_BASE + inst * PARTICLE_FIELD_BH_EMIT_RATE) {
        // Disk accumulation: the trickle thickens with diskCharge (MIN→MAX motes), and
        // charged motes live longer + spawn with a growing tangential bias so they join
        // the orbit instead of raining in and dying — the ring visibly collects.
        const mMin = this.mobile ? BH_DISK_MOTES_MIN_MOBILE : BH_DISK_MOTES_MIN;
        const mMax = this.mobile ? BH_DISK_MOTES_MAX_MOBILE : BH_DISK_MOTES_MAX;
        const diskCount = Math.round(mMin + e.diskCharge * (mMax - mMin));
        const diskLife = 0.95 + e.diskCharge * (BH_DISK_MOTE_LIFE - 0.95);
        const diskTangent = e.diskCharge * BH_DISK_MOTE_TANGENT * (Math.PI / 2) * (Math.sign(e.dustSwirl) || 1);
        emit(diskCount, 0.12 + Math.random() * 0.14, diskLife, diskTangent);
      }
      // Ambient EMBERS (the "particles" element) — hot bright motes shed on the rim that
      // orbit + infall, so the disk sparkles even between bullet hits.
      if (!this.mobile && Math.random() < PARTICLE_FIELD_BH_EMBER_BASE) {
        for (let k = 0; k < PARTICLE_FIELD_BH_EMBER_COUNT; k++) {
          const a = Math.random() * Math.PI * 2;
          const rr = rimBase + Math.random() * e.collisionRadius * 1.2;
          const rx = e.position.x + Math.cos(a) * rr;
          const ry = e.position.y + Math.sin(a) * rr;
          const inward = Math.atan2(e.position.y - ry, e.position.x - rx);
          this.field.spawnBurst(rx, ry, inward, 1.4, 1, 0.2 + Math.random() * 0.2, 40, 1.1, 1);
        }
      }
      // Ambient MATTER trickle — a stressed hole spits the occasional escaping lance even
      // without being shot (hit-driven spray above remains the main show).
      if ((inst > 0.6 || (e.destabilizing && !e.overloaded)) && Math.random() < BH_MATTER_TRICKLE) {
        const a = Math.random() * Math.PI * 2;
        const rx = e.position.x + Math.cos(a) * e.collisionRadius * 0.9;
        const ry = e.position.y + Math.sin(a) * e.collisionRadius * 0.9;
        this.matter.spray(rx, ry, a, 0.6, BH_MATTER_TRICKLE_COUNT, BH_HIT_MATTER_SPEED * 0.8, BH_HIT_MATTER_LIFE);
      }
    }
    this.field.brightness = destabilizing ? 1.4 : 1;
    this.field.update(dt, attractors, {
      cx: this.camera.renderX,
      cy: this.camera.renderY,
      halfW: this.renderer.width / 2,
      halfH: this.renderer.height / 2,
    });
    this.matter.update(dt);
    this.debris.update(dt);
  }

  /** Update combat feedback timers (banners, telegraphs, border pulse, supernova flash) */
  private updateCombatFeedback(dt: number): void {
    if (this.supernovaFlashTimer > 0) this.supernovaFlashTimer -= dt;

    // Phase banner
    if (this.phaseBannerTimer > 0) this.phaseBannerTimer -= dt;
    // Border pulse
    if (this.phaseBorderPulseTimer > 0) this.phaseBorderPulseTimer -= dt;

    // Spawn telegraphs
    this.spawn.updateTelegraphs(dt);
  }

  /** Apply heat-driven visual hooks (heat value is owned by CombatSystem). */
  private updateHeat(dt: number): void {
    const heat = this.combat.heatValue;

    // Track peak heat for run stats
    if (heat > this.runStats.peakHeat) this.runStats.peakHeat = heat;

    // Bloom intensity boost
    const baseBloom = gameSettings.bloomIntensity;
    this.bloom.intensity = baseBloom + heat * HEAT_BLOOM_BOOST_MAX;

    // Grid turbulence: random micro-impulses scaled by heat
    if (heat > 0.1) {
      const turbulence = (heat - 0.1) / 0.9 * HEAT_GRID_TURBULENCE_MAX;
      const count = Math.ceil(heat * 3);
      const hw = gameSettings.arenaWidth / 2;
      const hh = gameSettings.arenaHeight / 2;
      for (let i = 0; i < count; i++) {
        const rx = (Math.random() - 0.5) * hw * 2;
        const ry = (Math.random() - 0.5) * hh * 2;
        this.grid.applyImpulse(rx, ry, turbulence * (0.5 + Math.random() * 0.5), 100 + Math.random() * 100);
      }
    }
  }

  /** Update recovery window state */
  private updateRecovery(dt: number): void {
    if (!this.recoveryActive) return;

    this.recoveryTimer -= dt;

    // Keep player invulnerable during recovery
    if (this.recoveryTimer > 0) {
      this.player.invulnTimer = Math.max(this.player.invulnTimer, this.recoveryTimer);
    }

    // Expiry warning at 800ms remaining
    if (this.recoveryTimer <= 800 && !this.recoveryExpirePlayed) {
      this.audio.playRecoveryExpire();
      this.recoveryExpirePlayed = true;
    }

    // End recovery
    if (this.recoveryTimer <= 0) {
      this.recoveryActive = false;
      this.recoveryTimer = 0;
      this.player.fireRateOverride = 1;
    }
  }

  /** Per-frame pairwise separation: push overlapping enemies apart (Grid Wars style) */
  private separateEnemies(): void {
    runSeparation(this.enemies, this.gravity.getEnemiesInGravityWell());
  }

  /** Render phase transition border pulse */
  private renderBorderPulse(): void {
    if (this.phaseBorderPulseTimer <= 0) return;
    const hw = gameSettings.arenaWidth / 2;
    const hh = gameSettings.arenaHeight / 2;
    const t = 1 - this.phaseBorderPulseTimer / PHASE_BORDER_PULSE_DURATION;
    const alpha = (1 - t) * 0.8;

    // White pulse over the border
    this.renderer.drawLine(-hw, -hh, hw, -hh, 1, 1, 1, alpha);
    this.renderer.drawLine(hw, -hh, hw, hh, 1, 1, 1, alpha);
    this.renderer.drawLine(hw, hh, -hw, hh, 1, 1, 1, alpha);
    this.renderer.drawLine(-hw, hh, -hw, -hh, 1, 1, 1, alpha);

    // Expanding inner pulse
    const inset = t * 20;
    this.renderer.drawLine(-hw + inset, -hh + inset, hw - inset, -hh + inset, 1, 0.6, 0.2, alpha * 0.5);
    this.renderer.drawLine(hw - inset, -hh + inset, hw - inset, hh - inset, 1, 0.6, 0.2, alpha * 0.5);
    this.renderer.drawLine(hw - inset, hh - inset, -hw + inset, hh - inset, 1, 0.6, 0.2, alpha * 0.5);
    this.renderer.drawLine(-hw + inset, hh - inset, -hw + inset, -hh + inset, 1, 0.6, 0.2, alpha * 0.5);
  }

  private onPlayerDeath(): void {
    this.timeDilation.cancel(false);
    this.input.releaseTimeDilationAction();
    // Reuse the death slowmo shockwave animation for game over
    this.state = 'death_slowmo';
    this.slowmoTimer = 0;
    this.slowmoShockwaveRadius = 0;
    this.slowmoOrigin = this.player.position.clone();
    this.slowmoIsFinal = true; // flag: transitions to gameover, not respawn
    this.player.active = false;

    const px = this.player.position.x;
    const py = this.player.position.y;

    // Primary death explosion — massive
    this.explosions.spawn(
      px, py,
      [1, 1, 0.78],
      this.mobile ? Math.floor(EXPLOSION_PARTICLE_COUNT_DEATH * 0.5) : EXPLOSION_PARTICLE_COUNT_DEATH,
      EXPLOSION_DURATION_DEATH,
      0.2,
    );
    // Secondary colored explosion ring
    this.explosions.spawn(
      px, py,
      [1, 0.4, 0.1],
      this.mobile ? 30 : 60,
      EXPLOSION_DURATION_DEATH * 0.7,
      0.35,
    );

    // Massive grid shockwave
    this.grid.applyImpulse(px, py, 1600, 500);
    this.camera.shake(SCREEN_SHAKE_DEATH, 0.8);

    // Clean up bullet trails
    this.lifecycle.clearBulletTrails(this.bullets);
    this.bullets.clear();

    this.audio.playSFX('die');
    this.audio.stopMusic();
  }

  private onPlayerRespawn(): void {
    this.timeDilation.cancel(false);
    this.input.releaseTimeDilationAction();
    // Enter death slowmo — time slows, shockwave expands, enemies explode on contact
    this.state = 'death_slowmo';
    this.slowmoTimer = 0;
    this.slowmoShockwaveRadius = 0;
    this.slowmoOrigin = this.player.position.clone();
    this.slowmoIsFinal = false;
    this.player.active = false;

    // Initial hit explosion
    this.explosions.spawn(
      this.player.position.x, this.player.position.y,
      [1, 1, 0.78],
      EXPLOSION_PARTICLE_COUNT_LARGE,
      EXPLOSION_DURATION_DEFAULT,
    );
    this.grid.applyImpulse(this.player.position.x, this.player.position.y, 1200, 400);
    this.camera.shake(SCREEN_SHAKE_LARGE, 0.5);

    // Clean up bullet trails
    this.lifecycle.clearBulletTrails(this.bullets);
    this.bullets.clear();

    this.audio.playSFX('die1');
  }

  private updateDeathSlowmo(dt: number): void {
    this.slowmoTimer += dt;

    // Scale game time very slowly during slowmo
    const gameDt = dt * DEATH_SLOWMO_TIME_SCALE;

    // Expand shockwave
    this.slowmoShockwaveRadius += DEATH_SLOWMO_SHOCKWAVE_SPEED * dt;

    // Kill enemies caught by shockwave with spectacular explosions
    for (const e of this.enemies) {
      if (!e.active) continue;
      const dx = e.position.x - this.slowmoOrigin.x;
      const dy = e.position.y - this.slowmoOrigin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= this.slowmoShockwaveRadius) {
        e.active = false;
        // Spectacular explosion per enemy
        this.explosions.spawn(
          e.position.x, e.position.y, e.color,
          this.mobile ? 40 : 80,
          EXPLOSION_DURATION_LARGE * 0.6,
        );
        this.grid.applyImpulse(e.position.x, e.position.y, 400, 200);
        this.camera.shake(SCREEN_SHAKE_SMALL * 0.5, 0.1);
        this.audio.playSFX('crash');
      }
    }

    // Update explosions (at slowed rate)
    this.explosions.update(gameDt);
    this.debris.update(gameDt);
    this.grid.update(gameDt);
    this.camera.updateShake(gameDt);

    // Gentle enemy movement during slowmo
    for (const e of this.enemies) {
      if (!e.active) continue;
      e.rotation += gameDt * 0.002;
    }

    // Pulsing shockwave ring on grid
    this.grid.applyImpulse(
      this.slowmoOrigin.x, this.slowmoOrigin.y,
      120, this.slowmoShockwaveRadius,
    );

    // Update trails for active enemies and clean up inactive ones
    this.lifecycle.cleanupEnemies(this.enemies);

    // End slowmo
    if (this.slowmoTimer >= DEATH_SLOWMO_DURATION) {
      if (this.slowmoIsFinal) {
        // Finalize run stats
        this.runStats.score = this.player.score;
        this.runStats.kills = this.player.enemiesKilled;
        this.runStats.timeSurvived = this.gameTime;
        this.gameOverMedals = computeMedals(this.runStats);
        this.medalRevealPlayed = false;

        // Transition to game over screen
        this.state = 'gameover';
        this.gameOverTime = 0;
        this.gameCanvas.style.cursor = 'default';
        this.audio.setBlackHoleStress(0);
        this.audio.playGameOver();
        this.hud.drawGameOver(this.runStats, this.gameOverMedals, 0);
        if (!this.mobile) showDesktopSettings();
      } else {
        // Respawn and continue playing with recovery buff
        this.state = 'playing';
        this.lifecycle.clear();
        this.enemies.length = 0;
        this.combat.clearPendingSpawns();
        this.gravity.clear();
        this.player.respawn();
        this.player.active = true;
        // Bring the wingman back to the player's side after the screen-clearing respawn
        if (this.wingman) this.wingman.spawnBeside(this.player.position.x, this.player.position.y);
        this.camera.snapTo(this.player.position);

        // Activate recovery window
        this.runStats.recoveriesUsed++;
        this.recoveryActive = true;
        this.recoveryTimer = RECOVERY_DURATION;
        this.recoveryExpirePlayed = false;
        this.player.invulnTimer = RECOVERY_DURATION;
        this.player.fireRateOverride = RECOVERY_FIRE_RATE_MULT;
        this.audio.playRecoveryStart();
      }
    }
  }

  render(): void {
    // Use shake-offset camera for rendering
    const cameraX = this.camera.renderX;
    const cameraY = this.camera.renderY;
    this.renderer.cameraX = cameraX;
    this.renderer.cameraY = cameraY;

    // Feed shake + time into bloom composite for chromatic aberration + warp
    this.bloom.shakeIntensity = this.camera.shakeNormalized;
    this.bloom.time = this.totalTime;

    // Design Lab: delegate render entirely
    if (this.state === 'design_lab') {
      this.designLab!.render();
      return;
    }

    // --- Render to bloom scene FBO ---
    this.bloom.bindSceneFBO();

    // 1. Grid (renders directly with its own shader)
    this.grid.render(cameraX, cameraY, this.renderer.width, this.renderer.height);

    // 2. Starfield (faint background dots, before entities)
    this.renderer.begin(false);
    this.starfield.render(this.renderer, cameraX, cameraY);
    this.renderer.end();

    // 3. Arena border + Entities — NORMAL blend
    this.renderer.begin(false);
    this.renderArenaBorder();
    this.renderBorderPulse();

    if (this.state === 'playing' || this.state === 'death_slowmo') {
      // Render spawn telegraphs (behind entities)
      this.spawn.renderTelegraphs(this.renderer);
      this.renderEnemiesWarped();
      if (this.state === 'playing') {
        this.bullets.render(this.renderer);
        this.player.render(this.renderer);
        if (this.wingman) this.wingman.render(this.renderer);
        // Recovery shield ring
        if (this.recoveryActive) {
          this.renderRecoveryShield();
        }
        // Crosshair: desktop = at mouse cursor world pos, touch = near player at aim angle
        if (this.input.isTouchActive()) {
          const aimAngle = this.player.aimAngle;
          const touchDist = 38;
          this.aimIndicator.render(
            this.renderer,
            this.player.position.x + Math.cos(aimAngle) * touchDist,
            this.player.position.y + Math.sin(aimAngle) * touchDist,
            this.totalTime * 1000,
          );
        } else {
          const mouseWorld = this.input.getMouseWorldPos();
          this.aimIndicator.render(
            this.renderer,
            mouseWorld.x,
            mouseWorld.y,
            this.totalTime * 1000,
          );
        }
      }

      // Shockwave ring during death slowmo
      if (this.state === 'death_slowmo') {
        const pulse = 0.7 + 0.3 * Math.sin(this.slowmoTimer * 0.01);
        this.renderer.drawCircle(
          this.slowmoOrigin.x, this.slowmoOrigin.y,
          this.slowmoShockwaveRadius,
          [1.0 * pulse, 0.8 * pulse, 0.3 * pulse],
          48,
          0.6 * (1 - this.slowmoTimer / DEATH_SLOWMO_DURATION),
        );
      }

      // Off-screen indicators
      renderOffscreenIndicators(this.renderer, this.camera, this.enemies);
    }

    // Game over: render frozen enemies with unique glow effects
    if (this.state === 'gameover') {
      const t = this.gameOverTime;
      for (const e of this.enemies) e.renderGlow(this.renderer, t);
    }

    // 4. Switch to additive blend for dust, trails, debris, explosions, glow, kill signatures
    this.renderer.setBlendMode('additive');
    this.field.render(this.renderer);
    this.matter.render(this.renderer);
    this.renderDarkMatterHarvest();
    this.lifecycle.trailSystem.render(this.renderer);
    this.debris.render(this.renderer);
    this.explosions.render(this.renderer);
    this.combat.render(this.renderer);
    this.gravity.renderEffects(this.renderer);
    // setBlendMode('normal') flushes additive batch and restores blend func
    this.renderer.setBlendMode('normal');
    this.renderer.end();

    // --- Bloom post-process: scene FBO -> screen ---
    this.bloom.apply(this.renderer.canvasWidth, this.renderer.canvasHeight);

    // --- Supernova screen flash (after bloom, over entire screen) ---
    if (this.supernovaFlashTimer > 0) {
      const flashT = this.supernovaFlashTimer / SUPERNOVA_FLASH_DURATION;
      const flashAlpha = flashT * 0.6;
      // Draw large quad covering visible area
      this.renderer.begin(false);
      const hw = gameSettings.arenaWidth;
      const hh = gameSettings.arenaHeight;
      this.renderer.drawTriangle(-hw, -hh, hw, -hh, hw, hh, 1, 1, 1, flashAlpha);
      this.renderer.drawTriangle(-hw, -hh, hw, hh, -hw, hh, 1, 1, 1, flashAlpha);
      this.renderer.end();
    }

    // --- HUD (drawn on separate 2D canvas, unaffected by bloom) ---
    if (this.state === 'playing' || this.state === 'death_slowmo') {
      this.hud.drawPlaying(this.player.score, this.player.lives, this.audio.muted, this.enemies.length, this.input.autoFire);
      this.hud.drawTimeDilation(this.timeDilation.snapshot, this.input.timeButtonPressed);

      // Recovery banner
      if (this.recoveryActive && this.state === 'playing') {
        this.hud.drawRecoveryBanner(this.recoveryTimer / RECOVERY_DURATION);
      }

      // Phase transition banner
      if (this.phaseBannerTimer > 0) {
        const progress = 1 - this.phaseBannerTimer / PHASE_BANNER_DURATION;
        this.hud.drawPhaseBanner(this.phaseBannerName, progress);
      }

      // Boss warning banners, HP bars, and defeated banners
      this.boss.renderHud(this.hud);

      // Virtual joysticks (drawn on HUD canvas, not during slowmo)
      if (this.state === 'playing') {
        this.joystickRenderer.render(this.input);
      }
    }
  }

  /**
   * Render enemies, applying the tidal death warp (spaghettification) to any unit whose
   * geometry has drifted inside a BlackHole's reach — it stretches + twists toward the hole
   * in its final moments. The holes themselves render clean.
   */
  private renderEnemiesWarped(): void {
    const holes: BlackHole[] = [];
    for (const e of this.enemies) {
      if (e.active && !e.isSpawning && e instanceof BlackHole) holes.push(e);
    }
    for (const e of this.enemies) {
      let warped = false;
      if (holes.length && e.active && !e.isSpawning && !(e instanceof BlackHole)) {
        for (const h of holes) {
          const reach = Math.max(DEATH_WARP_REACH_MIN, h.collisionRadius * DEATH_WARP_REACH_MULT);
          const dx = h.position.x - e.position.x;
          const dy = h.position.y - e.position.y;
          if (dx * dx + dy * dy < reach * reach) {
            this.renderer.setWarp(
              h.position.x, h.position.y, 1,
              DEATH_WARP_STRETCH * h.warpStretchMult, DEATH_WARP_TWIST * h.warpTwistMult, reach,
            );
            warped = true;
            break;
          }
        }
      }
      if (!warped) this.renderer.clearWarp();
      e.render(this.renderer);
    }
    this.renderer.clearWarp();
  }

  private renderDarkMatterHarvest(): void {
    const state = this.timeDilation.snapshot;
    if (!state.harvesting || this.state !== 'playing') return;
    const px = this.player.position.x;
    const py = this.player.position.y;
    const count = state.coreHarvesting ? 12 : 7;
    const time = performance.now() * 0.001;
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2 + time * (i % 2 ? 0.6 : -0.45);
      const phase = (time * (state.coreHarvesting ? 1.8 : 1.1) + i / count) % 1;
      const radius = 18 + (1 - phase) * (state.coreHarvesting ? 62 : 42);
      const x = px + Math.cos(angle) * radius;
      const y = py + Math.sin(angle) * radius;
      const nx = px + Math.cos(angle) * Math.max(12, radius - 9);
      const ny = py + Math.sin(angle) * Math.max(12, radius - 9);
      this.renderer.drawLine(x, y, nx, ny, 0.42, 0.75, 1, 0.18 + phase * 0.5);
    }
  }

  /** Render recovery shield ring around player */
  private renderRecoveryShield(): void {
    if (!this.recoveryActive) return;
    const px = this.player.position.x;
    const py = this.player.position.y;
    const t = 1 - this.recoveryTimer / RECOVERY_DURATION;
    const [sr, sg, sb] = RECOVERY_SHIELD_COLOR;

    // Pulsing alpha (faster pulse as it expires)
    const pulseSpeed = 4 + t * 8;
    const pulse = 0.5 + 0.5 * Math.sin(this.totalTime * pulseSpeed);
    const alpha = (1 - t * 0.5) * (0.4 + pulse * 0.4);

    // Shield ring
    const radius = RECOVERY_SHIELD_RADIUS + pulse * 3;
    this.renderer.drawCircle(px, py, radius, [sr, sg, sb], 24, alpha);

    // Inner glow ring
    this.renderer.drawCircle(px, py, radius * 0.8, [sr * 0.8, sg * 0.8, sb * 0.8], 16, alpha * 0.3);

    // Expiry warning: fast blink when <800ms remaining
    if (this.recoveryTimer <= 800) {
      const blink = Math.sin(this.totalTime * 20) > 0 ? 0.7 : 0.2;
      this.renderer.drawCircle(px, py, radius * 1.2, [1, 0.5, 0.2], 16, blink * (1 - t));
    }
  }

  /** Render the arena border — solid neon lines at world edges, heat-influenced */
  private renderArenaBorder(): void {
    const hw = gameSettings.arenaWidth / 2;
    const hh = gameSettings.arenaHeight / 2;
    // Heat shifts border toward warm colors (orange/white) and increases brightness
    const heatMix = this.combat.heatValue * HEAT_BORDER_BRIGHTNESS_MAX;
    const br = Math.min(1, ARENA_BORDER_COLOR[0] + heatMix * 2.0);  // push toward warm
    const bg = Math.min(1, ARENA_BORDER_COLOR[1] + heatMix * 0.6);
    const bb = Math.min(1, ARENA_BORDER_COLOR[2] - heatMix * 0.3);  // reduce blue at high heat
    const cr = Math.min(1, ARENA_BORDER_CORNER_COLOR[0] + heatMix);
    const cg = Math.min(1, ARENA_BORDER_CORNER_COLOR[1] + heatMix * 0.5);
    const cb = Math.min(1, ARENA_BORDER_CORNER_COLOR[2] - heatMix * 0.2);
    const a = ARENA_BORDER_ALPHA;

    // Main border lines
    this.renderer.drawLine(-hw, -hh, hw, -hh, br, bg, bb, a); // bottom
    this.renderer.drawLine(hw, -hh, hw, hh, br, bg, bb, a);   // right
    this.renderer.drawLine(hw, hh, -hw, hh, br, bg, bb, a);   // top
    this.renderer.drawLine(-hw, hh, -hw, -hh, br, bg, bb, a); // left

    // Inner glow line (slightly inset, dimmer)
    const inset = 3;
    const ga = a * 0.4;
    this.renderer.drawLine(-hw + inset, -hh + inset, hw - inset, -hh + inset, br, bg, bb, ga);
    this.renderer.drawLine(hw - inset, -hh + inset, hw - inset, hh - inset, br, bg, bb, ga);
    this.renderer.drawLine(hw - inset, hh - inset, -hw + inset, hh - inset, br, bg, bb, ga);
    this.renderer.drawLine(-hw + inset, hh - inset, -hw + inset, -hh + inset, br, bg, bb, ga);

    // Corner accents — brighter L-shapes at each corner
    const cornerLen = 80;
    const ca = a * 1.0;
    // Bottom-left
    this.renderer.drawLine(-hw, -hh, -hw + cornerLen, -hh, cr, cg, cb, ca);
    this.renderer.drawLine(-hw, -hh, -hw, -hh + cornerLen, cr, cg, cb, ca);
    // Bottom-right
    this.renderer.drawLine(hw, -hh, hw - cornerLen, -hh, cr, cg, cb, ca);
    this.renderer.drawLine(hw, -hh, hw, -hh + cornerLen, cr, cg, cb, ca);
    // Top-right
    this.renderer.drawLine(hw, hh, hw - cornerLen, hh, cr, cg, cb, ca);
    this.renderer.drawLine(hw, hh, hw, hh - cornerLen, cr, cg, cb, ca);
    // Top-left
    this.renderer.drawLine(-hw, hh, -hw + cornerLen, hh, cr, cg, cb, ca);
    this.renderer.drawLine(-hw, hh, -hw, hh - cornerLen, cr, cg, cb, ca);
  }

  private enterDesignLab(): void {
    this.state = 'design_lab';
    this.gameCanvas.style.cursor = 'crosshair';
    if (!this.mobile) hideDesktopSettings();
    if (!this.designLab) {
      this.designLab = new DesignLab(
        this.renderer, this.bloom, this.grid, this.lifecycle.trailSystem,
        this.camera, this.input, this.audio, this.hud, this.starfield,
      );
    }
    this.designLab.enter();
    // Init audio on first interaction if needed
    if (!this.audio.initialized) {
      this.audio.init().catch(() => {});
    }
  }

  private exitDesignLab(): void {
    this.designLab?.exit();
    this.state = 'menu';
    this.gameCanvas.style.cursor = 'default';
    if (!this.mobile) showDesktopSettings();
    // Rebuild grid for menu idle animation
    this.grid.rebuild(gameSettings.arenaWidth, gameSettings.arenaHeight, gameSettings.gridSpacing);
    this.hud.drawMenu();
  }

  /** Called when tab is hidden */
  onPause(): void {
    // Visibility pauses must never leave the music/gameplay graph stuck below 1x.
    this.timeDilation.cancel(false);
    this.input.releaseTimeDilationAction();
  }

  /** Called when tab is visible again */
  onResume(): void {
    this.audio.resume();
  }

  /** Called when device rotates to portrait */
  onOrientationPause(): void {
    this.timeDilation.cancel(false);
    this.input.releaseTimeDilationAction();
  }

  /** Called when device rotates back to landscape */
  onOrientationResume(): void {
    this.audio.resume().catch(() => {});
    this.resize();
    this.applyVisualSettings();
  }

  private applyVisualSettings(): void {
    this.bloom.intensity = gameSettings.bloomIntensity;
    this.bloom.threshold = gameSettings.bloomThreshold;
    this.bloom.blurPasses = this.mobile ? Math.min(gameSettings.bloomBlurPasses, 2) : gameSettings.bloomBlurPasses;
    this.bloom.blurRadius = gameSettings.bloomBlurRadius;
    this.lifecycle.applyVisualSettings(this.mobile);
  }

  /** Stable read-only browser surface used by deterministic feature flows. */
  get timeDilationState(): TimeDilationSnapshot { return this.timeDilation.snapshot; }

  /** Deterministic test hook; never used by normal gameplay. */
  debugSetDarkMatterCharge(value: number): void { this.timeDilation.debugSetCharge(value); }

  /** Deterministic test hook: place a fully active BlackHole at a known player distance. */
  debugSpawnHarvestBlackHole(distance: number): BlackHole {
    const bh = createEnemy('blackhole', new Vec2(this.player.position.x + distance, this.player.position.y)) as BlackHole;
    bh.spawnTimer = 0;
    bh.active = true;
    this.enemies.push(bh);
    this.lifecycle.spawnEnemy(bh);
    return bh;
  }

  /** Deterministic test hook: place a fully active Sierpinski of the given tier. */
  debugSpawnSierpinski(tier: number, x = this.player.position.x + 200, y = this.player.position.y): Enemy {
    const s = createEnemy('sierpinski', new Vec2(x, y), false, tier);
    s.spawnTimer = 0;
    s.active = true;
    this.enemies.push(s);
    this.lifecycle.spawnEnemy(s);
    return s;
  }

  /** Deterministic test hook: run a single enemy through the real kill/crack pipeline. */
  debugKillEnemy(enemy: Enemy, impactAngle = 0): void {
    enemy.active = false;
    this.combat.processKills({
      killedEnemies: [{
        enemy,
        position: enemy.position.clone(),
        color: enemy.color,
        scoreValue: enemy.scoreValue,
        impactAngle,
      }],
      playerHit: false,
    });
    this.lifecycle.cleanupEnemies(this.enemies);
  }
}
