import { Renderer } from './renderer/sprite-batch';
import { BloomPass } from './renderer/bloom';
import { SpringMassGrid } from './renderer/grid';
import { Starfield } from './renderer/starfield';
import { ParticleField, FieldAttractor, FieldView } from './renderer/particle-field';
import { MatterField } from './renderer/matter-field';
import { Camera } from './core/camera';
import { Input } from './core/input';
import { AudioManager, BlackHoleHitVariant, SupernovaSoundVariant } from './core/audio';
import { ExplosionPool } from './entities/explosion';
import { BlackHole, BlackHoleVisualMode } from './entities/enemies/blackhole';
import { gameSettings } from './settings';
import {
  PARTICLE_FIELD_GAME_DENSITY,
  PARTICLE_FIELD_DUST_PULL,
  PARTICLE_FIELD_BH_EMIT_BASE,
  PARTICLE_FIELD_BH_EMBER_BASE,
  PARTICLE_FIELD_BH_EMBER_COUNT,
  PARTICLE_FIELD_BH_HIT_DUST,
  PARTICLE_FIELD_BH_HIT_DUST_SPREAD,
  PARTICLE_FIELD_BH_HIT_DUST_SPEED,
  PARTICLE_FIELD_BH_HIT_PARTICLES,
  PARTICLE_FIELD_BH_HIT_PARTICLES_SPREAD,
  PARTICLE_FIELD_BH_HIT_PARTICLES_SPEED,
  BH_HIT_MATTER_COUNT,
  BH_HIT_MATTER_SPEED,
  BH_HIT_MATTER_SPREAD,
  BH_HIT_MATTER_LIFE,
  MATTER_FIELD_MAX,
  BH_MATTER_TRICKLE,
  BH_MATTER_TRICKLE_COUNT,
  BH_DISK_CHARGE_RATE,
  BH_DISK_CHARGE_ABSORB_GAIN,
  BH_DISK_MOTES_MIN,
  BH_DISK_MOTES_MAX,
  BH_DISK_MOTE_LIFE,
  BH_DISK_MOTE_TANGENT,
  BH_DISK_HIT_SPRAY,
  BH_HIT_SURGE_DECAY,
  BH_HIT_SWIRL_SPEED_SURGE,
  BH_HIT_ORBIT_SPEED_SURGE,
  BH_HIT_SOUND_COOLDOWN_MS,
  EXPLOSION_DURATION_LARGE,
} from './config';

const TWO_PI = Math.PI * 2;
const TRACER_MS = 140;          // ms for a lab "bullet" tracer to reach the hole
const BH_RESPAWN_DELAY = 2200;  // ms between Destroy and the next hole
const DESTROY_MASS = 8;         // absorbed mass fed before Destroy so the bang has scale

const HIT_VARIANTS: BlackHoleHitVariant[] = ['thud', 'gulp', 'crack'];
const DEATH_VARIANTS: SupernovaSoundVariant[] = ['classic', 'subdrop', 'doom', 'quake'];
const VISUAL_MODES: BlackHoleVisualMode[] = ['dense', 'haze', 'corona', 'molten'];

/** A named bundle of every knob the lab exposes — the presets row applies these. */
interface FxPreset {
  name: string;
  // MATTER — massless escaping lances (the headline)
  matterCount: number;
  matterSpeed: number;
  matterSpread: number;
  // PARTICLES — massy hot ember jet (recaptured by the well)
  particleCount: number;
  particleSpeed: number;
  particleSpread: number;
  // DUST — massy slow cool fan (rides the swirl back in)
  dustCount: number;
  dustSpeed: number;
  dustSpread: number;
  // Ambient ember emission (particles element, always-on)
  emberRate: number;
  swirlSurge: number;
  surgeMs: number;
  orbitExcite: number;
  hitVolume: number;
}

