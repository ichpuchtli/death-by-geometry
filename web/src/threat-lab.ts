import { Renderer } from './renderer/sprite-batch';
import { BloomPass } from './renderer/bloom';
import { SpringMassGrid } from './renderer/grid';
import { TrailSystem } from './renderer/trails';
import { Starfield } from './renderer/starfield';
import { Camera } from './core/camera';
import { Input } from './core/input';
import { AudioManager, SupernovaSoundVariant } from './core/audio';
import { Player } from './entities/player';
import { BulletPool } from './entities/bullet';
import { AimIndicator } from './entities/crosshair';
import { ExplosionPool } from './entities/explosion';
import { Enemy } from './entities/enemies/enemy';
import { BlackHole } from './entities/enemies/blackhole';
import { CircleEnemy } from './entities/enemies/circle';
import { Rhombus } from './entities/enemies/rhombus';
import { Shard } from './entities/enemies/shard';
import { Vec2 } from './core/vector';
import { gameSettings } from './settings';
import {
  TRAIL_LENGTH_ENEMY,
  BULLET_GRAVITY_STRENGTH,
  BLACKHOLE_PALETTE,
  CIRCLE_EJECT_SPEED_MIN,
  CIRCLE_EJECT_SPEED_MAX,
  SUPERNOVA_PARTICLE_COUNT,
  SUPERNOVA_GRID_IMPULSE,
  EXPLOSION_DURATION_LARGE,
  PLAYER_COLLISION_RADIUS,
} from './config';

/**
 * A full BlackHole threat tuning: how hard it pulls, how hard it dies,
 * how little warning it gives, and how violently it detonates.
 */
export interface ThreatPreset {
  name: string;
  tagline: string;
  hp: number;
  /** Absorbed enemies needed to trigger destabilize → supernova */
  maxAbsorb: number;
  attractRadius: number;
  /** Gravity on enemies: force px/ms = enemyPull / dist. Rhombus tracking speed is 0.15 px/ms,
   *  so the capture radius (where gravity beats tracking) ≈ enemyPull / 0.15 px. */
  enemyPull: number;
  /** Extra pull multiplier inside the inner 40% of the attract radius — the inescapable core */
  corePullMult: number;
  playerPull: number;
  bulletBendMult: number;
  /** Warning window (ms) between destabilize and detonation */
  destabilizeMs: number;
  /** Circles emitted per absorbed enemy */
  circlesPerMass: number;
  /** Fixed extra shards emitted on detonation */
  shardCount: number;
  particleMult: number;
  shockwaveRings: number;
  flashMs: number;
  shakeIntensity: number;
  sound: SupernovaSoundVariant;
}

export const THREAT_PRESETS: ThreatPreset[] = [
  {
    name: '1 · CURRENT', tagline: 'production baseline',
    hp: 8, maxAbsorb: 12, attractRadius: 400,
    enemyPull: 3, corePullMult: 1, playerPull: 4, bulletBendMult: 1,
    destabilizeMs: 1500, circlesPerMass: 2, shardCount: 0,
    particleMult: 1, shockwaveRings: 0, flashMs: 200, shakeIntensity: 0.8,
    sound: 'classic',
  },
  {
    name: '2 · DREADNOUGHT', tagline: 'tank — soaks bullets, drags you in, short fuse',
    hp: 20, maxAbsorb: 10, attractRadius: 500,
    enemyPull: 14, corePullMult: 2.5, playerPull: 7, bulletBendMult: 2,
    destabilizeMs: 700, circlesPerMass: 3, shardCount: 4,
    particleMult: 1.6, shockwaveRings: 1, flashMs: 300, shakeIntensity: 1.2,
    sound: 'subdrop',
  },
  {
    name: '3 · CATACLYSM', tagline: 'chaos bomb — almost no warning, screen-filling payload',
    hp: 14, maxAbsorb: 8, attractRadius: 450,
    enemyPull: 10, corePullMult: 2, playerPull: 6, bulletBendMult: 2,
    destabilizeMs: 350, circlesPerMass: 3, shardCount: 8,
    particleMult: 2.5, shockwaveRings: 3, flashMs: 450, shakeIntensity: 1.6,
    sound: 'doom',
  },
  {
    name: '4 · SINGULARITY', tagline: 'gravity monster — rhombuses spiral in from across the arena',
    hp: 12, maxAbsorb: 12, attractRadius: 700,
    enemyPull: 24, corePullMult: 3, playerPull: 9, bulletBendMult: 3,
    destabilizeMs: 1000, circlesPerMass: 2, shardCount: 4,
    particleMult: 1.5, shockwaveRings: 2, flashMs: 300, shakeIntensity: 1.3,
    sound: 'quake',
  },
];

