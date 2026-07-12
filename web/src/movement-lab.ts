import { Renderer } from './renderer/sprite-batch';
import { BloomPass } from './renderer/bloom';
import { SpringMassGrid } from './renderer/grid';
import { Starfield } from './renderer/starfield';
import { Camera } from './core/camera';
import { Input } from './core/input';
import { AudioManager } from './core/audio';
import { Player } from './entities/player';
import { BulletPool } from './entities/bullet';
import { AimIndicator } from './entities/crosshair';
import { Vec2 } from './core/vector';
import { gameSettings } from './settings';

/**
 * Movement Lab (`?movement=1`) — a playable sandbox for the *feel* of the player ship's
 * WASD movement, built to make it more fluid/circular with real "movement vocabulary".
 *
 * The live game uses a rigid model: `velocity = inputDir * speed` set directly every
 * frame → zero inertia (snap to full speed, stop dead) and only 8 discrete headings, so
 * every turn is a hard corner. This lab replaces that with a **momentum** model: thrust
 * accelerates the velocity toward the input direction and **drag** bleeds it off, so the
 * ship *glides*, and changing direction while moving traces a *curve* (momentum carried
 * through the turn) — the circular, fluid feel. Optional **input smoothing** sweeps the
 * 8-way WASD heading through the in-between angles for even rounder arcs.
 *
 * A fading **breadcrumb path** visualises the actual trajectory so you can see how round
 * the turns are, and a ring of **slalom pylons** gives something to weave between.
 *
 * Feel models (number keys):
 *   1 · Momentum + drift   — responsive but fluid; curved turns, moderate glide (default)
 *   2 · Snappy + smoothed  — light inertia, quick stop; tight but softens hard corners
 *   3 · Heavy thrust       — strong inertia, long drift; floaty spaceship feel
 *
 * Tuning: Z/X accel · C/V drag · N/M top speed · I input-smoothing toggle
 * Also: T path · K pylons · G grid · B bloom · R reset · WASD move · mouse aim · click shoot
 *
 * Nothing here touches the real game — when a feel wins, port the integrator into
 * `Player.update()`.
 */

type FeelMode = 1 | 2 | 3;

interface FeelPreset {
  name: string;
  accel: number;   // thrust acceleration (px/ms² added toward input dir)
  drag: number;    // per-frame velocity retention (frame-normalized via ^f); lower = quicker stop
  top: number;     // px/ms hard speed cap
  smooth: number;  // input-direction lerp per frame (0 = raw 8-way, higher = rounder headings)
}

const PRESETS: Record<FeelMode, FeelPreset> = {
  1: { name: 'MOMENTUM + DRIFT', accel: 0.0040, drag: 0.900, top: 0.35, smooth: 0.18 },
  2: { name: 'SNAPPY + SMOOTHED', accel: 0.0120, drag: 0.750, top: 0.35, smooth: 0.35 },
  3: { name: 'HEAVY THRUST', accel: 0.0018, drag: 0.965, top: 0.45, smooth: 0.08 },
};

const PATH_MAX = 110;   // breadcrumb ring-buffer length
const PYLON_COUNT = 8;
const PYLON_RING = 340; // px radius of the slalom ring

export class MovementLab {
  private renderer: Renderer;
  private bloom: BloomPass;
  private grid: SpringMassGrid;
  private starfield: Starfield;
  private camera: Camera;
  private input: Input;
  private audio: AudioManager;
  private player: Player;
  private bullets: BulletPool;
  private crosshair: AimIndicator;

  // Movement state (lab-owned; Player is used only for render + aim + shoot housekeeping)
  mode: FeelMode = 1;
  vel = new Vec2(0, 0);
  private facing = 0;
  private smoothedDir = new Vec2(0, 0);

  // Live-tunable knobs (seeded from the current preset)
  accel = PRESETS[1].accel;
  drag = PRESETS[1].drag;
  top = PRESETS[1].top;
  smooth = PRESETS[1].smooth;
  inputSmoothOn = true;

  // Visualisation toggles
  pathOn = true;
  pylonsOn = true;
  gridOn = true;
  bloomOn = true;

  private path: { x: number; y: number }[] = [];
  private pylons: Vec2[] = [];
  private baseBloom = 1;
  private totalTime = 0;
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
    this.camera = new Camera(this.renderer.width, this.renderer.height);
    this.input = new Input(canvas);
    this.input.setCamera(this.camera);
    this.input.setZoom(this.renderer.zoom);
    this.audio = new AudioManager();
    this.player = new Player(this.input);
    this.bullets = new BulletPool();
    this.crosshair = new AimIndicator();

    for (let i = 0; i < PYLON_COUNT; i++) {
      const a = (i / PYLON_COUNT) * Math.PI * 2;
      this.pylons.push(new Vec2(Math.cos(a) * PYLON_RING, Math.sin(a) * PYLON_RING));
    }

    this.overlay = document.createElement('div');
    this.overlay.id = 'movement-lab-overlay';
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