export const FX_PRESETS: FxPreset[] = [
  {
    name: 'Subtle',
    matterCount: 10, matterSpeed: 5.5, matterSpread: 1.2,
    particleCount: 12, particleSpeed: 4.5, particleSpread: 1.2,
    dustCount: 10, dustSpeed: 1.5, dustSpread: 2.0,
    emberRate: 0.2,
    swirlSurge: 0.5, surgeMs: 320, orbitExcite: 0.8, hitVolume: 0.6,
  },
  {
    // Matches the shipped config defaults (production tuning).
    name: 'Current+',
    matterCount: BH_HIT_MATTER_COUNT, matterSpeed: BH_HIT_MATTER_SPEED, matterSpread: BH_HIT_MATTER_SPREAD,
    particleCount: PARTICLE_FIELD_BH_HIT_PARTICLES, particleSpeed: PARTICLE_FIELD_BH_HIT_PARTICLES_SPEED, particleSpread: PARTICLE_FIELD_BH_HIT_PARTICLES_SPREAD,
    dustCount: PARTICLE_FIELD_BH_HIT_DUST, dustSpeed: PARTICLE_FIELD_BH_HIT_DUST_SPEED, dustSpread: PARTICLE_FIELD_BH_HIT_DUST_SPREAD,
    emberRate: PARTICLE_FIELD_BH_EMBER_BASE,
    swirlSurge: BH_HIT_SWIRL_SPEED_SURGE, surgeMs: Math.round(1 / BH_HIT_SURGE_DECAY), orbitExcite: BH_HIT_ORBIT_SPEED_SURGE, hitVolume: 1,
  },
  {
    name: 'Violent',
    matterCount: 64, matterSpeed: 9.0, matterSpread: 2.2,
    particleCount: 70, particleSpeed: 7.5, particleSpread: 2.1,
    dustCount: 60, dustSpeed: 3.2, dustSpread: 3.1,
    emberRate: 1.0,
    swirlSurge: 2.4, surgeMs: 950, orbitExcite: 3.5, hitVolume: 1,
  },
];

/** A lab "bullet" in flight — the hit lands when the tracer reaches the hole. */
interface PendingHit {
  angle: number; // impact direction: from the hole's center toward the impact point
  eta: number;   // ms until impact
}

/**
 * BlackHole FX Lab (`?blackhole=1`) — preview + tune the black hole's bullet-hit and
 * death effects live, across the hole's THREE emission elements:
 *   MATTER    — massless escaping lance projectiles (no gravity; spray outward + escape)
 *   PARTICLES — massy hot embers (bigger/brighter than dust; curve back into the well)
 *   DUST      — massy cool motes (the ambient fog; rides the swirl, orbits, infalls)
 * Click the canvas (or Space / auto-fire) to "shoot" the hole through the real
 * `onBulletHit` path (hit pulse + sparks + the three-element burst + swirl/orbit surge +
 * the per-hit thud); Destroy runs the death path (eruption + supernova sound variants).
 * The sliders drive the same knobs the game reads from config, so a winning tuning can
 * be ported straight back into `config/effects.ts`. The hole's `diskCharge` accumulates
 * over lab time (Disk accumulation slider group) — monotonic, the dust ring visibly
 * collects and never depletes.
 */
export class BlackHoleLab {
  private renderer: Renderer;
  private bloom: BloomPass;
  private grid: SpringMassGrid;
  private starfield: Starfield;
  private field: ParticleField;
  private camera: Camera;
  private input: Input;
  private audio: AudioManager;
  private explosions: ExplosionPool;

  bh: BlackHole | null = null;
  presets = FX_PRESETS;
  /** Massless matter lances (public for test hooks). */
  readonly matter = new MatterField(MATTER_FIELD_MAX);

  // --- Live knobs (sliders write these; exposed for test hooks) ---
  visualMode: BlackHoleVisualMode = 'dense';
  // MATTER — massless escaping lances
  matterCount = BH_HIT_MATTER_COUNT;
  matterSpeed = BH_HIT_MATTER_SPEED;
  matterSpread = BH_HIT_MATTER_SPREAD;
  // PARTICLES — massy hot ember jet
  particleCount = PARTICLE_FIELD_BH_HIT_PARTICLES;
  particleSpeed = PARTICLE_FIELD_BH_HIT_PARTICLES_SPEED;
  particleSpread = PARTICLE_FIELD_BH_HIT_PARTICLES_SPREAD;
  // DUST — massy slow cool fan
  dustCount = PARTICLE_FIELD_BH_HIT_DUST;
  dustSpeed = PARTICLE_FIELD_BH_HIT_DUST_SPEED;
  dustSpread = PARTICLE_FIELD_BH_HIT_DUST_SPREAD;
  // Disk accumulation (pushed onto the hole via applyDiskKnobs)
  diskChargeRate = BH_DISK_CHARGE_RATE;
  diskAbsorbGain = BH_DISK_CHARGE_ABSORB_GAIN;
  diskMotesMin = BH_DISK_MOTES_MIN;
  diskMotesMax = BH_DISK_MOTES_MAX;
  // Ambient
  emberRate = PARTICLE_FIELD_BH_EMBER_BASE;
  swirlSurge = BH_HIT_SWIRL_SPEED_SURGE;
  surgeMs = Math.round(1 / BH_HIT_SURGE_DECAY);
  orbitExcite = BH_HIT_ORBIT_SPEED_SURGE;
  dustDensity = PARTICLE_FIELD_GAME_DENSITY;
  dustSwirl = 1.0;
  dustPull = PARTICLE_FIELD_DUST_PULL;
  hitVariant: BlackHoleHitVariant = 'thud';
  hitVolume = 1;
  deathVariant: SupernovaSoundVariant = 'subdrop';
  autoFireRate = 0; // shots/sec, 0 = off

