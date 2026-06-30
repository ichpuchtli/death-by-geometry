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
import { RunStats, computeMedals } from './core/run-stats';
import { createEnemy } from './spawner/enemy-factory';
import { Pinwheel } from './entities/enemies/pinwheel';
import { MiniMandel } from './entities/enemies/minimandel';
import { BlackHole } from './entities/enemies/blackhole';
import { CircleEnemy } from './entities/enemies/circle';
import { Sierpinski } from './entities/enemies/sierpinski';
import { Mandelbrot } from './entities/enemies/mandelbrot';
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
  ENEMY_SEPARATION_BUFFER,
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
  MINIBOSS_SPAWN_TIME,
  MINIBOSS_WARNING_DURATION,
  MINIBOSS_HITSTOP_STAGE,
  MINIBOSS_RESPAWN_DELAY,
  MINIBOSS_DEFEATED_BANNER_DURATION,
  MINIBOSS_SPAWN_SUPPRESS_MULT,
  SIERPINSKI_BOSS_SPAWN_TIME,
  SIERPINSKI_BOSS_WARNING_DURATION,
  SIERPINSKI_BOSS_RESPAWN_DELAY,
  SIERPINSKI_BOSS_DEFEATED_BANNER_DURATION,
  SIERPINSKI_BOSS_SPAWN_SUPPRESS_MULT,
  MedalDef,
  BULLET_GRAVITY_STRENGTH,
  SUPERNOVA_PARTICLE_COUNT,
  SUPERNOVA_GRID_IMPULSE,
  SUPERNOVA_HITSTOP,
  SUPERNOVA_FLASH_DURATION,
  CIRCLE_EJECT_SPEED_MIN,
  CIRCLE_EJECT_SPEED_MAX,
  CIRCLE_SUPERNOVA_SPAWN_MULTIPLIER,
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

  // Supernova flash + warning tracking
  private supernovaFlashTimer = 0;
  private supernovaWarningPlayed = new Set<BlackHole>();

  // Circle flock groups: shared centroid Vec2 updated each frame so circles snap back together
  private circleFlocks: Array<{ center: Vec2; members: CircleEnemy[] }> = [];

  // Design Lab
  private designLab: DesignLab | null = null;

  // Sierpinski boss encounter state
  private sierpinskiBossActive = false;
  private sierpinskiBossDefeated = false;
  private sierpinskiBossWarningTimer = 0;
  private sierpinskiBossRef: Sierpinski | null = null;
  private sierpinskiBossDefeatedBannerTimer = 0;
  private sierpinskiBossRespawnTimer = 0;

  // Miniboss encounter state
  private minibossActive = false;
  private minibossDefeated = false;
  private minibossWarningTimer = 0; // ms remaining in warning phase
  private minibossRef: Mandelbrot | null = null;
  private minibossDefeatedBannerTimer = 0;
  private minibossRespawnTimer = 0;   // ms until re-trigger after player death
  private savedSpawnRateMultiplier = 1.0;

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
      onMinibossDefeated: () => this.onMinibossDefeated(),
      onSierpinskiBossDefeated: () => this.onSierpinskiBossDefeated(),
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
    this.circleFlocks = [];
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
    this.supernovaWarningPlayed.clear();
    this.sierpinskiBossActive = false;
    this.sierpinskiBossDefeated = false;
    this.sierpinskiBossWarningTimer = 0;
    this.sierpinskiBossRef = null;
    this.sierpinskiBossDefeatedBannerTimer = 0;
    this.sierpinskiBossRespawnTimer = 0;
    this.minibossActive = false;
    this.minibossDefeated = false;
    this.minibossWarningTimer = 0;
    this.minibossRef = null;
    this.minibossDefeatedBannerTimer = 0;
    this.minibossRespawnTimer = 0;
    this.savedSpawnRateMultiplier = 1.0;
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

  private updateGravityWells(): void {
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (e instanceof BlackHole) {
        // Ramp gravity during spawn so the fabric warps in gradually
        let spawnFactor = 1;
        if (e.isSpawning) {
          spawnFactor = 1 - e.spawnTimer / e.spawnDuration; // 0→1 over spawn
          spawnFactor = spawnFactor * spawnFactor; // ease-in (quadratic)
        }
        const mass = -(gameSettings.bhGridMassBase + e.absorbedCount * gameSettings.bhGridMassPerAbsorb) * e.breathMassMultiplier * spawnFactor;
        const radius = BlackHole.ATTRACT_RADIUS * gameSettings.bhGridRadiusMultiplier * spawnFactor;
        this.grid.applyGravityWell(e.position.x, e.position.y, mass, radius);
      }
    }
  }

  /** Apply BlackHole gravitational attraction to nearby enemies + absorb on contact */
  private applyBlackHoleAttraction(dt: number): void {
    const blackholes: BlackHole[] = [];
    for (const e of this.enemies) {
      if (e.active && !e.isSpawning && e instanceof BlackHole) {
        blackholes.push(e);
      }
    }
    if (blackholes.length === 0) return;

    for (const bh of blackholes) {
      const attractR2 = BlackHole.ATTRACT_RADIUS * BlackHole.ATTRACT_RADIUS;
      const absorbR2 = (bh.collisionRadius + 10) * (bh.collisionRadius + 10);

      for (const e of this.enemies) {
        if (!e.active || e.isSpawning || e === bh || e instanceof BlackHole || e.gravityImmune) continue;

        const dx = bh.position.x - e.position.x;
        const dy = bh.position.y - e.position.y;
        const dist2 = dx * dx + dy * dy;

        // Absorb enemies that get too close
        if (dist2 < absorbR2 && bh.absorbedCount < BlackHole.MAX_ABSORB) {
          e.active = false;
          bh.absorbEnemy();
          this.explosions.spawn(e.position.x, e.position.y, e.color, 15, 0.6);
          this.grid.applyImpulse(e.position.x, e.position.y, -20, 120);

          // Destabilize warning — play once per BH
          if (bh.destabilizing && !bh.overloaded && !this.supernovaWarningPlayed.has(bh)) {
            this.supernovaWarningPlayed.add(bh);
            this.audio.playSupernovaWarning();
            this.phaseBorderPulseTimer = PHASE_BORDER_PULSE_DURATION;
          }

          // Auto-explode on overload (after 1.5s destabilize)
          if (bh.overloaded) {
            bh.active = false;
            const absorbed = bh.absorbedCount;
            // Spawn circles — 2x count, random angles, elastic flock snap-back
            const circleCount = absorbed * CIRCLE_SUPERNOVA_SPAWN_MULTIPLIER;
            const flockCenter = new Vec2(bh.position.x, bh.position.y);
            const flockGroup: CircleEnemy[] = [];
            for (let ci = 0; ci < circleCount; ci++) {
              const angle = Math.random() * Math.PI * 2;
              const dist = 60 + Math.random() * 90;
              const cPos = new Vec2(
                bh.position.x + Math.cos(angle) * dist,
                bh.position.y + Math.sin(angle) * dist,
              );
              const ce = createEnemy('circle', cPos) as CircleEnemy;
              const ejectSpeed = CIRCLE_EJECT_SPEED_MIN + Math.random() * (CIRCLE_EJECT_SPEED_MAX - CIRCLE_EJECT_SPEED_MIN);
              ce.ejectVel.set(Math.cos(angle) * ejectSpeed, Math.sin(angle) * ejectSpeed);
              ce.flockCenter = flockCenter;
              this.lifecycle.spawnEnemy(ce);
              this.enemies.push(ce);
              flockGroup.push(ce);
            }
            this.circleFlocks.push({ center: flockCenter, members: flockGroup });
            // Layer 1: Primary supernova explosion (massive)
            this.explosions.spawn(
              bh.position.x, bh.position.y, bh.color,
              this.mobile ? 150 : SUPERNOVA_PARTICLE_COUNT,
              EXPLOSION_DURATION_LARGE,
            );
            // Layer 2: White flash particles
            this.explosions.spawn(
              bh.position.x, bh.position.y, [1, 1, 1],
              this.mobile ? 60 : Math.floor(SUPERNOVA_PARTICLE_COUNT * 0.4),
              EXPLOSION_DURATION_LARGE * 0.6,
            );
            // Layer 3: Orange embers (long duration)
            this.explosions.spawn(
              bh.position.x, bh.position.y, [1, 0.5, 0.1],
              this.mobile ? 40 : Math.floor(SUPERNOVA_PARTICLE_COUNT * 0.3),
              EXPLOSION_DURATION_LARGE * 1.5,
              0.3,
            );
            this.grid.applyImpulse(bh.position.x, bh.position.y, SUPERNOVA_GRID_IMPULSE, 600);
            this.camera.shake(SCREEN_SHAKE_DEATH);
            this.audio.playBlackHoleDeath(absorbed);
            this.player.score += bh.scoreValue;
            this.player.enemiesKilled++;
            this.haptics.supernova();
            this.hitstopTimer = Math.max(this.hitstopTimer, SUPERNOVA_HITSTOP);
            this.supernovaFlashTimer = SUPERNOVA_FLASH_DURATION;
            this.supernovaWarningPlayed.delete(bh);
          }
          continue;
        }

        // Attract within radius
        if (dist2 < attractR2 && dist2 > 1) {
          const dist = Math.sqrt(dist2);
          const force = BlackHole.GRAVITY_STRENGTH * dt / dist;
          e.position.x += dx / dist * force;
          e.position.y += dy / dist * force;
        }
      }

      // Bullet gravity bending — curve trajectories near BlackHoles
      for (const b of this.bullets.bullets) {
        if (!b.active) continue;
        const bdx = bh.position.x - b.position.x;
        const bdy = bh.position.y - b.position.y;
        const bdist2 = bdx * bdx + bdy * bdy;
        if (bdist2 >= attractR2 || bdist2 < 1) continue;
        const bdist = Math.sqrt(bdist2);
        const force = BULLET_GRAVITY_STRENGTH * dt / bdist;
        b.velocity.x += bdx / bdist * force;
        b.velocity.y += bdy / bdist * force;
        b.angle = Math.atan2(b.velocity.y, b.velocity.x);
      }
    }
  }

  /** Pull player toward active BlackHoles */
  private applyBlackHolePlayerPull(dt: number): void {
    const hw = gameSettings.arenaWidth / 2;
    const hh = gameSettings.arenaHeight / 2;
    for (const e of this.enemies) {
      if (!e.active || e.isSpawning || !(e instanceof BlackHole)) continue;
      const dx = e.position.x - this.player.position.x;
      const dy = e.position.y - this.player.position.y;
      const dist2 = dx * dx + dy * dy;
      const attractR = BlackHole.ATTRACT_RADIUS;
      if (dist2 < attractR * attractR && dist2 > 1) {
        const dist = Math.sqrt(dist2);
        const force = gameSettings.bhPlayerPull * (1 + e.absorbedCount * 0.08) * dt / dist;
        this.player.position.x += dx / dist * force;
        this.player.position.y += dy / dist * force;
      }
    }
    // Re-clamp player to world bounds
    if (this.player.position.x < -hw) this.player.position.x = -hw;
    if (this.player.position.x > hw) this.player.position.x = hw;
    if (this.player.position.y < -hh) this.player.position.y = -hh;
    if (this.player.position.y > hh) this.player.position.y = hh;
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
    this.updateGravityWells();

    // Redraw HUD with animation progress
    this.hud.drawGameOver(this.runStats, this.gameOverMedals, this.gameOverTime);
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
      this.updateGravityWells();
      this.grid.update(dt);
      this.audio.setMusicIntensity(this.computeIntensity());
      return;
    }

    this.gameTime += dt / 1000;

    // Player
    this.player.update(dt);
    this.applyBlackHolePlayerPull(dt);

    // Shooting
    const shots = this.player.tryShoot();
    if (shots) {
      for (const angle of shots) {
        const b = this.bullets.spawn(this.player.position.x, this.player.position.y, angle);
        if (b) {
          this.lifecycle.spawnBullet(b);
        }
      }
    }

    // Bullets
    this.bullets.update(dt);

    // Update bullet trails + clean up inactive
    this.lifecycle.updateBulletTrails(this.bullets);

    // BlackHole attraction — pull nearby non-blackhole enemies toward black holes
    this.applyBlackHoleAttraction(dt);

    // Update circle flock centroids (shared Vec2 refs held by each CircleEnemy)
    for (let fi = this.circleFlocks.length - 1; fi >= 0; fi--) {
      const flock = this.circleFlocks[fi];
      const active = flock.members.filter(m => m.active);
      if (active.length === 0) { this.circleFlocks.splice(fi, 1); continue; }
      flock.members = active;
      let cx = 0, cy = 0;
      for (const m of active) { cx += m.position.x; cy += m.position.y; }
      flock.center.set(cx / active.length, cy / active.length);
    }

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
    this.updateGravityWells();

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
    this.updateSierpinskiBoss(dt);
    this.updateMiniboss(dt);

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

  /** Sierpinski boss encounter state machine */
  private updateSierpinskiBoss(dt: number): void {
    // Defeated banner timer
    if (this.sierpinskiBossDefeatedBannerTimer > 0) {
      this.sierpinskiBossDefeatedBannerTimer -= dt;
    }

    // Re-spawn timer (player died during boss fight)
    if (this.sierpinskiBossRespawnTimer > 0) {
      this.sierpinskiBossRespawnTimer -= dt;
      if (this.sierpinskiBossRespawnTimer <= 0) {
        this.startSierpinskiBossWarning();
      }
    }

    // Check if it's time to trigger the boss
    if (!this.sierpinskiBossDefeated && !this.sierpinskiBossActive
        && this.sierpinskiBossWarningTimer <= 0
        && this.sierpinskiBossRespawnTimer <= 0
        && this.waveManager.elapsedTime >= SIERPINSKI_BOSS_SPAWN_TIME) {
      this.startSierpinskiBossWarning();
    }

    // Warning countdown
    if (this.sierpinskiBossWarningTimer > 0) {
      this.sierpinskiBossWarningTimer -= dt;
      if (this.sierpinskiBossWarningTimer <= 0) {
        this.spawnSierpinskiBoss();
      }
      return;
    }

    // Boss died outside of normal kill flow (e.g., player death shockwave)
    if (this.sierpinskiBossActive && this.sierpinskiBossRef && !this.sierpinskiBossRef.active) {
      if (!this.sierpinskiBossDefeated) {
        this.sierpinskiBossActive = false;
        this.sierpinskiBossRef = null;
        this.waveManager.spawnRateMultiplier = this.savedSpawnRateMultiplier;
        this.sierpinskiBossRespawnTimer = SIERPINSKI_BOSS_RESPAWN_DELAY;
      }
    }
  }

  private startSierpinskiBossWarning(): void {
    this.sierpinskiBossWarningTimer = SIERPINSKI_BOSS_WARNING_DURATION;
    this.audio.playMinibossWarning();
    this.phaseBorderPulseTimer = SIERPINSKI_BOSS_WARNING_DURATION;
  }

  private spawnSierpinskiBoss(): void {
    this.sierpinskiBossActive = true;
    const hw = gameSettings.arenaWidth / 2;
    const hh = gameSettings.arenaHeight / 2;
    const px = this.player.position.x;
    const py = this.player.position.y;
    // Spawn on the far side from the player
    const spawnX = px > 0 ? -hw * 0.4 : hw * 0.4;
    const spawnY = py > 0 ? -hh * 0.4 : hh * 0.4;

    const boss = createEnemy('sierpinski', new Vec2(spawnX, spawnY)) as Sierpinski;
    this.lifecycle.spawnEnemy(boss);
    this.enemies.push(boss);
    this.sierpinskiBossRef = boss;

    // Suppress normal spawning during fight
    this.savedSpawnRateMultiplier = this.waveManager.spawnRateMultiplier;
    this.waveManager.spawnRateMultiplier = SIERPINSKI_BOSS_SPAWN_SUPPRESS_MULT;

    this.audio.playMinibossArrive();
    this.grid.applyImpulse(spawnX, spawnY, 600, 300);
    this.camera.shake(SCREEN_SHAKE_LARGE);
  }

  private onSierpinskiBossDefeated(): void {
    this.sierpinskiBossActive = false;
    this.sierpinskiBossDefeated = true;
    this.sierpinskiBossDefeatedBannerTimer = SIERPINSKI_BOSS_DEFEATED_BANNER_DURATION;
    this.sierpinskiBossRef = null;
    // Restore spawn rate
    this.waveManager.spawnRateMultiplier = this.savedSpawnRateMultiplier;
  }

  /** Miniboss encounter state machine */
  private updateMiniboss(dt: number): void {
    // Defeated banner timer
    if (this.minibossDefeatedBannerTimer > 0) {
      this.minibossDefeatedBannerTimer -= dt;
    }

    // Re-spawn timer (player died during boss fight)
    if (this.minibossRespawnTimer > 0) {
      this.minibossRespawnTimer -= dt;
      if (this.minibossRespawnTimer <= 0) {
        this.startMinibossWarning();
      }
    }

    // Check if it's time to trigger the miniboss
    if (!this.minibossDefeated && !this.minibossActive && this.minibossWarningTimer <= 0
        && this.minibossRespawnTimer <= 0
        && this.waveManager.elapsedTime >= MINIBOSS_SPAWN_TIME) {
      this.startMinibossWarning();
    }

    // Warning countdown
    if (this.minibossWarningTimer > 0) {
      this.minibossWarningTimer -= dt;
      if (this.minibossWarningTimer <= 0) {
        this.spawnMiniboss();
      }
      return;
    }

    // Active miniboss: process minion spawns + stage transitions
    if (this.minibossActive && this.minibossRef && this.minibossRef.active) {
      // Process pending minion spawns from the Mandelbrot
      while (this.minibossRef.pendingMinions.length > 0) {
        const minionPos = this.minibossRef.pendingMinions.shift()!;
        const mm = new MiniMandel(minionPos);
        mm.parent = this.minibossRef;
        mm.speed *= gameSettings.enemySpeedMultiplier;
        this.lifecycle.spawnEnemy(mm);
        this.enemies.push(mm);
        this.grid.applyImpulse(minionPos.x, minionPos.y, 60, 80);
      }

      // Check for stage transitions
      if (this.minibossRef.checkStageTransition()) {
        this.audio.playMinibossStageBreak();
        this.hitstopTimer = Math.max(this.hitstopTimer, MINIBOSS_HITSTOP_STAGE);
        this.camera.shake(SCREEN_SHAKE_LARGE);
        this.grid.applyImpulse(
          this.minibossRef.position.x, this.minibossRef.position.y, 600, 300,
        );
      }
    }

    // Miniboss died outside of normal kill flow (e.g., player death shockwave)
    if (this.minibossActive && this.minibossRef && !this.minibossRef.active) {
      // Boss was destroyed by shockwave — allow re-spawn
      if (!this.minibossDefeated) {
        this.minibossActive = false;
        this.minibossRef = null;
        // Restore spawn rate
        this.waveManager.spawnRateMultiplier = this.savedSpawnRateMultiplier;
        this.minibossRespawnTimer = MINIBOSS_RESPAWN_DELAY;
      }
    }
  }

  private startMinibossWarning(): void {
    this.minibossWarningTimer = MINIBOSS_WARNING_DURATION;
    this.audio.playMinibossWarning();
    // Red border pulse for warning
    this.phaseBorderPulseTimer = MINIBOSS_WARNING_DURATION;
  }

  private spawnMiniboss(): void {
    this.minibossActive = true;
    // Find a spawn position away from the player
    const hw = gameSettings.arenaWidth / 2;
    const hh = gameSettings.arenaHeight / 2;
    const px = this.player.position.x;
    const py = this.player.position.y;
    // Spawn on the far side of the arena from the player
    const spawnX = px > 0 ? -hw * 0.4 : hw * 0.4;
    const spawnY = py > 0 ? -hh * 0.4 : hh * 0.4;

    const boss = createEnemy('mandelbrot', new Vec2(spawnX, spawnY)) as Mandelbrot;
    this.lifecycle.spawnEnemy(boss);
    this.enemies.push(boss);
    this.minibossRef = boss;

    // Suppress normal spawning during fight
    this.savedSpawnRateMultiplier = this.waveManager.spawnRateMultiplier;
    this.waveManager.spawnRateMultiplier = MINIBOSS_SPAWN_SUPPRESS_MULT;

    this.audio.playMinibossArrive();
    this.grid.applyImpulse(spawnX, spawnY, 800, 400);
    this.camera.shake(SCREEN_SHAKE_LARGE);
  }

  private onMinibossDefeated(): void {
    this.minibossActive = false;
    this.minibossDefeated = true;
    this.minibossDefeatedBannerTimer = MINIBOSS_DEFEATED_BANNER_DURATION;
    this.minibossRef = null;
    // Restore spawn rate
    this.waveManager.spawnRateMultiplier = this.savedSpawnRateMultiplier;
  }

  /** Per-frame pairwise separation: push overlapping enemies apart (Grid Wars style) */
  private separateEnemies(): void {
    const hw = gameSettings.arenaWidth / 2 - 10;
    const hh = gameSettings.arenaHeight / 2 - 10;
    const enemies = this.enemies;
    const len = enemies.length;

    // Build set of enemies currently being pulled by a BlackHole (skip separation for them)
    const inGravityWell = this.getEnemiesInGravityWell();

    for (let i = 0; i < len; i++) {
      const a = enemies[i];
      if (!a.active) continue;
      if (a.isSpawning && a.spawnTimer > a.spawnDuration * 0.3) continue;

      for (let j = i + 1; j < len; j++) {
        const b = enemies[j];
        if (!b.active) continue;
        if (b.isSpawning && b.spawnTimer > b.spawnDuration * 0.3) continue;

        // Don't fight gravity — if either enemy is being pulled into a BlackHole, skip
        if (inGravityWell.has(a) || inGravityWell.has(b)) continue;

        const dx = a.position.x - b.position.x;
        const dy = a.position.y - b.position.y;
        const distSq = dx * dx + dy * dy;
        const minDist = a.collisionRadius + b.collisionRadius + ENEMY_SEPARATION_BUFFER;

        if (distSq >= minDist * minDist) continue;

        const dist = Math.sqrt(distSq);
        let nx: number, ny: number;
        if (dist < 0.5) {
          // Near-zero distance — deterministic direction from indices so it's consistent across frames
          const angle = ((i * 7919 + j * 104729) % 6283) * 0.001;
          nx = Math.cos(angle);
          ny = Math.sin(angle);
        } else {
          nx = dx / dist;
          ny = dy / dist;
        }

        const overlap = minDist - dist;
        // Push harder when heavily overlapping (>50% of minDist) to resolve clusters faster
        const pushStrength = overlap > minDist * 0.5 ? overlap * 1.5 : overlap;

        // Weight: BlackHoles immovable (0), minibosses resist (0.25), others equal (1)
        const wA = (a instanceof BlackHole) ? 0 : a.isMiniboss ? 0.25 : 1;
        const wB = (b instanceof BlackHole) ? 0 : b.isMiniboss ? 0.25 : 1;
        const totalW = wA + wB;
        if (totalW < 0.001) continue; // both immovable

        const pushA = pushStrength * (wA / totalW);
        const pushB = pushStrength * (wB / totalW);

        // Push A along +normal, B along -normal
        a.position.x = Math.max(-hw, Math.min(hw, a.position.x + nx * pushA));
        a.position.y = Math.max(-hh, Math.min(hh, a.position.y + ny * pushA));
        b.position.x = Math.max(-hw, Math.min(hw, b.position.x - nx * pushB));
        b.position.y = Math.max(-hh, Math.min(hh, b.position.y - ny * pushB));

        // Bouncers (Pinwheel): deflect velocity off collision normal
        const aIsBouncer = a instanceof Pinwheel;
        const bIsBouncer = b instanceof Pinwheel;
        if (aIsBouncer || bIsBouncer) {
          if (aIsBouncer) {
            // Reflect A's velocity off normal (n points from B→A)
            const dot = a.velocity.x * nx + a.velocity.y * ny;
            if (dot < 0) { // only if moving toward B
              a.velocity.x -= 2 * dot * nx;
              a.velocity.y -= 2 * dot * ny;
            }
          }
          if (bIsBouncer) {
            // Reflect B's velocity off -normal (points from A→B)
            const dot = b.velocity.x * (-nx) + b.velocity.y * (-ny);
            if (dot < 0) { // only if moving toward A
              b.velocity.x -= 2 * dot * (-nx);
              b.velocity.y -= 2 * dot * (-ny);
            }
          }
        }
      }
    }
  }

  /** Return the set of non-BlackHole enemies currently within a BlackHole's attract radius */
  private getEnemiesInGravityWell(): Set<Enemy> {
    const result = new Set<Enemy>();
    const attractR2 = BlackHole.ATTRACT_RADIUS * BlackHole.ATTRACT_RADIUS;
    for (const e of this.enemies) {
      if (!e.active || e.isSpawning || !(e instanceof BlackHole)) continue;
      for (const other of this.enemies) {
        if (!other.active || other.isSpawning || other === e || other instanceof BlackHole || other.gravityImmune) continue;
        const dx = e.position.x - other.position.x;
        const dy = e.position.y - other.position.y;
        if (dx * dx + dy * dy < attractR2) {
          result.add(other);
        }
      }
    }
    return result;
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
        this.audio.playGameOver();
        this.hud.drawGameOver(this.runStats, this.gameOverMedals, 0);
        if (!this.mobile) showDesktopSettings();
      } else {
        // Respawn and continue playing with recovery buff
        this.state = 'playing';
        this.lifecycle.clear();
        this.enemies.length = 0;
        this.combat.clearPendingSpawns();
        this.circleFlocks = [];
        this.player.respawn();
        this.player.active = true;
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

      // Sierpinski boss warning banner
      if (this.sierpinskiBossWarningTimer > 0) {
        const progress = 1 - this.sierpinskiBossWarningTimer / SIERPINSKI_BOSS_WARNING_DURATION;
        this.hud.drawMinibossWarning(progress);
      }

      // Sierpinski boss HP bar
      if (this.sierpinskiBossActive && this.sierpinskiBossRef && this.sierpinskiBossRef.active) {
        this.hud.drawMinibossHP('SIERPINSKI', this.sierpinskiBossRef.hp, this.sierpinskiBossRef.maxHp, 1);
      }

      // Sierpinski boss defeated banner
      if (this.sierpinskiBossDefeatedBannerTimer > 0) {
        const progress = 1 - this.sierpinskiBossDefeatedBannerTimer / SIERPINSKI_BOSS_DEFEATED_BANNER_DURATION;
        this.hud.drawMinibossDefeatedBanner(progress);
      }

      // Miniboss warning banner
      if (this.minibossWarningTimer > 0) {
        const progress = 1 - this.minibossWarningTimer / MINIBOSS_WARNING_DURATION;
        this.hud.drawMinibossWarning(progress);
      }

      // Miniboss HP bar
      if (this.minibossActive && this.minibossRef && this.minibossRef.active) {
        this.hud.drawMinibossHP('MANDELBROT', this.minibossRef.hp, this.minibossRef.maxHp, this.minibossRef.stage);
      }

      // Miniboss defeated banner
      if (this.minibossDefeatedBannerTimer > 0) {
        const progress = 1 - this.minibossDefeatedBannerTimer / MINIBOSS_DEFEATED_BANNER_DURATION;
        this.hud.drawMinibossDefeatedBanner(progress);
      }

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