  /** Load a feel preset into the live knobs. */
  private applyPreset(m: FeelMode): void {
    this.mode = m;
    const p = PRESETS[m];
    this.accel = p.accel;
    this.drag = p.drag;
    this.top = p.top;
    this.smooth = p.smooth;
  }

  reset(): void {
    this.applyPreset(this.mode);
    this.bullets.clear();
    this.player.reset();
    this.player.position.set(0, 0);
    this.vel.set(0, 0);
    this.smoothedDir.set(0, 0);
    this.facing = 0;
    this.path = [];
    this.camera.snapTo(this.player.position);
    this.rebuildOverlay();
  }

  // ============================================================
  // Update
  // ============================================================
  update(dt: number): void {
    this.totalTime += dt / 1000;
    const f = Math.max(0.35, Math.min(2.2, dt / 16.6667));

    // --- 1. Momentum integration (the whole point of the lab) -----------------
    const raw = this.input.getMovementDir(); // normalized 8-way (or joystick) vector

    // Optional input smoothing: sweep the heading through intermediate angles so the
    // 8-way steps become rounded arcs. When off, thrust follows the raw input directly.
    let dirX: number, dirY: number;
    if (this.inputSmoothOn) {
      const t = 1 - Math.pow(1 - this.smooth, f);
      this.smoothedDir.x += (raw.x - this.smoothedDir.x) * t;
      this.smoothedDir.y += (raw.y - this.smoothedDir.y) * t;
      dirX = this.smoothedDir.x;
      dirY = this.smoothedDir.y;
    } else {
      this.smoothedDir.set(raw.x, raw.y);
      dirX = raw.x;
      dirY = raw.y;
    }

    // Thrust toward the (smoothed) input direction...
    this.vel.x += dirX * this.accel * dt;
    this.vel.y += dirY * this.accel * dt;
    // ...drag bleeds velocity off → glide on release + momentum carried through turns.
    const dragF = Math.pow(this.drag, f);
    this.vel.x *= dragF;
    this.vel.y *= dragF;
    // Hard speed cap.
    const sp = Math.hypot(this.vel.x, this.vel.y);
    if (sp > this.top) {
      const s = this.top / sp;
      this.vel.x *= s;
      this.vel.y *= s;
    }

    // Integrate position + clamp to the arena.
    const nx = this.player.position.x + this.vel.x * dt;
    const ny = this.player.position.y + this.vel.y * dt;
    const hw = gameSettings.arenaWidth / 2;
    const hh = gameSettings.arenaHeight / 2;
    const cx = Math.max(-hw, Math.min(hw, nx));
    const cy = Math.max(-hh, Math.min(hh, ny));
    // Kill velocity into a wall so you don't stick to it.
    if (cx !== nx) this.vel.x = 0;
    if (cy !== ny) this.vel.y = 0;

    // Facing follows *actual* velocity heading (banks into the drift) when moving.
    const speed = Math.hypot(this.vel.x, this.vel.y);
    if (speed > 0.01) {
      const target = Math.atan2(this.vel.y, this.vel.x);
      const t = 1 - Math.pow(0.001, dt); // snappy but smooth facing lerp
      this.facing = lerpAngle(this.facing, target, t);
    }

    // --- 2. Drive the Player for aim + shooting housekeeping -------------------
    // Player.update() advances aim, shot timer, recoil decay (private state we need) and
    // also moves by the OLD instant model — so we sync our position in first (for accurate
    // aim), let it run, then re-assert our momentum position/velocity/facing over the top.
    this.player.position.set(cx, cy);
    this.player.velocity.set(this.vel.x, this.vel.y);
    this.player.update(dt);
    this.player.position.set(cx, cy);
    this.player.velocity.set(this.vel.x, this.vel.y);
    this.player.facingAngle = this.facing;

    // Shooting (mirrors the game: shotgun blast + recoil).
    const shots = this.player.tryShoot();
    if (shots) {
      for (const angle of shots) this.bullets.spawn(cx, cy, angle);
      if (this.audio.initialized) this.audio.playShoot(shots.length);
      this.player.kickRecoil(shots.length);
    }
    this.bullets.update(dt);

    // Grid reacts: the ship presses a dimple into the fabric that deepens with speed.
    this.grid.applyImpulse(cx, cy, -6 - speed * 26, 95);

    // Breadcrumb path — record the trajectory so its curvature is visible.
    this.path.push({ x: cx, y: cy });
    if (this.path.length > PATH_MAX) this.path.shift();

    this.grid.update(dt);
    this.camera.follow(this.player.position);
    this.camera.updateShake(dt);
    this.updateStatusLine();
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

    // Normal pass: arena border + pylons + ship + bullets + crosshair
    this.renderer.begin(false);
    this.renderArenaBorder();
    if (this.pylonsOn) this.renderPylons();
    this.player.render(this.renderer);
    this.bullets.render(this.renderer);
    const mouse = this.input.getMouseWorldPos();
    this.crosshair.render(this.renderer, mouse.x, mouse.y, this.totalTime);
    this.renderer.end();

    // Additive pass: breadcrumb path + velocity vector
    this.renderer.begin(false);
    this.renderer.setBlendMode('additive');
    if (this.pathOn) this.renderPath();
    this.renderVelocityVector();
    this.renderer.setBlendMode('normal');
    this.renderer.end();

    this.bloom.intensity = this.bloomOn ? this.baseBloom : 0;
    this.bloom.apply(this.renderer.canvasWidth, this.renderer.canvasHeight);
  }

