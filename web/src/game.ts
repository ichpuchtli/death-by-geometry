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
import { separateEnemies as runSeparation } from './systems/separation';
import { Bot } from './ai/bot';
import { Wingman } from './entities/wingman';
import { RunStats, computeMedals } from './core/run-stats';
import { createEnemy } from './spawner/enemy-factory';
import { BlackHole } from './entities/enemies/blackhole';
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
    this.player = new Player(this.input);
    this.bullets = new BulletPool();
    this.explosions = new ExplosionPool();
    this.combat = new CombatSystem(this.mobile, {
      player: this.player,
      runStats: this.runStats,
      enemies: this.enemies,
      lifecycle: this.lifecycle,
      audio: this.audio,
      explosions: this.explosions,
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
    // suppresses synthetic click, and passive/non-passive conflicts cause issues)
    gameCanvas.addEventListener('click', () => this.onInteract());
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

  private onInteract(): void {
    // Init audio on first user gesture (non-blocking so game start isn't
    // prevented by audio failures on iOS Safari)
    if (!this.audio.initialized) {
      this.audio.init().catch(() => {});
    } else {
      this.audio.resume().catch(() => {});
    }

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
    this.explosions.clear();
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
    this.totalTime += dt / 1000;
    this.hud.updateFps(dt);

    this.camera.updateShake(dt);

    // Update touch mode on HUD
    this.hud.setTouchMode(this.input.mode === 'touch');

    if (this.state === 'design_lab') {
      this.designLab!.update(dt);
      return;
    }

    if (this.state === 'gameover') {
      this.grid.update(dt);
      this.updateGameOver(dt);
      return;
    }

    if (this.state === 'death_slowmo') {
      this.updateDeathSlowmo(dt);
      return;
    }

    if (this.state !== 'playing') {
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
    this.updateCombatFeedback(dt);

    // Hitstop: freeze gameplay, keep visuals alive
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.explosions.update(dt);
      this.gravity.updateGravityWells();
      this.grid.update(dt);
      this.audio.setMusicIntensity(this.computeIntensity());
      return;
    }

    this.gameTime += dt / 1000;

    // AI agent decision for this frame (writes into the input layer)
    this.driveBot();

    // Player
    this.player.update(dt);
    this.gravity.applyPlayerPull(dt);

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
      this.wingman.update(dt, this.enemies, gameSettings.arenaWidth, gameSettings.arenaHeight);
      const wShots = this.wingman.tryShoot(this.player.getWeaponStage());
      if (wShots) {
        for (const angle of wShots) {
          const b = this.bullets.spawn(this.wingman.position.x, this.wingman.position.y, angle);
          if (b) this.lifecycle.spawnBullet(b);
        }
      }
    }

    // Bullets
    this.bullets.update(dt);

    // Update bullet trails + clean up inactive
    this.lifecycle.updateBulletTrails(this.bullets);

    // BlackHole attraction — pull nearby non-blackhole enemies toward black holes
    this.gravity.applyAttraction(dt);

    // Shockwave ring effects + BlackHole stress-wobble audio level
    this.gravity.update(dt);

    // Update circle flock centroids (shared Vec2 refs held by each CircleEnemy)
    this.gravity.updateFlocks();

    // Enemies — Pass 1: AI + movement
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (e.isSpawning) {
        e.spawnTimer = Math.max(0, e.spawnTimer - dt / 1000);
        continue; // skip movement/AI during spawn
      }
      (e as { update(dt: number, playerPos?: Vec2): void }).update(dt, this.player.position);
    }

    // Enemies — Pass 2: Separation (push overlapping enemies apart)
    this.separateEnemies();

    // Spawn — WaveManager execution, caps, spawn SFX, formation telegraphs
    this.spawn.update(dt);

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

    // Player hit
    if (result.playerHit) {
      this.player.lives--;
      this.runStats.livesUsed++;
      if (this.player.lives <= 0) {
        this.onPlayerDeath();
        return;
      } else {
        this.onPlayerRespawn();
      }
    }

    // Process staggered child spawns, heat decay, and kill effect timers
    this.combat.update(dt, this.gameTime);

    // Update trails for active enemies and clean up inactive ones
    this.lifecycle.cleanupEnemies(this.enemies);

    // Explosions
    this.explosions.update(dt);

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

    // Bullet grid ripples (very subtle)
    for (const b of this.bullets.bullets) {
      if (!b.active) continue;
      this.grid.applyImpulse(b.position.x, b.position.y, 0.5, 40);
    }

    // Run spring-mass physics
    this.grid.update(dt);

    // Camera
    this.camera.follow(this.player.position);

    // --- Heat system update ---
    this.updateHeat(dt);

    // --- Recovery window update ---
    this.updateRecovery(dt);

    // --- Boss encounter updates ---
    this.boss.update(dt);

    // Track weapon stage for run stats
    const wStage = this.player.getWeaponStage();
    const wIdx = WEAPON_STAGES.indexOf(wStage);
    if (wIdx > this.runStats.weaponStage) this.runStats.weaponStage = wIdx;

    // Music intensity
    this.audio.setMusicIntensity(this.computeIntensity());
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
      for (const e of this.enemies) e.render(this.renderer);
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

    // 4. Switch to additive blend for trails, explosions, glow, kill signatures
    this.renderer.setBlendMode('additive');
    this.lifecycle.trailSystem.render(this.renderer);
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
    // Nothing special needed — game loop already stops
  }

  /** Called when tab is visible again */
  onResume(): void {
    this.audio.resume();
  }

  /** Called when device rotates to portrait */
  onOrientationPause(): void {
    // Game loop stops via index.ts — game state stays intact
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
}
