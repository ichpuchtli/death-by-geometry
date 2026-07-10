import { Renderer } from './renderer/sprite-batch';
import { BloomPass } from './renderer/bloom';
import { SpringMassGrid } from './renderer/grid';
import { TrailSystem } from './renderer/trails';
import { Starfield } from './renderer/starfield';
import { ParticleField, FieldAttractor, FieldView } from './renderer/particle-field';
import { Camera } from './core/camera';
import { Input } from './core/input';
import { AudioManager } from './core/audio';
import { Player } from './entities/player';
import { BulletPool } from './entities/bullet';
import { AimIndicator } from './entities/crosshair';
import { ExplosionPool } from './entities/explosion';
import { Enemy } from './entities/enemies/enemy';
import { BlackHole } from './entities/enemies/blackhole';
import { Rhombus } from './entities/enemies/rhombus';
import { Vec2 } from './core/vector';
import { gameSettings } from './settings';
import { TRAIL_LENGTH_ENEMY, BH_CORE_RADIUS_FRACTION, BH_CORE_PULL_MULT } from './config';

const RHOMBUS_SPAWN_INTERVAL = 420; // ms
const MAX_RHOMBUSES = 34;
const WAVE_COUNT = 16;

/** Convert an RGB triplet (0..1) to an HSL hue in degrees. */
function rgbToHue(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/**
 * Particle Lab (`?particles=1`) — a playable sandbox for the ambient-dust aesthetic
 * borrowed from the gravity-sandbox demo, plus three companion particle effects.
 * Fly the real ship around a BlackHole and a rhombus trickle and toggle/tune each
 * effect live, then port the winners into the game.
 *
 * Effects (number keys toggle):
 *   1 · Ambient dust field — motes that orbit + streak into the BlackHole (A)
 *   2 · Swirl on gravity — rhombuses spiral in instead of falling straight (B)
 *   3 · Thruster wake — dust kicked out behind the ship as it moves (C)
 *   4 · Impact sparklets — a puff of sparks on every bullet hit (D)
 *
 * Tuning keys: Q/W dust density · A/S dust orbit swirl · Z/X gravity swirl ·
 *   E/D streak length · G grid · B bloom · R reset.
 */
export class ParticleLab {
  private renderer: Renderer;
  private bloom: BloomPass;
  private grid: SpringMassGrid;
  private trails: TrailSystem;
  private starfield: Starfield;
  private field: ParticleField;
  private camera: Camera;
  private input: Input;
  private audio: AudioManager;
  private player: Player;
  private bullets: BulletPool;
  private crosshair: AimIndicator;
  private explosions: ExplosionPool;

  enemies: Enemy[] = [];
  bh: BlackHole | null = null;

  // Effect toggles (exposed for test hooks)
  dustOn = true;
  swirlOn = true;
  thrusterOn = true;
  sparkletsOn = true;
  gridOn = true;
  bloomOn = true;

  // Tunables
  dustPull = 2000;        // BlackHole strength as seen by the dust field
  gravitySwirl = 1.0;     // tangential gravity on enemies (fraction of radial pull)

  private baseBloom = 1;
  private rhombusTimer = 400;
  private totalTime = 0;
  private prevPlayerX = 0;
  private prevPlayerY = 0;
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
    this.trails = new TrailSystem();
    this.starfield = new Starfield(90, gameSettings.arenaWidth, gameSettings.arenaHeight);
    this.field = new ParticleField();
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
    this.overlay.id = 'particle-lab-overlay';
    this.overlay.style.cssText =
      'position:fixed;top:10px;left:12px;z-index:20;pointer-events:none;' +
      'font-family:monospace;color:#c9b8ff;text-shadow:0 0 6px rgba(150,120,255,0.6);font-size:12px;line-height:1.5;';
    this.statusLine = document.createElement('div');
    this.statusLine.style.cssText = 'margin-top:4px;color:#9fe8ff;';
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
    for (const e of this.enemies) {
      if (e.trailId >= 0) this.trails.unregister(e.trailId);
    }
    this.enemies = [];
    this.trails.clear();
    this.bullets.clear();
    this.explosions.clear();
    this.field.reseed();
    this.rhombusTimer = 400;

    this.player.reset();
    this.player.position.set(-gameSettings.arenaWidth * 0.28, 0);
    this.prevPlayerX = this.player.position.x;
    this.prevPlayerY = this.player.position.y;
    this.camera.snapTo(this.player.position);

    const bh = new BlackHole();
    bh.position.set(0, 0);
    bh.active = true;
    bh.spawnTimer = 0;
    bh.trailId = this.trails.register(bh.color, TRAIL_LENGTH_ENEMY);
    this.enemies.push(bh);
    this.bh = bh;
    this.grid.applyImpulse(0, 0, -800, 350);

    // Seed a ring of enemies at the well's rim so there's something interacting
    // with the hole the instant the lab opens.
    this.spawnWave();

    this.rebuildOverlay();
  }

  private onKeyDown(code: string): void {
    switch (code) {
      case 'Digit1': this.dustOn = !this.dustOn; break;
      case 'Digit2': this.swirlOn = !this.swirlOn; break;
      case 'Digit3': this.thrusterOn = !this.thrusterOn; break;
      case 'Digit4': this.sparkletsOn = !this.sparkletsOn; break;
      case 'KeyQ': this.field.density = Math.max(60, this.field.density - 80); this.field.reseed(); break;
      case 'KeyW': this.field.density = Math.min(1400, this.field.density + 80); this.field.reseed(); break;
      case 'KeyA': this.field.swirl = Math.max(0, +(this.field.swirl - 0.1).toFixed(2)); break;
      case 'KeyS': this.field.swirl = Math.min(2.5, +(this.field.swirl + 0.1).toFixed(2)); break;
      case 'KeyZ': this.gravitySwirl = Math.max(0, +(this.gravitySwirl - 0.15).toFixed(2)); break;
      case 'KeyX': this.gravitySwirl = Math.min(3, +(this.gravitySwirl + 0.15).toFixed(2)); break;
      case 'KeyE': this.field.streak = Math.max(0.5, +(this.field.streak - 0.3).toFixed(2)); break;
      case 'KeyD': this.field.streak = Math.min(6, +(this.field.streak + 0.3).toFixed(2)); break;
      case 'KeyG': this.gridOn = !this.gridOn; break;
      case 'KeyB': this.bloomOn = !this.bloomOn; break;
      case 'Space': this.spawnWave(); break;
      case 'KeyR': this.reset(); break;
      default: return;
    }
    this.rebuildOverlay();
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

    // Player + shooting
    this.player.update(dt);
    this.tetherPlayerToHole();
    const shots = this.player.tryShoot();
    if (shots) {
      for (const angle of shots) {
        this.bullets.spawn(this.player.position.x, this.player.position.y, angle);
      }
      this.audio.playShoot(shots.length);
      this.player.kickRecoil(shots.length);
    }
    this.bullets.update(dt);

    // (C) Thruster wake — kick dust out behind the ship as it moves
    if (this.thrusterOn) this.emitThrusterWake();
    this.prevPlayerX = this.player.position.x;
    this.prevPlayerY = this.player.position.y;

    // Rhombus pressure: constant trickle tracking the player
    this.rhombusTimer -= dt;
    if (this.rhombusTimer <= 0) {
      this.rhombusTimer = RHOMBUS_SPAWN_INTERVAL;
      const n = this.enemies.filter(e => e.active && e instanceof Rhombus).length;
      if (n < MAX_RHOMBUSES) this.spawnRhombus();
    }

    // Enemy AI
    for (const e of this.enemies) {
      if (!e.active) continue;
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
    this.applyPlayerPull(dt);
    this.handleBulletHits();
    this.handlePlayerContact();

    // Dust field reacts to the BlackHole(s)
    const attractors = this.buildAttractors();
    this.field.update(dt, attractors, this.view());

    // Grid gravity well
    const bh = this.bh;
    if (bh && bh.active && !bh.isSpawning) {
      const mass = -(gameSettings.bhGridMassBase + bh.absorbedCount * gameSettings.bhGridMassPerAbsorb) * bh.breathMassMultiplier;
      this.grid.applyGravityWell(bh.position.x, bh.position.y, mass, BlackHole.ATTRACT_RADIUS * gameSettings.bhGridRadiusMultiplier);
    }

    this.explosions.update(dt);
    this.grid.update(dt);
    this.camera.follow(this.player.position);
    this.camera.updateShake(dt);

    this.enemies = this.enemies.filter(e => {
      if (!e.active && e.trailId >= 0) this.trails.unregister(e.trailId);
      return e.active;
    });

    this.updateStatusLine();
  }

  /** Keep the ship within a screen-sized box around the BlackHole so the hole — and
   *  everything spawning at / spiralling into it — stays on screen. Without this you can
   *  fly away, the hole leaves the view, and it looks like nothing is spawning. */
  private tetherPlayerToHole(): void {
    const bh = this.bh;
    if (!bh) return;
    const mx = this.renderer.width / 2 - 90;
    const my = this.renderer.height / 2 - 90;
    const p = this.player.position;
    p.x = Math.max(bh.position.x - mx, Math.min(bh.position.x + mx, p.x));
    p.y = Math.max(bh.position.y - my, Math.min(bh.position.y + my, p.y));
  }

  private view(): FieldView {
    return {
      cx: this.camera.renderX,
      cy: this.camera.renderY,
      halfW: this.renderer.width / 2,
      halfH: this.renderer.height / 2,
    };
  }

  private buildAttractors(): FieldAttractor[] {
    const list: FieldAttractor[] = [];
    for (const e of this.enemies) {
      if (!e.active || e.isSpawning || !(e instanceof BlackHole)) continue;
      list.push({
        x: e.position.x,
        y: e.position.y,
        strength: this.dustPull * (1 + e.absorbedCount * 0.12),
        radius: BlackHole.ATTRACT_RADIUS * 1.7,
      });
    }
    return list;
  }

  private emitThrusterWake(): void {
    const dx = this.player.position.x - this.prevPlayerX;
    const dy = this.player.position.y - this.prevPlayerY;
    const moved = Math.hypot(dx, dy);
    if (moved < 0.4) return;
    const behind = Math.atan2(-dy, -dx);
    // Emit from the rear of the ship
    const rx = this.player.position.x - (dx / moved) * 14;
    const ry = this.player.position.y - (dy / moved) * 14;
    this.field.spawnBurst(rx, ry, behind, 0.7, 2, 2.2 + moved * 0.3, 190, 0.55);
  }

  /** Spawn a rhombus somewhere on the BlackHole's gravity-well rim so it immediately
   *  falls/spirals in — the whole point is watching the interaction. */
  private spawnRhombus(angle = Math.random() * Math.PI * 2, radiusFrac = 0.55 + Math.random() * 0.4): void {
    const cx = this.bh ? this.bh.position.x : 0;
    const cy = this.bh ? this.bh.position.y : 0;
    const r = BlackHole.ATTRACT_RADIUS * radiusFrac;
    const e = new Rhombus();
    e.position.set(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    e.active = true;
    e.spawnTimer = 0.35;
    e.spawnDuration = 0.35;
    e.trailId = this.trails.register(e.color, TRAIL_LENGTH_ENEMY);
    this.enemies.push(e);
  }

  /** Drop a full ring of rhombuses around the well at once — watch them spiral in together. */
  private spawnWave(): void {
    for (let i = 0; i < WAVE_COUNT; i++) {
      this.spawnRhombus((i / WAVE_COUNT) * Math.PI * 2, 0.72);
    }
  }

  /** (B) Enemy gravity with an optional tangential swirl so rhombuses spiral in. */
  private applyGravity(dt: number): void {
    const bh = this.bh;
    if (!bh || !bh.active || bh.isSpawning) return;
    const attractR = BlackHole.ATTRACT_RADIUS;
    const attractR2 = attractR * attractR;
    const coreR = attractR * BH_CORE_RADIUS_FRACTION;
    const absorbR2 = (bh.collisionRadius + 10) * (bh.collisionRadius + 10);

    for (const e of this.enemies) {
      if (!e.active || e.isSpawning || e === bh || e instanceof BlackHole || e.gravityImmune) continue;
      const dx = bh.position.x - e.position.x;
      const dy = bh.position.y - e.position.y;
      const dist2 = dx * dx + dy * dy;

      if (dist2 < absorbR2) {
        e.active = false;
        if (bh.absorbedCount < BlackHole.MAX_ABSORB) bh.absorbEnemy();
        this.explosions.spawn(e.position.x, e.position.y, e.color, 12, 0.5);
        this.grid.applyImpulse(e.position.x, e.position.y, -20, 120);
        continue;
      }

      if (dist2 < attractR2 && dist2 > 1) {
        const dist = Math.sqrt(dist2);
        // Inescapable core (matches production): pull ×mult inside coreR so trackers
        // get captured instead of escaping toward the player.
        const pull = dist < coreR ? BlackHole.GRAVITY_STRENGTH * BH_CORE_PULL_MULT : BlackHole.GRAVITY_STRENGTH;
        const force = pull * dt / dist;
        const nx = dx / dist;
        const ny = dy / dist;
        e.position.x += nx * force;
        e.position.y += ny * force;
        // Tangential swirl → the "orbit" instead of straight infall
        if (this.swirlOn && this.gravitySwirl > 0) {
          const tang = force * this.gravitySwirl;
          e.position.x += -ny * tang;
          e.position.y += nx * tang;
        }
      }
    }

    // Bullet bending (kept so shots curve visibly near the hole)
    for (const b of this.bullets.bullets) {
      if (!b.active) continue;
      const bdx = bh.position.x - b.position.x;
      const bdy = bh.position.y - b.position.y;
      const bdist2 = bdx * bdx + bdy * bdy;
      if (bdist2 >= attractR2 || bdist2 < 1) continue;
      const bdist = Math.sqrt(bdist2);
      const force = 0.45 * dt / bdist;
      b.velocity.x += bdx / bdist * force;
      b.velocity.y += bdy / bdist * force;
      b.angle = Math.atan2(b.velocity.y, b.velocity.x);
    }
  }

  private applyPlayerPull(dt: number): void {
    const bh = this.bh;
    if (!bh || !bh.active || bh.isSpawning) return;
    const dx = bh.position.x - this.player.position.x;
    const dy = bh.position.y - this.player.position.y;
    const dist2 = dx * dx + dy * dy;
    const attractR = BlackHole.ATTRACT_RADIUS;
    if (dist2 >= attractR * attractR || dist2 <= 1) return;
    const dist = Math.sqrt(dist2);
    const core = dist < attractR * BH_CORE_RADIUS_FRACTION ? BH_CORE_PULL_MULT : 1;
    const force = gameSettings.bhPlayerPull * core * (1 + bh.absorbedCount * 0.08) * dt / dist;
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
          e.onBulletHit(b.angle);
          // (D) sparks off the event horizon
          if (this.sparkletsOn) {
            this.field.spawnBurst(b.position.x, b.position.y, b.angle, 1.6, 6, 3.5, 275, 0.4);
          }
        } else if (e.hit()) {
          e.active = false;
          this.explosions.spawn(e.position.x, e.position.y, e.color, 12, 0.5, 1, b.angle);
        }

        // (D) Impact sparklets — a forward puff carrying the bullet's momentum
        if (this.sparkletsOn && !(e instanceof BlackHole)) {
          const hue = rgbToHue(e.color[0], e.color[1], e.color[2]);
          this.field.spawnBurst(b.position.x, b.position.y, b.angle, 1.1, 7, 4.5, hue, 0.45);
        }
        break;
      }
    }
  }

  private handlePlayerContact(): void {
    for (const e of this.enemies) {
      if (!e.active || e.isSpawning || e instanceof BlackHole) continue;
      const dx = e.position.x - this.player.position.x;
      const dy = e.position.y - this.player.position.y;
      const r = e.collisionRadius + this.player.collisionRadius;
      if (dx * dx + dy * dy < r * r) {
        e.active = false;
        this.explosions.spawn(e.position.x, e.position.y, [1, 0.3, 0.2], 16, 0.5);
        this.camera.shake(0.3);
      }
    }
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

    this.renderer.begin(false);
    this.renderArenaBorder();
    for (const e of this.enemies) e.render(this.renderer);
    this.player.render(this.renderer);
    this.bullets.render(this.renderer);
    const mouse = this.input.getMouseWorldPos();
    this.crosshair.render(this.renderer, mouse.x, mouse.y, this.totalTime);
    this.renderer.end();

    // Additive glow pass: dust field, trails, explosions
    this.renderer.begin(false);
    this.renderer.setBlendMode('additive');
    if (this.dustOn) this.field.render(this.renderer);
    this.trails.render(this.renderer);
    this.explosions.render(this.renderer);
    this.renderer.setBlendMode('normal');
    this.renderer.end();

    // Bloom toggle: zero the intensity to composite the raw scene (keeps the same
    // scene-FBO → screen path, so there's no separate blit to maintain).
    this.bloom.intensity = this.bloomOn ? this.baseBloom : 0;
    this.bloom.apply(this.renderer.canvasWidth, this.renderer.canvasHeight);
  }

  private renderArenaBorder(): void {
    const hw = gameSettings.arenaWidth / 2;
    const hh = gameSettings.arenaHeight / 2;
    this.renderer.drawLine(-hw, -hh, hw, -hh, 0.3, 0.2, 0.7, 0.5);
    this.renderer.drawLine(hw, -hh, hw, hh, 0.3, 0.2, 0.7, 0.5);
    this.renderer.drawLine(hw, hh, -hw, hh, 0.3, 0.2, 0.7, 0.5);
    this.renderer.drawLine(-hw, hh, -hw, -hh, 0.3, 0.2, 0.7, 0.5);
  }

  // ============================================================
  // Overlay
  // ============================================================
  private onOff(v: boolean): string { return v ? 'ON' : 'off'; }

  private rebuildOverlay(): void {
    this.overlay.innerHTML = '';
    const title = document.createElement('div');
    title.style.cssText = 'font-size:15px;font-weight:bold;color:#fff;';
    title.textContent = 'PARTICLE LAB — cosmic dust + swirl';
    const effects = document.createElement('div');
    effects.innerHTML =
      `<span style="color:#fff">1</span> dust field <b>${this.onOff(this.dustOn)}</b> · ` +
      `<span style="color:#fff">2</span> gravity swirl <b>${this.onOff(this.swirlOn)}</b> · ` +
      `<span style="color:#fff">3</span> thruster wake <b>${this.onOff(this.thrusterOn)}</b> · ` +
      `<span style="color:#fff">4</span> impact sparklets <b>${this.onOff(this.sparkletsOn)}</b>`;
    const tune = document.createElement('div');
    tune.style.color = '#9f8fe0';
    tune.textContent =
      `density ${this.field.density} (Q/W) · dust swirl ${this.field.swirl.toFixed(2)} (A/S) · ` +
      `gravity swirl ${this.gravitySwirl.toFixed(2)} (Z/X) · streak ${this.field.streak.toFixed(1)} (E/D)`;
    const keys = document.createElement('div');
    keys.style.color = '#6f78c8';
    keys.textContent = 'SPACE spawn enemy wave · G grid · B bloom · R reset · WASD move · mouse aim · click/hold shoot';
    this.overlay.append(title, effects, tune, keys, this.statusLine);
  }

  private updateStatusLine(): void {
    const bh = this.bh;
    const mass = bh && bh.active ? bh.absorbedCount : 0;
    this.statusLine.textContent = `motes ${this.field.count} · absorbed ${mass} · enemies ${this.enemies.filter(e => e.active).length}`;
  }
}