  /** Fading trajectory trail — the key readout for "how circular are my turns". */
  private renderPath(): void {
    const n = this.path.length;
    for (let i = 1; i < n; i++) {
      const a = this.path[i - 1];
      const b = this.path[i];
      const frac = i / n; // 0 tail → 1 head
      const alpha = 0.05 + frac * 0.55;
      this.renderer.drawLine(a.x, a.y, b.x, b.y, 0.3, 0.85, 1.0, alpha);
    }
  }

  /** A short live velocity vector from the ship, so speed + heading read at a glance. */
  private renderVelocityVector(): void {
    const p = this.player.position;
    const vx = this.vel.x, vy = this.vel.y;
    const sp = Math.hypot(vx, vy);
    if (sp < 0.01) return;
    const len = 60 + (sp / this.top) * 90;
    const ux = vx / sp, uy = vy / sp;
    this.renderer.drawLine(p.x, p.y, p.x + ux * len, p.y + uy * len, 1.0, 0.9, 0.4, 0.5);
  }

  private renderPylons(): void {
    for (const py of this.pylons) {
      this.renderer.drawCircle(py.x, py.y, 16, [0.35, 0.45, 0.8], 18, 0.6);
      this.renderer.drawFilledCircle(py.x, py.y, 4, [0.5, 0.6, 1.0], 8, 0.5);
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
      case 'Digit1': this.applyPreset(1); break;
      case 'Digit2': this.applyPreset(2); break;
      case 'Digit3': this.applyPreset(3); break;
      case 'KeyI': this.inputSmoothOn = !this.inputSmoothOn; break;
      case 'KeyT': this.pathOn = !this.pathOn; break;
      case 'KeyK': this.pylonsOn = !this.pylonsOn; break;
      case 'KeyG': this.gridOn = !this.gridOn; break;
      case 'KeyB': this.bloomOn = !this.bloomOn; break;
      case 'KeyR': this.reset(); break;
      case 'KeyZ': this.accel = Math.max(0.0005, +(this.accel - 0.0004).toFixed(4)); break;
      case 'KeyX': this.accel = Math.min(0.02, +(this.accel + 0.0004).toFixed(4)); break;
      case 'KeyC': this.drag = Math.max(0.70, +(this.drag - 0.005).toFixed(3)); break;
      case 'KeyV': this.drag = Math.min(0.995, +(this.drag + 0.005).toFixed(3)); break;
      case 'KeyN': this.top = Math.max(0.15, +(this.top - 0.02).toFixed(2)); break;
      case 'KeyM': this.top = Math.min(0.9, +(this.top + 0.02).toFixed(2)); break;
      default: return;
    }
    this.rebuildOverlay();
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
    title.textContent = `MOVEMENT LAB — model ${this.mode}: ${PRESETS[this.mode].name}`;
    const models = document.createElement('div');
    models.innerHTML =
      `<span style="color:#fff">1</span> momentum+drift · ` +
      `<span style="color:#fff">2</span> snappy · ` +
      `<span style="color:#fff">3</span> heavy`;
    const tune = document.createElement('div');
    tune.style.color = '#9f8fe0';
    tune.textContent =
      `Z/X accel ${this.accel.toFixed(4)} · C/V drag ${this.drag.toFixed(3)} · N/M top ${this.top.toFixed(2)} · ` +
      `I input-smooth ${this.onOff(this.inputSmoothOn)}`;
    const view = document.createElement('div');
    view.style.color = '#7fd8ff';
    view.innerHTML =
      `<span style="color:#fff">T</span> path <b>${this.onOff(this.pathOn)}</b> · ` +
      `<span style="color:#fff">K</span> pylons <b>${this.onOff(this.pylonsOn)}</b> · ` +
      `<span style="color:#fff">G</span> grid <b>${this.onOff(this.gridOn)}</b> · ` +
      `<span style="color:#fff">B</span> bloom <b>${this.onOff(this.bloomOn)}</b>`;
    const keys = document.createElement('div');
    keys.style.color = '#6f78c8';
    keys.textContent = 'R reset · WASD move · mouse aim · click/hold shoot';
    this.overlay.append(title, models, tune, view, keys, this.statusLine);
  }

  private updateStatusLine(): void {
    const sp = Math.hypot(this.vel.x, this.vel.y);
    const pct = Math.round((sp / this.top) * 100);
    this.statusLine.textContent = `speed ${sp.toFixed(3)} px/ms (${pct}% of top)`;
  }
}

function lerpAngle(from: number, to: number, t: number): number {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}