const SOUND_VARIANTS: SupernovaSoundVariant[] = ['classic', 'subdrop', 'doom', 'quake'];
const RHOMBUS_SPAWN_INTERVAL = 900; // ms
const MAX_RHOMBUSES = 26;
const BH_RESPAWN_DELAY = 2500; // ms

interface ShockRing {
  delay: number;   // ms until this ring starts expanding
  r: number;
  maxR: number;
  speed: number;   // px/ms
  x: number;
  y: number;
}

/**
 * Threat Lab (`?threat=1`) — a playable mini-arena for A/B testing BlackHole
 * threat presets: gravity strength, HP, warning window, detonation payload,
 * and supernova sound variants. Fly the real ship, get chased by rhombuses,
 * feed the hole, feel the boom. Keys: 1-4 preset, A sound override, E feed,
 * Q detonate now, R reset.
 */
export class ThreatLab {
  private renderer: Renderer;
  private bloom: BloomPass;
  private grid: SpringMassGrid;
  private trails: TrailSystem;
  private starfield: Starfield;
  private camera: Camera;
  private input: Input;
  private audio: AudioManager;
  private player: Player;
  private bullets: BulletPool;
  private crosshair: AimIndicator;
  private explosions: ExplosionPool;

  presets = THREAT_PRESETS;
  presetIdx = 0;
  /** When set, overrides the preset's detonation sound (A key cycles) */
  soundOverride: SupernovaSoundVariant | null = null;

  enemies: Enemy[] = [];
  bh: BlackHole | null = null;
  detonationCount = 0;

  private rhombusTimer = 500;
  private bhRespawnTimer = 0;
  private shockRings: ShockRing[] = [];
  private flashTimer = 0;
  private flashDuration = 1;
  private warningPlayed = false;
  private totalTime = 0;
  private overlay: HTMLDivElement;
  private statusLine: HTMLDivElement;

  get preset(): ThreatPreset { return this.presets[this.presetIdx]; }

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    const gl = this.renderer.getGL();
    this.bloom = new BloomPass(gl);
    this.bloom.resize(this.renderer.canvasWidth, this.renderer.canvasHeight);
    this.grid = new SpringMassGrid(gl, false);
    this.grid.rebuild(gameSettings.arenaWidth, gameSettings.arenaHeight, gameSettings.gridSpacing);
    this.trails = new TrailSystem();
    this.starfield = new Starfield(100, gameSettings.arenaWidth, gameSettings.arenaHeight);
    this.camera = new Camera(this.renderer.width, this.renderer.height);
    this.input = new Input(canvas);
    this.input.setCamera(this.camera);
    this.input.setZoom(this.renderer.zoom);
    this.audio = new AudioManager();
    this.player = new Player(this.input);
    this.bullets = new BulletPool();
    this.crosshair = new AimIndicator();
    this.explosions = new ExplosionPool();

    this.overlay = document.createElement('div');
    this.overlay.id = 'threat-lab-overlay';
    this.overlay.style.cssText =
      'position:fixed;top:10px;left:12px;z-index:20;pointer-events:none;' +
      'font-family:monospace;color:#9fe8ff;text-shadow:0 0 6px rgba(0,200,255,0.6);font-size:12px;line-height:1.5;';
    this.statusLine = document.createElement('div');
    this.statusLine.style.cssText = 'margin-top:4px;color:#ffd27f;';
    document.body.appendChild(this.overlay);

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('keydown', (e) => this.onKeyDown(e.code));
    // Audio requires a user gesture
    const initAudio = (): void => {
      if (!this.audio.initialized) this.audio.init().catch(() => {});
    };
    canvas.addEventListener('pointerdown', initAudio);
    window.addEventListener('keydown', initAudio);