  hitCount = 0;

  private pendingHits: PendingHit[] = [];
  private autoFireTimer = 0;
  private autoAngle = 0;
  private bhHitSoundCooldown = 0;
  private respawnTimer = 0;
  private totalTime = 0;
  private overlay: HTMLDivElement;
  private statusLine: HTMLDivElement;
  private panel!: HTMLDivElement;
  private sliderRefs: { input: HTMLInputElement; show: HTMLSpanElement; get: () => number; fmt: (v: number) => string }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    const gl = this.renderer.getGL();
    this.bloom = new BloomPass(gl);
    this.bloom.resize(this.renderer.canvasWidth, this.renderer.canvasHeight);
    this.grid = new SpringMassGrid(gl, false);
    this.grid.rebuild(gameSettings.arenaWidth, gameSettings.arenaHeight, gameSettings.gridSpacing);
    this.starfield = new Starfield(100, gameSettings.arenaWidth, gameSettings.arenaHeight);
    this.field = new ParticleField();
    this.camera = new Camera(this.renderer.width, this.renderer.height);
    this.input = new Input(canvas);
    this.input.setCamera(this.camera);
    this.input.setZoom(this.renderer.zoom);
    this.audio = new AudioManager();
    this.explosions = new ExplosionPool();

    this.overlay = document.createElement('div');
    this.overlay.id = 'blackhole-lab-overlay';
    this.overlay.style.cssText =
      'position:fixed;top:10px;left:12px;z-index:20;pointer-events:none;' +
      'font-family:monospace;color:#ffc9a0;text-shadow:0 0 6px rgba(255,150,60,0.6);font-size:12px;line-height:1.5;';
    this.statusLine = document.createElement('div');
    this.statusLine.style.cssText = 'margin-top:4px;color:#9fe8ff;';
    document.body.appendChild(this.overlay);

