import { Renderer } from './renderer/sprite-batch';
import { BloomPass } from './renderer/bloom';
import { SpringMassGrid } from './renderer/grid';
import { Starfield } from './renderer/starfield';
import { ParticleField, FieldView } from './renderer/particle-field';
import { Camera } from './core/camera';
import { Input } from './core/input';
import { AudioManager } from './core/audio';
import { Player } from './entities/player';
import { BulletPool } from './entities/bullet';
import { AimIndicator } from './entities/crosshair';
import { Vec2 } from './core/vector';
import { gameSettings } from './settings';
import { COLORS } from './config';

/**
 * Circle Lab (`?circles=1`) — a playable sandbox for the *tracking behaviour* and
 * *visual DNA* of the BlackHole-ejecta Circle enemy. Fly the real ship; a flock of
 * circles hunts you using one of five selectable tracking models. Switch models and
 * toggle visual layers live to find the feel, then port the winner into CircleEnemy.
 *
 * The headline model is ORBITAL (2): the player is treated as a gravity well and each
 * circle carries momentum, so it overshoots, almost orbits, and falls back into your
 * "gravity" — the elastic, less-gimmicky feel the current hard-lead lacks.
 *
 * Tracking models (number keys):
 *   1 · Direct lead   — the shipped behaviour (hard-set velocity at an intercept point)
 *   2 · Orbital       — player = gravity well; spring pull + momentum + drag → overshoot/orbit/fall-back
 *   3 · Elastic spring— underdamped spring to a lead point → springy overshoot & oscillation
 *   4 · Serpentine    — lead heading + per-circle sine wander → unpredictable weaving approach
 *   5 · Swarm (boids) — seek + separation + cohesion + alignment → emergent flowing blob
 *
 * Visual DNA layers (letters): O orbiting satellites · P shed dust · U pulse halo · T trails
 * Tuning: Z/X primary param · C/V drag · N/M speed cap · [ / ] circle count
 * Also: SPACE eject a fresh ring · G grid · B bloom · R reset · WASD move · mouse aim · click shoot
 */

const CIRCLE_R = 10;
const SOFTEN = 40; // px softening so central forces stay finite near the player

type TrackMode = 1 | 2 | 3 | 4 | 5;
const MODE_NAMES: Record<TrackMode, string> = {
  1: 'DIRECT LEAD',
  2: 'ORBITAL (gravity well)',
  3: 'ELASTIC SPRING',
  4: 'SERPENTINE',
  5: 'SWARM (boids)',
};

/** One lab circle. Momentum-carrying so the elastic models read; per-instance traits
 *  give the flock variety (no two orbit the same). */
class LabCircle {
  pos = new Vec2(0, 0);
  vel = new Vec2(0, 0);
  age = 0;             // ms alive
  // Per-instance personality
  jitter = 0.8 + Math.random() * 0.4;      // mass/pull scalar
  wobblePhase = Math.random() * Math.PI * 2;
  wobbleFreq = 0.003 + Math.random() * 0.004;
  spinDir = Math.random() < 0.5 ? -1 : 1;  // orbit handedness / satellite spin
  hueShift = (Math.random() - 0.5) * 0.15;
  hitFlash = 0;        // 0..1, brief white on player contact
  active = true;
}

export class CircleLab {
  private renderer: Renderer;
  private bloom: BloomPass;
  private grid: SpringMassGrid;
  private starfield: Starfield;
  private field: ParticleField;
  private camera: Camera;
  private input: Input;
  private audio: AudioManager;
  private player: Player;
  private bullets: BulletPool;
  private crosshair: AimIndicator;

  circles: LabCircle[] = [];
  mode: TrackMode = 2;

  // Visual DNA toggles (exposed for tests)
  dotsOn = true;      // orbiting satellite particles (accretion)
  shedOn = true;      // shed dust motes into the field
  pulseOn = true;     // breathing halo
  trailsOn = true;    // velocity streak tail (drawn directly)
  gridOn = true;
  bloomOn = true;

  // Population
  targetCount = 26;

  // Shared tunables (meaning depends on the model — see labelled in overlay)
  speed = 0.38;        // px/ms — the "cruise" speed of lead-style models
  leadMaxMs = 550;     // ms — prediction cap (models 1,3,4)
  springK = 1.3;       // spring strength (scaled; models 2,3)
  drag = 0.993;        // per-frame velocity retention — high so orbits sustain & overshoot
  speedCap = 0.55;     // px/ms — momentum speed cap (models 2,3,5)
  wobbleAmp = 0.55;    // lateral wander (model 4)
  captureRadius = 260; // px — player "gravity" reach shown as a ring (models 2,3)