    this.applyPreset(0);
  }

  applyPreset(idx: number): void {
    this.presetIdx = idx;
    // Clear arena
    for (const e of this.enemies) {
      if (e.trailId >= 0) this.trails.unregister(e.trailId);
    }
    this.enemies = [];
    this.trails.clear();
    this.bullets.clear();
    this.explosions.clear();
    this.shockRings = [];
    this.bhRespawnTimer = 0;
    this.flashTimer = 0;
    this.rhombusTimer = 500;
    this.warningPlayed = false;

    this.player.reset();
    this.player.position.set(-gameSettings.arenaWidth * 0.3, 0);
    this.camera.snapTo(this.player.position);

    this.spawnBlackHole();
    this.rebuildOverlay();
  }

  private spawnBlackHole(): void {
    const p = this.preset;
    const bh = new BlackHole();
    bh.position.set(0, 0);
    bh.active = true;
    bh.spawnTimer = 0;
    bh.hp = p.hp;
    bh.maxHp = p.hp;
    bh.destabilizeDuration = p.destabilizeMs;
    bh.trailId = this.trails.register(bh.color, TRAIL_LENGTH_ENEMY);
    this.enemies.push(bh);
    this.bh = bh;
    this.warningPlayed = false;
    this.grid.applyImpulse(0, 0, -800, 350);
  }

  /** E key / test hook: instantly feed the hole to its destabilize threshold */
  forceFeed(): void {
    const bh = this.bh;
    if (!bh || !bh.active || bh.destabilizing) return;
    const p = this.preset;
    while (bh.absorbedCount < p.maxAbsorb) bh.absorbEnemy();
    this.startDestabilize(bh);
  }

  /** Q key / test hook: skip the warning and detonate right now */
  forceDetonate(): void {
    const bh = this.bh;
    if (!bh || !bh.active) return;
    const p = this.preset;
    while (bh.absorbedCount < p.maxAbsorb) bh.absorbEnemy();
    this.detonate(bh);
  }

  private startDestabilize(bh: BlackHole): void {
    if (!bh.destabilizing) {
      bh.destabilizing = true;
      bh.destabilizeTimer = 0;
    }
    if (!this.warningPlayed) {
      this.warningPlayed = true;
      this.audio.playSupernovaWarning(this.preset.destabilizeMs);
    }
  }

  private onKeyDown(code: string): void {
    switch (code) {
      case 'Digit1': this.applyPreset(0); break;
      case 'Digit2': this.applyPreset(1); break;
      case 'Digit3': this.applyPreset(2); break;
      case 'Digit4': this.applyPreset(3); break;
      case 'KeyE': this.forceFeed(); break;
      case 'KeyQ': this.forceDetonate(); break;
      case 'KeyR': this.applyPreset(this.presetIdx); break;
      case 'KeyA': {
        const cur = this.soundOverride === null ? -1 : SOUND_VARIANTS.indexOf(this.soundOverride);
        const next = cur + 1;
        this.soundOverride = next >= SOUND_VARIANTS.length ? null : SOUND_VARIANTS[next];
        this.rebuildOverlay();
        break;
      }
    }
  }

  private onResize(): void {
    this.renderer.resize();
    this.bloom.resize(this.renderer.canvasWidth, this.renderer.canvasHeight);
    this.camera.viewportWidth = this.renderer.width;
    this.camera.viewportHeight = this.renderer.height;
    this.input.updateCanvasSize((this.renderer as unknown as { canvas: HTMLCanvasElement }).canvas?.clientWidth ?? window.innerWidth);
    this.input.setZoom(this.renderer.zoom);
  }

  // ============================================================
  // Update
  // ============================================================
  update(dt: number): void {
    this.totalTime += dt / 1000;
    const p = this.preset;

    // Player + shooting (real ship, real weapon feedback)
    this.player.update(dt);
    this.applyPlayerPull(dt);
    const shots = this.player.tryShoot();
    if (shots) {
      for (const angle of shots) {
        this.bullets.spawn(this.player.position.x, this.player.position.y, angle);
      }
      this.audio.playShoot(shots.length);
      this.player.kickRecoil(shots.length);
    }
    this.bullets.update(dt);

    // Rhombus pressure: constant trickle from arena edges, tracking the player
    this.rhombusTimer -= dt;
    if (this.rhombusTimer <= 0) {
      this.rhombusTimer = RHOMBUS_SPAWN_INTERVAL;
      const rhombusCount = this.enemies.filter(e => e.active && e instanceof Rhombus).length;
      if (rhombusCount < MAX_RHOMBUSES) this.spawnRhombus();
    }

    // BH respawn after detonation/kill
    if (this.bhRespawnTimer > 0) {
      this.bhRespawnTimer -= dt;
      if (this.bhRespawnTimer <= 0) this.spawnBlackHole();
    }

    // Enemy AI
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (e.isSpawning) {
        e.spawnTimer = Math.max(0, e.spawnTimer - dt / 1000);
        continue;
      }
      if (e instanceof BlackHole) {
        e.update(dt);
        if (e.needsGridPulse) {
          this.grid.applyImpulse(e.position.x, e.position.y, e.gridPulseStrength, 150);
          e.needsGridPulse = false;
        }
      } else {
        (e as { update(dt: number, playerPos?: Vec2): void }).update(dt, this.player.position);
      }
      if (e.trailId >= 0) this.trails.update(e.trailId, e.position.x, e.position.y);
    }

    this.applyGravity(dt);
    this.handleBulletHits();
    this.handlePlayerContact();

    // Detonation trigger
    const bh = this.bh;
    if (bh && bh.active && bh.overloaded) this.detonate(bh);

    // Shockwave rings
    for (let i = this.shockRings.length - 1; i >= 0; i--) {
      const ring = this.shockRings[i];
      if (ring.delay > 0) { ring.delay -= dt; continue; }
      ring.r += ring.speed * dt;
      if (ring.r >= ring.maxR) this.shockRings.splice(i, 1);
    }
    if (this.flashTimer > 0) this.flashTimer -= dt;

    // Grid gravity well
    if (bh && bh.active && !bh.isSpawning) {
      const mass = -(gameSettings.bhGridMassBase + bh.absorbedCount * gameSettings.bhGridMassPerAbsorb) * bh.breathMassMultiplier;
      this.grid.applyGravityWell(bh.position.x, bh.position.y, mass, p.attractRadius * gameSettings.bhGridRadiusMultiplier);
    }

    this.explosions.update(dt);
    this.grid.update(dt);
    this.camera.follow(this.player.position);
    this.camera.updateShake(dt);

    // Cleanup
    this.enemies = this.enemies.filter(e => {
      if (!e.active && e.trailId >= 0) this.trails.unregister(e.trailId);
      return e.active;
    });

    this.updateStatusLine();
  }

  private spawnRhombus(): void {
    const hw = gameSettings.arenaWidth / 2;
    const hh = gameSettings.arenaHeight / 2;
    const side = Math.floor(Math.random() * 4);
    const pos = new Vec2(
      side === 0 ? -hw + 20 : side === 1 ? hw - 20 : (Math.random() * 2 - 1) * hw,
      side === 2 ? -hh + 20 : side === 3 ? hh - 20 : (Math.random() * 2 - 1) * hh,
    );
    const e = new Rhombus();
    e.position.copyFrom(pos);
    e.active = true;
    e.spawnTimer = 0.5;
    e.spawnDuration = 0.5;
    e.trailId = this.trails.register(e.color, TRAIL_LENGTH_ENEMY);
    this.enemies.push(e);
  }

  /** Preset-parameterized gravity: enemy pull (with inescapable core), absorption, bullet bending */
  private applyGravity(dt: number): void {
    const bh = this.bh;
    if (!bh || !bh.active || bh.isSpawning) return;
    const p = this.preset;
    const attractR2 = p.attractRadius * p.attractRadius;
    const coreR = p.attractRadius * 0.4;
    const absorbR2 = (bh.collisionRadius + 10) * (bh.collisionRadius + 10);

    for (const e of this.enemies) {
      if (!e.active || e.isSpawning || e === bh || e instanceof BlackHole || e.gravityImmune) continue;
      const dx = bh.position.x - e.position.x;
      const dy = bh.position.y - e.position.y;
      const dist2 = dx * dx + dy * dy;

      if (dist2 < absorbR2) {
        e.active = false;
        bh.absorbEnemy();
        this.explosions.spawn(e.position.x, e.position.y, e.color, 15, 0.6);
        this.grid.applyImpulse(e.position.x, e.position.y, -20, 120);
        if (bh.absorbedCount >= p.maxAbsorb) this.startDestabilize(bh);
        continue;
      }

      if (dist2 < attractR2 && dist2 > 1) {
        const dist = Math.sqrt(dist2);
        const pull = dist < coreR ? p.enemyPull * p.corePullMult : p.enemyPull;
        const force = pull * dt / dist;
        e.position.x += dx / dist * force;
        e.position.y += dy / dist * force;
      }
    }

    // Bullet gravity bending
    for (const b of this.bullets.bullets) {
      if (!b.active) continue;
      const bdx = bh.position.x - b.position.x;
      const bdy = bh.position.y - b.position.y;
      const bdist2 = bdx * bdx + bdy * bdy;
      if (bdist2 >= attractR2 || bdist2 < 1) continue;
      const bdist = Math.sqrt(bdist2);
      const force = BULLET_GRAVITY_STRENGTH * p.bulletBendMult * dt / bdist;
      b.velocity.x += bdx / bdist * force;
      b.velocity.y += bdy / bdist * force;
      b.angle = Math.atan2(b.velocity.y, b.velocity.x);
    }
  }

  private applyPlayerPull(dt: number): void {
    const bh = this.bh;
    if (!bh || !bh.active || bh.isSpawning) return;
    const p = this.preset;
    const dx = bh.position.x - this.player.position.x;
    const dy = bh.position.y - this.player.position.y;
    const dist2 = dx * dx + dy * dy;
    if (dist2 >= p.attractRadius * p.attractRadius || dist2 <= 1) return;
    const dist = Math.sqrt(dist2);
    const core = dist < p.attractRadius * 0.4 ? p.corePullMult : 1;
    const force = p.playerPull * core * (1 + bh.absorbedCount * 0.08) * dt / dist;
    this.player.position.x += dx / dist * force;
    this.player.position.y += dy / dist * force;
  }

  private handleBulletHits(): void {
    for (const b of this.bullets.bullets) {
      if (!b.active) continue;
      for (const e of this.enemies) {
        if (!e.active || e.isSpawning) continue;
        const dx = e.position.x - b.position.x;
        const dy = e.position.y - b.position.y;
        const hitR = e.collisionRadius + 8;
        if (dx * dx + dy * dy > hitR * hitR) continue;
        b.active = false;

        if (e instanceof BlackHole) {
          const result = e.onBulletHit(b.angle);
          if (result === 'absorb') {
            this.explosions.spawn(b.position.x, b.position.y, BLACKHOLE_PALETTE.swirlArm, 6, 0.3, 1.5);
          } else if (e.hit()) {
            // Killed by gunfire — modest bang, not a supernova
            e.active = false;
            this.explosions.spawn(e.position.x, e.position.y, e.color, 80, 1.2);
            this.explosions.spawn(e.position.x, e.position.y, [1, 1, 1], 30, 0.5);
            this.grid.applyImpulse(e.position.x, e.position.y, 800, 400);
            this.camera.shake(0.5);
            this.audio.playKillSignature('blackhole');
            this.bhRespawnTimer = BH_RESPAWN_DELAY;
          }
        } else if (e.hit()) {
          e.active = false;
          this.explosions.spawn(e.position.x, e.position.y, e.color, 12, 0.5);
        }
        break;
      }
    }
  }

  private handlePlayerContact(): void {
    // No lives in the lab — contact just destroys the enemy with a warning flash
    for (const e of this.enemies) {
      if (!e.active || e.isSpawning || e instanceof BlackHole) continue;
      const dx = e.position.x - this.player.position.x;
      const dy = e.position.y - this.player.position.y;
      const r = e.collisionRadius + PLAYER_COLLISION_RADIUS;
      if (dx * dx + dy * dy < r * r) {
        e.active = false;
        this.explosions.spawn(e.position.x, e.position.y, [1, 0.3, 0.2], 20, 0.6);
        this.camera.shake(0.4);
      }
    }
  }

  // ============================================================
  // Detonation — the preset's payload
  // ============================================================
  private detonate(bh: BlackHole): void {
    const p = this.preset;
    const px = bh.position.x;
    const py = bh.position.y;
    const absorbed = Math.max(bh.absorbedCount, p.maxAbsorb);
    bh.active = false;
    this.detonationCount++;

    // Ejecta: circles scale with absorbed mass, shards are the preset's fixed payload
    const circleCount = absorbed * p.circlesPerMass;
    const flockCenter = new Vec2(px, py);
    for (let i = 0; i < circleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 90;
      const ce = new CircleEnemy(new Vec2(px + Math.cos(angle) * dist, py + Math.sin(angle) * dist));
      const ejectSpeed = CIRCLE_EJECT_SPEED_MIN + Math.random() * (CIRCLE_EJECT_SPEED_MAX - CIRCLE_EJECT_SPEED_MIN);
      ce.ejectVel.set(Math.cos(angle) * ejectSpeed, Math.sin(angle) * ejectSpeed);
      ce.flockCenter = flockCenter;
      ce.active = true;
      ce.spawnTimer = 0.3;
      ce.spawnDuration = 0.3;
      ce.trailId = this.trails.register(ce.color, TRAIL_LENGTH_ENEMY);
      this.enemies.push(ce);
    }
    for (let i = 0; i < p.shardCount; i++) {
      const angle = (i / p.shardCount) * Math.PI * 2;
      const sh = new Shard(new Vec2(px + Math.cos(angle) * 50, py + Math.sin(angle) * 50));
      sh.active = true;
      sh.spawnTimer = 0.3;
      sh.spawnDuration = 0.3;
      sh.trailId = this.trails.register(sh.color, TRAIL_LENGTH_ENEMY);
      this.enemies.push(sh);
    }

    // Particles: production's 3 layers, scaled by the preset's chaos multiplier
    const n = Math.floor(SUPERNOVA_PARTICLE_COUNT * p.particleMult);
    this.explosions.spawn(px, py, bh.color, n, EXPLOSION_DURATION_LARGE);
    this.explosions.spawn(px, py, [1, 1, 1], Math.floor(n * 0.4), EXPLOSION_DURATION_LARGE * 0.6);
    this.explosions.spawn(px, py, [1, 0.5, 0.1], Math.floor(n * 0.3), EXPLOSION_DURATION_LARGE * 1.5, 0.3);

    // Shockwave rings — staggered expanding circles
    for (let i = 0; i < p.shockwaveRings; i++) {
      this.shockRings.push({
        delay: i * 120,
        r: bh.collisionRadius,
        maxR: p.attractRadius * 1.4,
        speed: 1.4 - i * 0.25,
        x: px, y: py,
      });
    }

    this.grid.applyImpulse(px, py, SUPERNOVA_GRID_IMPULSE * p.particleMult, 600 + p.shockwaveRings * 120);
    this.camera.shake(p.shakeIntensity, 0.45);
    this.flashDuration = p.flashMs;
    this.flashTimer = p.flashMs;
    this.audio.playSupernovaVariant(this.soundOverride ?? p.sound, absorbed);

    this.bhRespawnTimer = BH_RESPAWN_DELAY;
  }

  // ============================================================
  // Render
  // ============================================================
  render(): void {
    const cameraX = this.camera.renderX;
    const cameraY = this.camera.renderY;
    this.renderer.cameraX = cameraX;
    this.renderer.cameraY = cameraY;
    this.bloom.shakeIntensity = this.camera.shakeNormalized;
    this.bloom.time = this.totalTime;

    this.bloom.bindSceneFBO();

    this.grid.render(cameraX, cameraY, this.renderer.width, this.renderer.height);

    this.renderer.begin(false);
    this.starfield.render(this.renderer, cameraX, cameraY);
    this.renderer.end();

    this.renderer.begin(false);
    this.renderArenaBorder();
    for (const e of this.enemies) e.render(this.renderer);
    this.player.render(this.renderer);
    this.bullets.render(this.renderer);
    const mouse = this.input.getMouseWorldPos();
    this.crosshair.render(this.renderer, mouse.x, mouse.y, this.totalTime);

    // Attract-radius reference ring (faint) + core ring so gravity reach is visible
    const bh = this.bh;
    if (bh && bh.active && !bh.isSpawning) {
      const p = this.preset;
      this.renderer.drawCircle(bh.position.x, bh.position.y, p.attractRadius, [0.3, 0.5, 1], 64, 0.08);
      if (p.corePullMult > 1) {
        this.renderer.drawCircle(bh.position.x, bh.position.y, p.attractRadius * 0.4, [1, 0.4, 0.2], 48, 0.1);
      }
    }

    this.renderer.setBlendMode('additive');
    this.trails.render(this.renderer);
    this.explosions.render(this.renderer);
    // Shockwave rings — triple-line expanding circles
    for (const ring of this.shockRings) {
      if (ring.delay > 0) continue;
      const fade = 1 - ring.r / ring.maxR;
      this.renderer.drawCircle(ring.x, ring.y, ring.r, [1, 0.8, 0.5], 64, fade * 0.8);
      this.renderer.drawCircle(ring.x, ring.y, ring.r - 4, [1, 0.5, 0.2], 64, fade * 0.5);
      this.renderer.drawCircle(ring.x, ring.y, ring.r - 9, [1, 0.3, 0.1], 64, fade * 0.25);
    }
    // Screen flash — camera-sized quad
    if (this.flashTimer > 0) {
      const a = (this.flashTimer / this.flashDuration) * 0.55;
      const hw = this.renderer.width / 2 + 10;
      const hh = this.renderer.height / 2 + 10;
      this.renderer.drawTriangle(cameraX - hw, cameraY - hh, cameraX + hw, cameraY - hh, cameraX + hw, cameraY + hh, 1, 1, 1, a);
      this.renderer.drawTriangle(cameraX - hw, cameraY - hh, cameraX + hw, cameraY + hh, cameraX - hw, cameraY + hh, 1, 1, 1, a);
    }
    this.renderer.setBlendMode('normal');
    this.renderer.end();

    this.bloom.apply(this.renderer.canvasWidth, this.renderer.canvasHeight);
  }

  private renderArenaBorder(): void {
    const hw = gameSettings.arenaWidth / 2;
    const hh = gameSettings.arenaHeight / 2;
    this.renderer.drawLine(-hw, -hh, hw, -hh, 0, 0.4, 0.8, 0.6);
    this.renderer.drawLine(hw, -hh, hw, hh, 0, 0.4, 0.8, 0.6);
    this.renderer.drawLine(hw, hh, -hw, hh, 0, 0.4, 0.8, 0.6);
    this.renderer.drawLine(-hw, hh, -hw, -hh, 0, 0.4, 0.8, 0.6);
  }

  // ============================================================
  // Overlay
  // ============================================================
  private rebuildOverlay(): void {
    const p = this.preset;
    const captureR = Math.round(p.enemyPull * p.corePullMult / 0.15);
    const soundLabel = this.soundOverride ? `${this.soundOverride} (override)` : p.sound;
    this.overlay.innerHTML = '';
    const title = document.createElement('div');
    title.style.cssText = 'font-size:15px;font-weight:bold;color:#fff;';
    title.textContent = `THREAT LAB — ${p.name}`;
    const tag = document.createElement('div');
    tag.style.color = '#ffd27f';
    tag.textContent = p.tagline;
    const stats = document.createElement('div');
    stats.textContent =
      `HP ${p.hp} · feed ${p.maxAbsorb} · warn ${p.destabilizeMs}ms · pull ${p.enemyPull}×${p.corePullMult} ` +
      `(captures rhombus <${captureR}px) · payload ${p.maxAbsorb * p.circlesPerMass} circles + ${p.shardCount} shards · sound ${soundLabel}`;
    const keys = document.createElement('div');
    keys.style.color = '#6fa8c8';
    keys.textContent = '1-4 preset · E feed to critical · Q detonate now · A cycle sound · R reset · WASD move · mouse shoot';
    this.overlay.append(title, tag, stats, keys, this.statusLine);
  }

  private updateStatusLine(): void {
    const bh = this.bh;
    if (!bh || !bh.active) {
      this.statusLine.textContent = this.bhRespawnTimer > 0 ? '☠ DETONATED — respawning...' : '';
      return;
    }
    const state = bh.destabilizing ? ' ⚠ CRITICAL' : '';
    this.statusLine.textContent =
      `mass ${bh.absorbedCount}/${this.preset.maxAbsorb} · hp ${bh.hp}/${bh.maxHp}${state} · detonations ${this.detonationCount}`;
  }
}