    this.buildPanel();

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      this.onKeyDown(e.code);
    });
    // Audio requires a user gesture (same pattern as the other labs)
    const initAudio = (): void => { if (!this.audio.initialized) this.audio.init().catch(() => {}); };
    canvas.addEventListener('pointerdown', initAudio);
    window.addEventListener('keydown', initAudio);
    // Click = shoot the hole from that direction (through the tracer → real hit path)
    canvas.addEventListener('pointerdown', () => {
      const m = this.input.getMouseWorldPos();
      const bh = this.bh;
      if (!bh || !bh.active) return;
      this.fire(Math.atan2(m.y - bh.position.y, m.x - bh.position.x));
    });

    this.spawnBlackHole();
    this.camera.snapTo(this.bh!.position);
    this.rebuildOverlay();
  }

  // ============================================================
  // Hole lifecycle
  // ============================================================
  private spawnBlackHole(): void {
    const bh = new BlackHole();
    bh.position.set(0, 0);
    bh.active = true;
    bh.spawnTimer = 0;
    bh.visualMode = this.visualMode;
    this.applySurgeKnobs(bh);
    this.applyDiskKnobs(bh);
    this.bh = bh;
    this.grid.applyImpulse(0, 0, -800, 350);
  }

  /** Push the surge sliders onto the hole (they are per-instance knobs on BlackHole). */
  private applySurgeKnobs(bh: BlackHole): void {
    bh.swirlSpeedSurge = this.swirlSurge;
    bh.swirlBrightSurge = this.swirlSurge * 1.17; // keep bright ≈ production ratio to speed
    bh.orbitSpeedSurge = this.orbitExcite;
    bh.orbitBrightSurge = this.orbitExcite * 0.5;
    bh.hitSurgeDecay = 1 / this.surgeMs;
  }

  /** Push the disk-accumulation sliders onto the hole (per-instance knobs on BlackHole). */
  private applyDiskKnobs(bh: BlackHole): void {
    bh.diskChargeRate = this.diskChargeRate;
    bh.diskChargeAbsorbGain = this.diskAbsorbGain;
  }

  /** Queue a shot at the hole from `angle` (rad, direction from hole center to impact). */
  fire(angle: number): void {
    const bh = this.bh;
    if (!bh || !bh.active) return;
    this.pendingHits.push({ angle, eta: TRACER_MS });
  }

  /** The tracer lands: run the real hit path (pulse + sparks + ejecta + surge) + thud. */
  private impact(angle: number): void {
    const bh = this.bh;
    if (!bh || !bh.active) return;
    bh.onBulletHit(angle);
    this.hitCount++;
    if (this.bhHitSoundCooldown <= 0) {
      this.audio.playBlackHoleHit(this.hitVariant, this.hitVolume);
      this.bhHitSoundCooldown = BH_HIT_SOUND_COOLDOWN_MS;
    }
  }

  /** Death path: feed to a showy mass, then erupt (dust + explosions + shake + sound). */
  destroy(): void {
    const bh = this.bh;
    if (!bh || !bh.active) return;
    while (bh.absorbedCount < DESTROY_MASS) bh.absorbEnemy();
    const x = bh.position.x;
    const y = bh.position.y;

    // Radial dust eruption (the disk blows out), same shape as the Particle Lab supernova
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TWO_PI;
      this.field.spawnBurst(x + Math.cos(a) * 24, y + Math.sin(a) * 24, a, 0.5, 6, 9, 35, 1.2);
    }
    // Matter blows out too — a full radial ring of escaping lances
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TWO_PI;
      this.matter.spray(x + Math.cos(a) * 24, y + Math.sin(a) * 24, a, 0.4, 3, 9, 1.1);
    }
    this.explosions.spawn(x, y, bh.color, 120, EXPLOSION_DURATION_LARGE);
    this.explosions.spawn(x, y, [1, 1, 1], 50, EXPLOSION_DURATION_LARGE * 0.6);
    this.explosions.spawn(x, y, [1, 0.5, 0.1], 40, EXPLOSION_DURATION_LARGE * 1.5, 0.3);
    this.grid.applyImpulse(x, y, 1400, 600);
    this.camera.shake(1.2, 0.45);
    this.audio.playSupernovaVariant(this.deathVariant, bh.absorbedCount);

    bh.active = false;
    this.pendingHits = [];
    this.respawnTimer = BH_RESPAWN_DELAY;
  }

  applyPreset(idx: number): void {
    const p = this.presets[idx];
    this.matterCount = p.matterCount;
    this.matterSpeed = p.matterSpeed;
    this.matterSpread = p.matterSpread;
    this.particleCount = p.particleCount;
    this.particleSpeed = p.particleSpeed;
    this.particleSpread = p.particleSpread;
    this.dustCount = p.dustCount;
    this.dustSpeed = p.dustSpeed;
    this.dustSpread = p.dustSpread;
    this.emberRate = p.emberRate;
    this.swirlSurge = p.swirlSurge;
    this.surgeMs = p.surgeMs;
    this.orbitExcite = p.orbitExcite;
    this.hitVolume = p.hitVolume;
    if (this.bh) this.applySurgeKnobs(this.bh);
    this.refreshPanel();
    this.rebuildOverlay();
  }

  private onKeyDown(code: string): void {
    switch (code) {
      case 'Space': this.autoAngle += 2.4; this.fire(this.autoAngle); break;
      case 'KeyD': this.destroy(); break;
      case 'KeyR': this.reset(); break;
      case 'Digit1': this.applyPreset(0); break;
      case 'Digit2': this.applyPreset(1); break;
      case 'Digit3': this.applyPreset(2); break;
      default: return;
    }
  }

  private reset(): void {
    this.pendingHits = [];
    this.explosions.clear();
    this.field.clear();
    this.matter.clear();
    this.respawnTimer = 0;
    this.hitCount = 0;
    this.spawnBlackHole();
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
    if (this.bhHitSoundCooldown > 0) this.bhHitSoundCooldown -= dt;

    // Respawn after Destroy
    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.spawnBlackHole();
    }

    const bh = this.bh;
    if (bh && bh.active) {
      bh.update(dt);
      if (bh.needsGridPulse) {
        this.grid.applyImpulse(bh.position.x, bh.position.y, bh.gridPulseStrength, 150);
        bh.needsGridPulse = false;
      }

      // Auto-fire: steady stream of hits from a slowly rotating direction
      if (this.autoFireRate > 0) {
        this.autoFireTimer -= dt;
        if (this.autoFireTimer <= 0) {
          this.autoFireTimer = 1000 / this.autoFireRate;
          this.autoAngle += 0.9;
          this.fire(this.autoAngle);
        }
      }
    }

    // Tracers in flight → impact on arrival
    for (let i = this.pendingHits.length - 1; i >= 0; i--) {
      const h = this.pendingHits[i];
      h.eta -= dt;
      if (h.eta <= 0) {
        this.pendingHits.splice(i, 1);
        this.impact(h.angle);
      }
    }

    // Dust field: the hole as an attractor (lab knobs, not the per-instance personality)
    const attractors: FieldAttractor[] = [];
    if (bh && bh.active) {
      const inst = bh.absorbedCount / BlackHole.MAX_ABSORB;
      attractors.push({
        x: bh.position.x,
        y: bh.position.y,
        strength: this.dustPull * (1 + inst * 1.2),
        radius: BlackHole.ATTRACT_RADIUS * bh.dustRadiusMult,
        heat: inst * 0.5,
        swirl: this.dustSwirl,
      });

      // Bullet-impact response — the full three-element vocabulary, driven by the lab
      // sliders so the whole range can be previewed (same recipe as Game.updateParticles).
      if (bh.impactEjecta.length > 0) {
        for (const hitAngle of bh.impactEjecta) {
          const hx = bh.position.x + Math.cos(hitAngle) * bh.collisionRadius * 0.9;
          const hy = bh.position.y + Math.sin(hitAngle) * bh.collisionRadius * 0.9;
          // MATTER — massless escaping lances (no gravity)
          this.matter.spray(hx, hy, hitAngle, this.matterSpread, Math.round(this.matterCount), this.matterSpeed, BH_HIT_MATTER_LIFE);
          // PARTICLES — hot ember jet (massy: curves back into the well)
          this.field.spawnBurst(hx, hy, hitAngle, this.particleSpread, Math.round(this.particleCount), this.particleSpeed, 35, 0.7, 1);
          // DUST — slow cool fan (massy: rides the swirl back in); a fat disk sprays more
          this.field.spawnBurst(hx, hy, hitAngle, this.dustSpread, Math.round(this.dustCount * (1 + bh.diskCharge * BH_DISK_HIT_SPRAY)), this.dustSpeed, 190 + Math.random() * 130, 1.1);
        }
        bh.impactEjecta.length = 0;
      }

      // Ambient rim DUST emission (the game's steady trickle) so the disk is always alive —
      // scaled by diskCharge like the game: more motes, longer-lived, with a growing
      // tangential (orbital) bias so the lab hole visibly accumulates over lab time.
      if (Math.random() < PARTICLE_FIELD_BH_EMIT_BASE) {
        const heat = inst * 0.5;
        const diskCount = Math.round(this.diskMotesMin + bh.diskCharge * (this.diskMotesMax - this.diskMotesMin));
        const diskLife = 0.95 + bh.diskCharge * (BH_DISK_MOTE_LIFE - 0.95);
        const diskTangent = bh.diskCharge * BH_DISK_MOTE_TANGENT * (Math.PI / 2) * (Math.sign(bh.dustSwirl) || 1);
        for (let k = 0; k < diskCount; k++) {
          const a = Math.random() * TWO_PI;
          const rr = bh.collisionRadius * (1.6 + Math.random() * 1.4);
          const rx = bh.position.x + Math.cos(a) * rr;
          const ry = bh.position.y + Math.sin(a) * rr;
          const inward = Math.atan2(bh.position.y - ry, bh.position.x - rx);
          this.field.spawnBurst(rx, ry, inward + diskTangent, 1.1, 1, 0.12 + Math.random() * 0.14, 210 - heat * 180, diskLife);
        }
      }

      // Ambient EMBERS (particles element) — hot motes shed on the rim that orbit + infall
      if (Math.random() < this.emberRate) {
        for (let k = 0; k < PARTICLE_FIELD_BH_EMBER_COUNT; k++) {
          const a = Math.random() * TWO_PI;
          const rr = bh.collisionRadius * (1.6 + Math.random() * 1.2);
          const rx = bh.position.x + Math.cos(a) * rr;
          const ry = bh.position.y + Math.sin(a) * rr;
          const inward = Math.atan2(bh.position.y - ry, bh.position.x - rx);
          this.field.spawnBurst(rx, ry, inward, 1.4, 1, 0.2 + Math.random() * 0.2, 40, 1.1, 1);
        }
      }

      // Ambient MATTER trickle while stressed (mirrors the game; a no-op at zero mass)
      if ((inst > 0.6 || (bh.destabilizing && !bh.overloaded)) && Math.random() < BH_MATTER_TRICKLE) {
        const a = Math.random() * TWO_PI;
        const rx = bh.position.x + Math.cos(a) * bh.collisionRadius * 0.9;
        const ry = bh.position.y + Math.sin(a) * bh.collisionRadius * 0.9;
        this.matter.spray(rx, ry, a, 0.6, BH_MATTER_TRICKLE_COUNT, this.matterSpeed * 0.8, BH_HIT_MATTER_LIFE);
      }

      // Grid gravity well (keeps the spacetime dent visible under the hole)
      const mass = -(gameSettings.bhGridMassBase + bh.absorbedCount * gameSettings.bhGridMassPerAbsorb) * bh.breathMassMultiplier;
      this.grid.applyGravityWell(bh.position.x, bh.position.y, mass, BlackHole.ATTRACT_RADIUS * gameSettings.bhGridRadiusMultiplier);

      // Audible stress as mass builds (the game's own ambient loop)
      this.audio.setBlackHoleStress(bh.absorbedCount / BlackHole.MAX_ABSORB);
    }

    this.field.update(dt, attractors, this.view());
    this.matter.update(dt);
    this.explosions.update(dt);
    this.grid.update(dt);
    this.camera.updateShake(dt);

    this.updateStatusLine();
  }

  private view(): FieldView {
    return {
      cx: this.camera.renderX,
      cy: this.camera.renderY,
      halfW: this.renderer.width / 2,
      halfH: this.renderer.height / 2,
    };
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
    const bh = this.bh;
    if (bh) bh.render(this.renderer);
    // Bullet tracers: a fast streak closing in on the impact point
    if (bh && bh.active) {
      for (const h of this.pendingHits) {
        const p = 1 - h.eta / TRACER_MS; // 0 → 1 as it closes in
        const dirX = Math.cos(h.angle);
        const dirY = Math.sin(h.angle);
        const dist = bh.collisionRadius + 420 * (1 - p);
        const hx = bh.position.x + dirX * dist;
        const hy = bh.position.y + dirY * dist;
        this.renderer.drawLine(hx + dirX * 30, hy + dirY * 30, hx, hy, 0.6, 0.85, 1, 0.9);
      }
    }
    this.renderer.end();

    // Additive glow pass: dust field, matter lances, explosions
    this.renderer.begin(false);
    this.renderer.setBlendMode('additive');
    this.field.render(this.renderer);
    this.matter.render(this.renderer);
    this.explosions.render(this.renderer);
    this.renderer.setBlendMode('normal');
    this.renderer.end();

    this.bloom.apply(this.renderer.canvasWidth, this.renderer.canvasHeight);
  }

  // ============================================================
  // Control panel (sliders / selects / buttons) + overlay
  // ============================================================
  private buildPanel(): void {
    this.panel = document.createElement('div');
    this.panel.id = 'blackhole-lab-panel';
    this.panel.style.cssText =
      'position:fixed;top:10px;right:12px;z-index:21;width:250px;max-height:92vh;overflow-y:auto;' +
      'background:rgba(8,12,24,0.82);border:1px solid rgba(255,150,60,0.35);border-radius:6px;padding:10px 12px;' +
      'font-family:monospace;font-size:11px;color:#c9d8e8;line-height:1.6;';
    document.body.appendChild(this.panel);

    const title = document.createElement('div');
    title.style.cssText = 'font-size:13px;font-weight:bold;color:#ffc9a0;margin-bottom:6px;';
    title.textContent = 'BLACK HOLE FX LAB';
    this.panel.appendChild(title);

    // Presets
    this.panel.appendChild(this.panelLabel('Presets'));
    const presetRow = document.createElement('div');
    presetRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;';
    this.presets.forEach((p, i) => {
      presetRow.appendChild(this.panelButton(p.name, () => this.applyPreset(i)));
    });
    this.panel.appendChild(presetRow);

    // Visual mode
    this.addSelect('Visual mode', VISUAL_MODES, this.visualMode, (v) => {
      this.visualMode = v as BlackHoleVisualMode;
      if (this.bh) this.bh.visualMode = this.visualMode;
    });

    // Hit FX sliders — the three-element emission vocabulary
    this.panel.appendChild(this.panelLabel('Hit: MATTER (massless — escapes)'));
    this.addSlider('Lance count', 0, 80, 1, () => this.matterCount, (v) => { this.matterCount = v; });
    this.addSlider('Lance speed', 2, 12, 0.1, () => this.matterSpeed, (v) => { this.matterSpeed = v; });
    this.addSlider('Lance spread', 0.2, 3.1, 0.05, () => this.matterSpread, (v) => { this.matterSpread = v; });

    this.panel.appendChild(this.panelLabel('Hit: PARTICLES (massy — recaptured)'));
    this.addSlider('Ember count', 0, 80, 1, () => this.particleCount, (v) => { this.particleCount = v; });
    this.addSlider('Ember speed', 1, 10, 0.1, () => this.particleSpeed, (v) => { this.particleSpeed = v; });
    this.addSlider('Ember spread', 0.2, 3.1, 0.05, () => this.particleSpread, (v) => { this.particleSpread = v; });

    this.panel.appendChild(this.panelLabel('Hit: DUST (massy — recaptured)'));
    this.addSlider('Dust count', 0, 60, 1, () => this.dustCount, (v) => { this.dustCount = v; });
    this.addSlider('Dust speed', 0.5, 5, 0.1, () => this.dustSpeed, (v) => { this.dustSpeed = v; });
    this.addSlider('Dust spread', 0.5, 3.1, 0.05, () => this.dustSpread, (v) => { this.dustSpread = v; });

    this.panel.appendChild(this.panelLabel('Disk accumulation (collects over time)'));
    this.addSlider('Charge rate /s', 0, 0.1, 0.005, () => this.diskChargeRate, (v) => {
      this.diskChargeRate = v;
      if (this.bh) this.applyDiskKnobs(this.bh);
    });
    this.addSlider('Absorb gain', 0, 0.5, 0.01, () => this.diskAbsorbGain, (v) => {
      this.diskAbsorbGain = v;
      if (this.bh) this.applyDiskKnobs(this.bh);
    });
    this.addSlider('Disk motes min', 0, 10, 1, () => this.diskMotesMin, (v) => { this.diskMotesMin = v; });
    this.addSlider('Disk motes max', 0, 20, 1, () => this.diskMotesMax, (v) => { this.diskMotesMax = v; });

    this.panel.appendChild(this.panelLabel('Swirl / orbit surge (on hit)'));
    this.addSlider('Swirl surge', 0, 3, 0.05, () => this.swirlSurge, (v) => {
      this.swirlSurge = v;
      if (this.bh) this.applySurgeKnobs(this.bh);
    });
    this.addSlider('Surge duration ms', 100, 1500, 10, () => this.surgeMs, (v) => {
      this.surgeMs = v;
      if (this.bh) this.applySurgeKnobs(this.bh);
    });
    this.addSlider('Orbit excitement', 0, 4, 0.05, () => this.orbitExcite, (v) => {
      this.orbitExcite = v;
      if (this.bh) this.applySurgeKnobs(this.bh);
    });

    this.panel.appendChild(this.panelLabel('Ambient dust field'));
    this.addSlider('Dust density', 60, 1400, 20, () => this.dustDensity, (v) => {
      this.dustDensity = v;
      this.field.density = Math.round(v);
      this.field.reseed();
    });
    this.addSlider('Dust swirl', 0, 2.5, 0.05, () => this.dustSwirl, (v) => { this.dustSwirl = v; });
    this.addSlider('Dust pull', 0, 6000, 50, () => this.dustPull, (v) => { this.dustPull = v; });
    this.addSlider('Ember rate', 0, 1, 0.05, () => this.emberRate, (v) => { this.emberRate = v; });

    this.panel.appendChild(this.panelLabel('Sound'));
    this.addSelect('Hit variant', HIT_VARIANTS, this.hitVariant, (v) => { this.hitVariant = v as BlackHoleHitVariant; });
    this.addSlider('Hit volume', 0, 1, 0.05, () => this.hitVolume, (v) => { this.hitVolume = v; });
    this.addSelect('Death variant', DEATH_VARIANTS, this.deathVariant, (v) => { this.deathVariant = v as SupernovaSoundVariant; });

    this.panel.appendChild(this.panelLabel('Fire control'));
    this.addSlider('Auto-fire shots/s', 0, 8, 0.5, () => this.autoFireRate, (v) => { this.autoFireRate = v; });
    const fireRow = document.createElement('div');
    fireRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;';
    fireRow.appendChild(this.panelButton('Fire', () => { this.autoAngle += 2.4; this.fire(this.autoAngle); }));
    fireRow.appendChild(this.panelButton('Destroy', () => this.destroy()));
    fireRow.appendChild(this.panelButton('Reset', () => this.reset()));
    this.panel.appendChild(fireRow);

    // Sync slider positions with the initial knob values
    this.field.density = Math.round(this.dustDensity);
    this.refreshPanel();
  }

  private panelLabel(text: string): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = 'color:#ffc9a0;margin:8px 0 2px;border-top:1px solid rgba(255,150,60,0.2);padding-top:6px;';
    el.textContent = text;
    return el;
  }

  private panelButton(text: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText =
      'flex:1;background:rgba(255,150,60,0.12);border:1px solid rgba(255,150,60,0.45);border-radius:4px;' +
      'color:#ffc9a0;font-family:monospace;font-size:11px;padding:3px 6px;cursor:pointer;';
    btn.addEventListener('click', onClick);
    return btn;
  }

  private addSlider(
    label: string, min: number, max: number, step: number,
    get: () => number, set: (v: number) => void,
  ): void {
    const fmt = (v: number): string => (step >= 1 ? String(Math.round(v)) : v.toFixed(2));
    const row = document.createElement('div');
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;';
    const name = document.createElement('span');
    name.textContent = label;
    const show = document.createElement('span');
    show.style.color = '#9fe8ff';
    head.append(name, show);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.style.cssText = 'width:100%;accent-color:#ff9640;';
    input.addEventListener('input', () => {
      set(Number(input.value));
      show.textContent = fmt(Number(input.value));
    });
    row.append(head, input);
    this.panel.appendChild(row);
    this.sliderRefs.push({ input, show, get, fmt });
  }

  private addSelect(label: string, options: string[], current: string, set: (v: string) => void): void {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin:2px 0;';
    const name = document.createElement('span');
    name.textContent = label;
    const select = document.createElement('select');
    select.style.cssText = 'background:#0c1424;color:#c9d8e8;border:1px solid rgba(255,150,60,0.45);font-family:monospace;font-size:11px;';
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      if (opt === current) o.selected = true;
      select.appendChild(o);
    }
    select.addEventListener('change', () => set(select.value));
    row.append(name, select);
    this.panel.appendChild(row);
  }

  /** Push the current knob values back into the slider widgets (after a preset). */
  private refreshPanel(): void {
    for (const ref of this.sliderRefs) {
      const v = ref.get();
      ref.input.value = String(v);
      ref.show.textContent = ref.fmt(v);
    }
  }

  private rebuildOverlay(): void {
    this.overlay.innerHTML = '';
    const title = document.createElement('div');
    title.style.cssText = 'font-size:15px;font-weight:bold;color:#fff;';
    title.textContent = 'BLACK HOLE FX LAB — hit + death effects';
    const keys = document.createElement('div');
    keys.style.color = '#c88a5a';
    keys.textContent = 'click shoot · SPACE shoot · D destroy · 1-3 preset (Subtle/Current+/Violent) · R reset · panel → tune live';
    this.overlay.append(title, keys, this.statusLine);
  }

  private updateStatusLine(): void {
    const bh = this.bh;
    if (!bh || !bh.active) {
      this.statusLine.textContent = this.respawnTimer > 0 ? '☠ DESTROYED — respawning...' : '';
      return;
    }
    this.statusLine.textContent =
      `mode ${bh.visualMode} · mass ${bh.absorbedCount}/${BlackHole.MAX_ABSORB} · disk ${(bh.diskCharge * 100).toFixed(0)}% · ` +
      `motes ${this.field.count} · lances ${this.matter.count} · hits ${this.hitCount} · sound ${this.hitVariant}@${this.hitVolume.toFixed(2)}`;
  }
}