  private baseBloom = 1;
  private totalTime = 0;
  private spawnTimer = 0;
  private overlay: HTMLDivElement;
  private statusLine: HTMLDivElement;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    const gl = this.renderer.getGL();
    this.bloom = new BloomPass(gl);
    this.bloom.resize(this.renderer.canvasWidth, this.renderer.canvasHeight);
    this.baseBloom = this.bloom.intensity;
    this.grid = new SpringMassGrid(gl, false);
    this.grid.rebuild(gameSettings.arenaWidth, gameSettings.arenaHeight, gameSettings.gridSpacing);
    this.starfield = new Starfield(90, gameSettings.arenaWidth, gameSettings.arenaHeight);
    this.field = new ParticleField();
    this.field.density = 160; // lighter ambient dust; circles do most of the emitting
    this.camera = new Camera(this.renderer.width, this.renderer.height);
    this.input = new Input(canvas);
    this.input.setCamera(this.camera);
    this.input.setZoom(this.renderer.zoom);
    this.audio = new AudioManager();
    this.player = new Player(this.input);
    this.bullets = new BulletPool();
    this.crosshair = new AimIndicator();

    this.overlay = document.createElement('div');
    this.overlay.id = 'circle-lab-overlay';
    this.overlay.style.cssText =
      'position:fixed;top:10px;left:12px;z-index:20;pointer-events:none;' +
      'font-family:monospace;color:#9fe8ff;text-shadow:0 0 6px rgba(60,180,255,0.6);font-size:12px;line-height:1.5;';
    this.statusLine = document.createElement('div');
    this.statusLine.style.cssText = 'margin-top:4px;color:#c9b8ff;';
    document.body.appendChild(this.overlay);

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      this.onKeyDown(e.code);
    });
    const initAudio = (): void => { if (!this.audio.initialized) this.audio.init().catch(() => {}); };
    canvas.addEventListener('pointerdown', initAudio);
    window.addEventListener('keydown', initAudio);

    this.reset();
  }

  reset(): void {
    this.circles = [];
    this.bullets.clear();
    this.field.reseed();
    this.player.reset();
    this.player.position.set(0, 0);
    this.camera.snapTo(this.player.position);
    this.spawnTimer = 0;
    this.spawnRing(this.targetCount);
    this.rebuildOverlay();
  }

  // ============================================================
  // Spawning
  // ============================================================
  /** Eject `n` circles from a ring around the player — like a supernova burst — each
   *  with an initial outward + tangential velocity so the orbital models have energy. */
  private spawnRing(n: number): void {
    const cx = this.player.position.x;
    const cy = this.player.position.y;
    const R = this.captureRadius * 1.35;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
      const c = new LabCircle();
      c.pos.set(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      // Seed velocity: mostly outward burst + a tangential kick so orbits form rather
      // than dead-straight dives. Magnitude in px/ms.
      const out = 0.1 + Math.random() * 0.08;
      const tang = (0.18 + Math.random() * 0.14) * c.spinDir;
      const nx = Math.cos(a), ny = Math.sin(a);
      c.vel.set(nx * out - ny * tang, ny * out + nx * tang);
      this.circles.push(c);
    }
  }

  private spawnOne(): void {
    const cx = this.player.position.x;
    const cy = this.player.position.y;
    const a = Math.random() * Math.PI * 2;
    const R = this.captureRadius * (1.3 + Math.random() * 0.5);
    const c = new LabCircle();
    c.pos.set(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    const tang = (0.12 + Math.random() * 0.12) * c.spinDir;
    c.vel.set(-Math.sin(a) * tang, Math.cos(a) * tang);
    this.circles.push(c);
  }

  // ============================================================
  // Update
  // ============================================================
  update(dt: number): void {
    this.totalTime += dt / 1000;

    this.player.update(dt);
    // Keep the ship near arena centre-ish so circles never chase it off-view.
    const lim = Math.min(gameSettings.arenaWidth, gameSettings.arenaHeight) / 2 - 60;
    this.player.position.x = Math.max(-lim, Math.min(lim, this.player.position.x));
    this.player.position.y = Math.max(-lim, Math.min(lim, this.player.position.y));

    const shots = this.player.tryShoot();
    if (shots) {
      for (const angle of shots) this.bullets.spawn(this.player.position.x, this.player.position.y, angle);
      if (this.audio.initialized) this.audio.playShoot(shots.length);
      this.player.kickRecoil(shots.length);
    }
    this.bullets.update(dt);

    // Maintain population with a gentle trickle.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 500;
      if (this.circles.filter(c => c.active).length < this.targetCount) this.spawnOne();
    }

    // Precompute swarm neighbourhood centroid/heading once per frame (model 5).
    let swarmCX = 0, swarmCY = 0, swarmVX = 0, swarmVY = 0, swarmN = 0;
    if (this.mode === 5) {
      for (const c of this.circles) {
        if (!c.active) continue;
        swarmCX += c.pos.x; swarmCY += c.pos.y; swarmVX += c.vel.x; swarmVY += c.vel.y; swarmN++;
      }
      if (swarmN > 0) { swarmCX /= swarmN; swarmCY /= swarmN; swarmVX /= swarmN; swarmVY /= swarmN; }
    }

    const player = this.player.position;
    const pvel = this.player.velocity;
    for (const c of this.circles) {
      if (!c.active) continue;
      c.age += dt;
      if (c.hitFlash > 0) c.hitFlash = Math.max(0, c.hitFlash - dt * 0.004);
      switch (this.mode) {
        case 1: this.trackDirect(c, dt, player, pvel); break;
        case 2: this.trackOrbital(c, dt, player); break;
        case 3: this.trackSpring(c, dt, player, pvel); break;
        case 4: this.trackSerpentine(c, dt, player, pvel); break;
        case 5: this.trackSwarm(c, dt, player, swarmCX, swarmCY, swarmVX, swarmVY); break;
      }
      // Shed dust — a couple of motes drifting off the back, so each circle reads as a
      // leaking mote of the BlackHole that spat it out.
      if (this.shedOn && Math.random() < 0.5) {
        const sp = Math.hypot(c.vel.x, c.vel.y);
        const behind = Math.atan2(-c.vel.y, -c.vel.x);
        this.field.spawnBurst(c.pos.x, c.pos.y, behind, 1.4, 1, 0.6 + sp * 1.5, 205, 0.5);
      }
    }

    this.handleBulletHits();
    this.handlePlayerContact();

    this.field.update(dt, [], this.view());
    this.grid.update(dt);
    this.camera.follow(this.player.position);
    this.camera.updateShake(dt);

    this.circles = this.circles.filter(c => c.active);
    this.updateStatusLine();
  }

  // --- Tracking models -------------------------------------------------------
  private frameNorm(dt: number): number { return Math.max(0.35, Math.min(2.2, dt / 16.6667)); }

  /** 1 · Direct lead — the shipped behaviour: hard-set velocity toward an intercept
   *  point. Included as the A/B baseline. Constant speed, no elasticity. */
  private trackDirect(c: LabCircle, dt: number, player: Vec2, pvel: Vec2): void {
    const dx = player.x - c.pos.x, dy = player.y - c.pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    const lead = Math.min(this.leadMaxMs, dist / this.speed);
    const aimX = player.x + pvel.x * lead;
    const aimY = player.y + pvel.y * lead;
    const adx = aimX - c.pos.x, ady = aimY - c.pos.y;
    const am = Math.hypot(adx, ady) || 1;
    c.vel.set((adx / am) * this.speed, (ady / am) * this.speed);
    c.pos.x += c.vel.x * dt;
    c.pos.y += c.vel.y * dt;
  }

  /** 2 · Orbital — the player is a gravity well. A central spring pull (stronger the
   *  further out, so it always reels a straying circle back) plus retained momentum
   *  and light drag makes each circle overshoot, curve into an orbit, then fall back
   *  in. Per-instance `jitter` + a hair of noise keep the flock unpredictable. */
  private trackOrbital(c: LabCircle, dt: number, player: Vec2): void {
    const f = this.frameNorm(dt);
    const dx = player.x - c.pos.x, dy = player.y - c.pos.y;
    const dist = Math.hypot(dx, dy);
    // Spring accel toward player (px/ms per frame). springK scaled into a small constant.
    const k = this.springK * 1.1e-6 * c.jitter;
    c.vel.x += dx * k * dt;
    c.vel.y += dy * k * dt;
    // Unpredictability: small brownian nudge, scaled down as it closes so the kill
    // stays committed.
    const noise = 0.0016 * Math.min(1, dist / this.captureRadius);
    c.vel.x += (Math.random() - 0.5) * noise * f;
    c.vel.y += (Math.random() - 0.5) * noise * f;
    // Drag bleeds orbital energy → the orbit slowly tightens and it spirals in.
    const dragF = Math.pow(this.drag, f);
    c.vel.x *= dragF; c.vel.y *= dragF;
    this.capSpeed(c);
    c.pos.x += c.vel.x * dt;
    c.pos.y += c.vel.y * dt;
  }

  /** 3 · Elastic spring — spring toward a *lead* point but underdamped, so it whips
   *  past and oscillates around the intercept before settling. Springier, snappier
   *  cousin of orbital. */
  private trackSpring(c: LabCircle, dt: number, player: Vec2, pvel: Vec2): void {
    const f = this.frameNorm(dt);
    const dist = Math.hypot(player.x - c.pos.x, player.y - c.pos.y) || 1;
    const lead = Math.min(this.leadMaxMs, dist / this.speed);
    const tx = player.x + pvel.x * lead;
    const ty = player.y + pvel.y * lead;
    const k = this.springK * 2.2e-6 * c.jitter;
    c.vel.x += (tx - c.pos.x) * k * dt;
    c.vel.y += (ty - c.pos.y) * k * dt;
    const dragF = Math.pow(this.drag, f);
    c.vel.x *= dragF; c.vel.y *= dragF;
    this.capSpeed(c);
    c.pos.x += c.vel.x * dt;
    c.pos.y += c.vel.y * dt;
  }

  /** 4 · Serpentine — lead heading, but the aim is offset laterally by a per-circle
   *  sine wave, so it weaves in on an unpredictable snaking path instead of a
   *  straight intercept. Constant speed. */
  private trackSerpentine(c: LabCircle, dt: number, player: Vec2, pvel: Vec2): void {
    const dx = player.x - c.pos.x, dy = player.y - c.pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    const lead = Math.min(this.leadMaxMs, dist / this.speed);
    let aimX = player.x + pvel.x * lead;
    let aimY = player.y + pvel.y * lead;
    // Perpendicular sine wander, amplitude falls off as it closes (commit to the kill).
    const bdx = aimX - c.pos.x, bdy = aimY - c.pos.y;
    const bm = Math.hypot(bdx, bdy) || 1;
    const perpX = -bdy / bm, perpY = bdx / bm;
    const wobble = Math.sin(c.age * c.wobbleFreq + c.wobblePhase) * this.wobbleAmp
      * Math.min(1, dist / 180) * 140 * c.spinDir;
    aimX += perpX * wobble;
    aimY += perpY * wobble;
    const adx = aimX - c.pos.x, ady = aimY - c.pos.y;
    const am = Math.hypot(adx, ady) || 1;
    c.vel.set((adx / am) * this.speed, (ady / am) * this.speed);
    c.pos.x += c.vel.x * dt;
    c.pos.y += c.vel.y * dt;
  }

  /** 5 · Swarm — boids: weak seek to the player + separation from close neighbours +
   *  cohesion to the flock centroid + alignment to its average heading. Emergent
   *  flowing blob that collectively surges and folds around the player. */
  private trackSwarm(c: LabCircle, dt: number, player: Vec2, cX: number, cY: number, vX: number, vY: number): void {
    const f = this.frameNorm(dt);
    // Seek player
    const sx = player.x - c.pos.x, sy = player.y - c.pos.y;
    const sm = Math.hypot(sx, sy) || 1;
    c.vel.x += (sx / sm) * 0.0009 * dt;
    c.vel.y += (sy / sm) * 0.0009 * dt;
    // Separation (repel near neighbours)
    let repX = 0, repY = 0;
    for (const o of this.circles) {
      if (o === c || !o.active) continue;
      const ox = c.pos.x - o.pos.x, oy = c.pos.y - o.pos.y;
      const d2 = ox * ox + oy * oy;
      if (d2 < 42 * 42 && d2 > 1) { const inv = 1 / d2; repX += ox * inv; repY += oy * inv; }
    }
    c.vel.x += repX * 34 * f;
    c.vel.y += repY * 34 * f;
    // Cohesion + alignment
    c.vel.x += (cX - c.pos.x) * 2.0e-6 * dt + (vX - c.vel.x) * 0.02 * f;
    c.vel.y += (cY - c.pos.y) * 2.0e-6 * dt + (vY - c.vel.y) * 0.02 * f;
    const dragF = Math.pow(this.drag, f);
    c.vel.x *= dragF; c.vel.y *= dragF;
    this.capSpeed(c);
    c.pos.x += c.vel.x * dt;
    c.pos.y += c.vel.y * dt;
  }

  private capSpeed(c: LabCircle): void {
    const sp2 = c.vel.x * c.vel.x + c.vel.y * c.vel.y;
    const cap = this.speedCap;
    if (sp2 > cap * cap) {
      const s = cap / Math.sqrt(sp2);
      c.vel.x *= s; c.vel.y *= s;
    }
  }

  // --- Interactions ----------------------------------------------------------
  private handleBulletHits(): void {
    for (const b of this.bullets.bullets) {
      if (!b.active) continue;
      for (const c of this.circles) {
        if (!c.active) continue;
        const dx = c.pos.x - b.position.x, dy = c.pos.y - b.position.y;
        const hitR = CIRCLE_R + 8;
        if (dx * dx + dy * dy > hitR * hitR) continue;
        b.active = false;
        c.active = false;
        // Pop: a spray of dust in the bullet's direction + a hot flash puff.
        this.field.spawnBurst(c.pos.x, c.pos.y, b.angle, 1.0, 8, 4.5, 205, 0.5);
        if (this.audio.initialized) this.audio.playKillSignature('circle');
        break;
      }
    }
  }

  private handlePlayerContact(): void {
    const p = this.player.position;
    for (const c of this.circles) {
      if (!c.active) continue;
      const dx = c.pos.x - p.x, dy = c.pos.y - p.y;
      const r = CIRCLE_R + this.player.collisionRadius;
      if (dx * dx + dy * dy < r * r) {
        // Non-lethal in the lab: flash + a light shake so you *feel* the strike, and
        // give the circle an elastic bounce off the player so the orbit reads.
        c.hitFlash = 1;
        const d = Math.hypot(dx, dy) || 1;
        const nx = dx / d, ny = dy / d;
        const vdotn = c.vel.x * nx + c.vel.y * ny;
        c.vel.x -= 1.6 * vdotn * nx;
        c.vel.y -= 1.6 * vdotn * ny;
        c.pos.x = p.x + nx * r; c.pos.y = p.y + ny * r;
        this.camera.shake(0.18);
      }
    }
  }

  private view(): FieldView {
    return { cx: this.camera.renderX, cy: this.camera.renderY, halfW: this.renderer.width / 2, halfH: this.renderer.height / 2 };
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
    if (this.gridOn) this.grid.render(cameraX, cameraY, this.renderer.width, this.renderer.height);

    this.renderer.begin(false);
    this.starfield.render(this.renderer, cameraX, cameraY);
    this.renderer.end();

    // Normal pass: player "gravity" ring + circle bodies + ship + bullets
    this.renderer.begin(false);
    this.renderArenaBorder();
    if (this.mode === 2 || this.mode === 3) this.renderGravityRing();
    for (const c of this.circles) this.renderCircleBody(c);
    this.player.render(this.renderer);
    this.bullets.render(this.renderer);
    const mouse = this.input.getMouseWorldPos();
    this.crosshair.render(this.renderer, mouse.x, mouse.y, this.totalTime);
    this.renderer.end();

    // Additive pass: dust field + circle glow layers (trails, pulse, satellites)
    this.renderer.begin(false);
    this.renderer.setBlendMode('additive');
    this.field.render(this.renderer);
    for (const c of this.circles) this.renderCircleGlow(c);
    this.renderer.setBlendMode('normal');
    this.renderer.end();

    this.bloom.intensity = this.bloomOn ? this.baseBloom : 0;
    this.bloom.apply(this.renderer.canvasWidth, this.renderer.canvasHeight);
  }

  /** Faint ring around the player showing the "gravity" capture reach (orbital modes). */
  private renderGravityRing(): void {
    const p = this.player.position;
    const pulse = 0.5 + 0.5 * Math.sin(this.totalTime * 2);
    this.renderer.drawCircle(p.x, p.y, this.captureRadius, [0.2, 0.5, 0.9], 48, 0.1 + 0.06 * pulse);
    this.renderer.drawCircle(p.x, p.y, this.captureRadius * 0.5, [0.3, 0.4, 0.9], 40, 0.06);
  }

  /** Solid body (normal pass): dark event-horizon core + bright accretion ring, so a
   *  circle reads as a shard of the BlackHole that ejected it. */
  private renderCircleBody(c: LabCircle): void {
    const col = COLORS.circle.color;
    const col2 = COLORS.circle.color2;
    const flash = c.hitFlash;
    const r = CIRCLE_R;
    // Dark core
    this.renderer.drawFilledCircle(c.pos.x, c.pos.y, r * 0.62, [0.02, 0.01, 0.06], 14, 0.92);
    // Accretion rings
    const rr = flash > 0 ? [Math.min(1, col[0] + flash), Math.min(1, col[1] + flash), Math.min(1, col[2] + flash)] as [number, number, number] : col;
    this.renderer.drawCircle(c.pos.x, c.pos.y, r, rr, 20);
    this.renderer.drawCircle(c.pos.x, c.pos.y, r + 1.5, col2, 20, 0.6);
  }

  /** Glow layers (additive pass): velocity streak, pulse halo, orbiting satellites. */
  private renderCircleGlow(c: LabCircle): void {
    const col = COLORS.circle.color;
    const col2 = COLORS.circle.color2;

    // Velocity streak — a comet tail behind the direction of travel (vel is px/ms).
    if (this.trailsOn) {
      const tx = c.vel.x * 90, ty = c.vel.y * 90;
      if (tx * tx + ty * ty > 4) {
        this.renderer.drawLine(c.pos.x - tx, c.pos.y - ty, c.pos.x, c.pos.y, col[0], col[1], col[2], 0.5);
        this.renderer.drawLine(c.pos.x - tx * 0.5, c.pos.y - ty * 0.5, c.pos.x, c.pos.y, col2[0], col2[1], col2[2], 0.4);
      }
    }

    // Pulse halo — breathing glow ring (each circle on its own phase).
    if (this.pulseOn) {
      const p = 0.5 + 0.5 * Math.sin(c.age * 0.005 + c.wobblePhase);
      this.renderer.drawCircle(c.pos.x, c.pos.y, CIRCLE_R + 4 + p * 6, col, 18, 0.1 + 0.12 * p);
    }

    // Orbiting satellites — 3 little accretion motes circling the body.
    if (this.dotsOn) {
      for (let i = 0; i < 3; i++) {
        const a = c.age * 0.006 * c.spinDir + c.wobblePhase + i * 2.094;
        const orx = c.pos.x + Math.cos(a) * (CIRCLE_R + 6);
        const ory = c.pos.y + Math.sin(a) * (CIRCLE_R + 6);
        this.renderer.drawFilledCircle(orx, ory, 1.7, col2, 6, 0.85);
      }
    }
  }

  private renderArenaBorder(): void {
    const hw = gameSettings.arenaWidth / 2;
    const hh = gameSettings.arenaHeight / 2;
    this.renderer.drawLine(-hw, -hh, hw, -hh, 0.2, 0.3, 0.7, 0.5);
    this.renderer.drawLine(hw, -hh, hw, hh, 0.2, 0.3, 0.7, 0.5);
    this.renderer.drawLine(hw, hh, -hw, hh, 0.2, 0.3, 0.7, 0.5);
    this.renderer.drawLine(-hw, hh, -hw, -hh, 0.2, 0.3, 0.7, 0.5);
  }

  // ============================================================
  // Input + overlay
  // ============================================================
  private onKeyDown(code: string): void {
    switch (code) {
      case 'Digit1': this.mode = 1; break;
      case 'Digit2': this.mode = 2; break;
      case 'Digit3': this.mode = 3; break;
      case 'Digit4': this.mode = 4; break;
      case 'Digit5': this.mode = 5; break;
      case 'KeyO': this.dotsOn = !this.dotsOn; break;
      case 'KeyP': this.shedOn = !this.shedOn; break;
      case 'KeyU': this.pulseOn = !this.pulseOn; break;
      case 'KeyT': this.trailsOn = !this.trailsOn; break;
      case 'KeyG': this.gridOn = !this.gridOn; break;
      case 'KeyB': this.bloomOn = !this.bloomOn; break;
      case 'Space': this.spawnRing(Math.round(this.targetCount * 0.7)); break;
      case 'KeyR': this.reset(); break;
      // Primary param (Z/X): springK for elastic models, speed for lead models, wobble for serpentine
      case 'KeyZ': this.adjustPrimary(-1); break;
      case 'KeyX': this.adjustPrimary(1); break;
      case 'KeyC': this.drag = Math.max(0.95, +(this.drag - 0.002).toFixed(3)); break;
      case 'KeyV': this.drag = Math.min(0.999, +(this.drag + 0.002).toFixed(3)); break;
      case 'KeyN': this.speedCap = Math.max(0.2, +(this.speedCap - 0.03).toFixed(2)); break;
      case 'KeyM': this.speedCap = Math.min(1.2, +(this.speedCap + 0.03).toFixed(2)); break;
      case 'BracketLeft': this.targetCount = Math.max(4, this.targetCount - 4); break;
      case 'BracketRight': this.targetCount = Math.min(120, this.targetCount + 4); break;
      default: return;
    }
    this.rebuildOverlay();
  }

  private adjustPrimary(dir: number): void {
    if (this.mode === 2 || this.mode === 3) {
      this.springK = Math.max(0.1, Math.min(4, +(this.springK + dir * 0.1).toFixed(2)));
    } else if (this.mode === 4) {
      this.wobbleAmp = Math.max(0, Math.min(2, +(this.wobbleAmp + dir * 0.1).toFixed(2)));
    } else {
      this.speed = Math.max(0.15, Math.min(0.8, +(this.speed + dir * 0.02).toFixed(2)));
    }
  }

  private onResize(): void {
    this.renderer.resize();
    this.bloom.resize(this.renderer.canvasWidth, this.renderer.canvasHeight);
    this.camera.viewportWidth = this.renderer.width;
    this.camera.viewportHeight = this.renderer.height;
    this.input.setZoom(this.renderer.zoom);
  }

  private onOff(v: boolean): string { return v ? 'ON' : 'off'; }

  private rebuildOverlay(): void {
    this.overlay.innerHTML = '';
    const title = document.createElement('div');
    title.style.cssText = 'font-size:15px;font-weight:bold;color:#fff;';
    title.textContent = `CIRCLE LAB — model ${this.mode}: ${MODE_NAMES[this.mode]}`;
    const models = document.createElement('div');
    models.innerHTML =
      `<span style="color:#fff">1</span> lead · <span style="color:#fff">2</span> orbital · ` +
      `<span style="color:#fff">3</span> spring · <span style="color:#fff">4</span> serpentine · ` +
      `<span style="color:#fff">5</span> swarm`;
    const dna = document.createElement('div');
    dna.style.color = '#7fd8ff';
    dna.innerHTML =
      `DNA: <span style="color:#fff">O</span> satellites <b>${this.onOff(this.dotsOn)}</b> · ` +
      `<span style="color:#fff">P</span> shed dust <b>${this.onOff(this.shedOn)}</b> · ` +
      `<span style="color:#fff">U</span> pulse <b>${this.onOff(this.pulseOn)}</b> · ` +
      `<span style="color:#fff">T</span> trail <b>${this.onOff(this.trailsOn)}</b>`;
    const tune = document.createElement('div');
    tune.style.color = '#9f8fe0';
    const primaryLabel = (this.mode === 2 || this.mode === 3) ? `springK ${this.springK.toFixed(1)}`
      : this.mode === 4 ? `wobble ${this.wobbleAmp.toFixed(1)}` : `speed ${this.speed.toFixed(2)}`;
    tune.textContent =
      `Z/X ${primaryLabel} · C/V drag ${this.drag.toFixed(3)} · N/M speedCap ${this.speedCap.toFixed(2)} · [ ] count ${this.targetCount}`;
    const keys = document.createElement('div');
    keys.style.color = '#6f78c8';
    keys.textContent = 'SPACE eject ring · G grid · B bloom · R reset · WASD move · mouse aim · click/hold shoot';
    this.overlay.append(title, models, dna, tune, keys, this.statusLine);
  }

  private updateStatusLine(): void {
    this.statusLine.textContent =
      `circles ${this.circles.filter(c => c.active).length}/${this.targetCount} · motes ${this.field.count}`;
  }
}
