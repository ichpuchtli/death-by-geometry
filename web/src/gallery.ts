import { Renderer } from './renderer/sprite-batch';
import { BloomPass } from './renderer/bloom';
import { SpringMassGrid } from './renderer/grid';
import { TrailSystem } from './renderer/trails';
import { Starfield } from './renderer/starfield';
import { Vec2 } from './core/vector';
import type { InputSource } from './core/input';
import type { Bot } from './ai/bot';
import { Player } from './entities/player';
import { Wingman } from './entities/wingman';
import { Bullet } from './entities/bullet';
import { AimIndicator } from './entities/crosshair';
import { ExplosionPool } from './entities/explosion';
import { Enemy } from './entities/enemies/enemy';
import { Rhombus } from './entities/enemies/rhombus';
import { Pinwheel } from './entities/enemies/pinwheel';
import { BlackHole } from './entities/enemies/blackhole';
import { Sierpinski } from './entities/enemies/sierpinski';
import { Mandelbrot } from './entities/enemies/mandelbrot';
import { CircleEnemy } from './entities/enemies/circle';
import { Shard } from './entities/enemies/shard';
import { MiniMandel } from './entities/enemies/minimandel';
import { gameSettings } from './settings';
import { TRAIL_LENGTH_ENEMY, BLACKHOLE_PALETTE } from './config';

/**
 * Design Lab — Specimen Gallery.
 *
 * A standalone catalog page (open with `?gallery=1`) that instantiates every ship,
 * enemy, projectile, effect, and UI component and renders each in a labeled grid cell,
 * across its meaningful visual states. Intended so an AI (or human) can screenshot the
 * page and evaluate visual changes at a glance — a single frame that shows the whole
 * roster instead of having to play the game to see each thing.
 *
 * Toggles (also on `window.gallery`): Space pause, G grid, B bloom, L labels, S starfield.
 */

interface Specimen {
  label: string;
  pass: 'normal' | 'additive';
  /** Position the specimen's world anchor (called once by layout). */
  setPos(x: number, y: number): void;
  render(r: Renderer): void;
  /** Optional per-frame animation. */
  update?(dt: number): void;
  // Filled in by layout:
  worldX: number;
  worldY: number;
}

interface Category {
  title: string;
  items: Specimen[];
  headerWorldY: number;
}

const COLS = 6;
const CELL_W = 175;
const CELL_H = 172;
const HEADER_H = 104;

// A stub input so a Player can be constructed for display without a live DOM input.
const stubInput: InputSource = {
  getMovementDir: () => new Vec2(0, 0),
  updateAimFromPlayer: () => {},
  getAimAngle: () => 0,
  isMouseDown: () => false,
  isTimeDilationHeld: () => false,
};

export class Gallery {
  private renderer: Renderer;
  private bloom: BloomPass;
  private grid: SpringMassGrid;
  private trails: TrailSystem;
  private starfield: Starfield;

  private categories: Category[] = [];
  private totalTime = 0;
  private target = new Vec2(0, 600); // fake "player" for enemy AI (re-pinned each frame anyway)

  // Public toggles (also driven by keys / window.gallery)
  paused = false;
  gridOn = false; // off by default for a clean catalog; press G to show the reactive grid
  bloomOn = true;
  starfieldOn = true;
  labelsOn = true;

  private labelRoot: HTMLDivElement;
  private maxUsedCols = 1;
  private totalWorldH = CELL_H;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    const gl = this.renderer.getGL();
    this.bloom = new BloomPass(gl);
    this.bloom.threshold = gameSettings.bloomThreshold;
    this.bloom.intensity = gameSettings.bloomIntensity;
    this.bloom.blurPasses = gameSettings.bloomBlurPasses;
    this.bloom.blurRadius = gameSettings.bloomBlurRadius;
    this.grid = new SpringMassGrid(gl, false);
    this.grid.rebuild(gameSettings.arenaWidth, gameSettings.arenaHeight, gameSettings.gridSpacing);
    this.trails = new TrailSystem();
    this.starfield = new Starfield(140, gameSettings.arenaWidth, gameSettings.arenaHeight);

    this.labelRoot = document.createElement('div');
    this.labelRoot.id = 'gallery-labels';
    this.labelRoot.style.cssText =
      'position:fixed;inset:0;pointer-events:none;font-family:monospace;z-index:20;';
    document.body.appendChild(this.labelRoot);

    this.buildSpecimens();
    this.layout();

    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.layout();
    });
    window.addEventListener('keydown', (e) => this.onKeyDown(e.code));
  }

  // ============================================================
  // Specimen construction
  // ============================================================

  /** Build a display specimen backed by an Enemy instance (re-pinned in place each frame). */
  private enemySpec(label: string, e: Enemy, animate = true): Specimen {
    e.active = true;
    e.spawnTimer = 0;
    const home = new Vec2();
    return {
      label,
      pass: 'normal',
      worldX: 0,
      worldY: 0,
      setPos: (x, y) => { home.set(x, y); e.position.set(x, y); },
      render: (r) => e.render(r),
      update: animate
        ? (dt) => {
            (e as unknown as { update(dt: number, p?: Vec2): void }).update(dt, this.target);
            e.position.copyFrom(home);
            e.spawnTimer = 0;
          }
        : undefined,
    };
  }

  /** Enemy specimen that loops its warp-in spawn animation. */
  private spawningSpec(label: string, e: Enemy): Specimen {
    e.active = true;
    e.spawnTimer = e.spawnDuration;
    const home = new Vec2();
    return {
      label,
      pass: 'normal',
      worldX: 0,
      worldY: 0,
      setPos: (x, y) => { home.set(x, y); e.position.set(x, y); },
      render: (r) => e.render(r),
      update: (dt) => {
        e.position.copyFrom(home);
        e.spawnTimer -= dt / 1000;
        if (e.spawnTimer <= 0) e.spawnTimer = e.spawnDuration; // loop
      },
    };
  }

  private buildSpecimens(): void {
    // --- Ships ---
    const playerIdle = new Player(stubInput);
    playerIdle.active = true; playerIdle.invulnTimer = 0; playerIdle.facingAngle = 0; playerIdle.aimAngle = 0;
    const homeP1 = new Vec2();

    const playerFire = new Player(stubInput);
    playerFire.active = true; playerFire.invulnTimer = 0; playerFire.facingAngle = 0; playerFire.aimAngle = 0;
    playerFire.kickRecoil(6); // full recoil + muzzle flash pose (never decays; no update() here)
    const homeP2 = new Vec2();

    const wingman = new Wingman({} as unknown as Bot); // bot only used when updating; we just render
    wingman.active = true; wingman.facingAngle = 0; wingman.aimAngle = 0;
    const homeW = new Vec2();

    const ships: Specimen[] = [
      {
        label: 'Player', pass: 'normal', worldX: 0, worldY: 0,
        setPos: (x, y) => { homeP1.set(x, y); playerIdle.position.set(x, y); },
        render: (r) => playerIdle.render(r),
      },
      {
        label: 'Player — firing', pass: 'normal', worldX: 0, worldY: 0,
        setPos: (x, y) => { homeP2.set(x, y); playerFire.position.set(x, y); },
        render: (r) => { playerFire.kickRecoil(6); playerFire.render(r); },
      },
      {
        label: 'Wingman', pass: 'normal', worldX: 0, worldY: 0,
        setPos: (x, y) => { homeW.set(x, y); wingman.position.set(x, y); },
        render: (r) => wingman.render(r),
      },
    ];

    // --- Tier 1 enemies (trackers / bouncers). ★ = elite ---
    const tier1: Specimen[] = [
      this.enemySpec('Rhombus', new Rhombus()),
      this.enemySpec('Rhombus ★', this.elite(new Rhombus())),
      this.enemySpec('Pinwheel', new Pinwheel()),
      this.enemySpec('Pinwheel ★', this.elite(new Pinwheel())),
    ];

    // --- Swarm / children ---
    const swarm: Specimen[] = [
      this.enemySpec('Circle r10', new CircleEnemy(new Vec2(), 10)),
      this.enemySpec('Circle r16', new CircleEnemy(new Vec2(), 16)),
      this.enemySpec('Shard', new Shard(new Vec2())),
      this.enemySpec('MiniMandel', new MiniMandel(new Vec2())),
    ];

    // --- Fractal / boss ---
    const fractal: Specimen[] = [
      this.enemySpec('Sierpinski T0', new Sierpinski(0, new Vec2())),
      this.enemySpec('Sierpinski T1', new Sierpinski(1, new Vec2())),
      this.enemySpec('Sierpinski T2', new Sierpinski(2, new Vec2())),
      this.enemySpec('Sierpinski ★', this.elite(new Sierpinski(0, new Vec2()))),
      this.enemySpec('Mandelbrot', new Mandelbrot()),
    ];

    // --- BlackHole variants ---
    const bhDense = new BlackHole(); bhDense.visualMode = 'dense';
    const bhHaze = new BlackHole(); bhHaze.visualMode = 'haze';
    const bhCorona = new BlackHole(); bhCorona.visualMode = 'corona';
    const bhMolten = new BlackHole(); bhMolten.visualMode = 'molten';
    const bhFed = new BlackHole(); bhFed.visualMode = 'dense'; bhFed.absorbedCount = 7;
    bhFed.collisionRadius = 30 + 7 * 2.5;
    const bhDestab = new BlackHole(); bhDestab.visualMode = 'molten';
    bhDestab.destabilizing = true; bhDestab.destabilizeTimer = 700;

    const blackholes: Specimen[] = [
      this.enemySpec('BH dense', bhDense),
      this.enemySpec('BH haze', bhHaze),
      this.enemySpec('BH corona', bhCorona),
      this.enemySpec('BH molten', bhMolten),
      this.enemySpec('BH fed 7/12', bhFed),
      this.destabilizingSpec('BH destab.', bhDestab),
    ];

    // --- Spawn animation (looping warp-in) ---
    const spawns: Specimen[] = [
      this.spawningSpec('Spawn: Rhombus', new Rhombus()),
      this.spawningSpec('Spawn: Sierp T1', new Sierpinski(1, new Vec2())),
    ];

    // --- Projectiles, effects & components ---
    const components: Specimen[] = [
      this.bulletSpec(),
      this.crosshairSpec(),
      this.explosionSpec('Explosion kill', [0.2, 0.9, 1.0], 24, 0.6, 1.4),
      this.explosionSpec('Explosion nova', BLACKHOLE_PALETTE.swirlArm, 120, 0.9, 1.8),
      this.trailSpec(),
    ];

    this.categories = [
      { title: 'SHIPS', items: ships, headerWorldY: 0 },
      { title: 'TIER 1 — TRACKERS & BOUNCERS', items: tier1, headerWorldY: 0 },
      { title: 'SWARM & CHILDREN', items: swarm, headerWorldY: 0 },
      { title: 'FRACTAL & BOSS', items: fractal, headerWorldY: 0 },
      { title: 'BLACKHOLE VARIANTS', items: blackholes, headerWorldY: 0 },
      { title: 'SPAWN ANIMATION (looping)', items: spawns, headerWorldY: 0 },
      { title: 'PROJECTILES · EFFECTS · UI', items: components, headerWorldY: 0 },
    ];
  }

  /** Apply the elite look (brighter color + crown ring) to an enemy for display. */
  private elite(e: Enemy): Enemy {
    e.isElite = true;
    e.color = [
      Math.min(1, e.color[0] + 0.2),
      Math.min(1, e.color[1] + 0.2),
      Math.min(1, e.color[2] + 0.2),
    ];
    return e;
  }

  /** BlackHole held in its destabilize-telegraph state (timer clamped so it never overloads). */
  private destabilizingSpec(label: string, bh: BlackHole): Specimen {
    bh.active = true; bh.spawnTimer = 0;
    const home = new Vec2();
    return {
      label, pass: 'normal', worldX: 0, worldY: 0,
      setPos: (x, y) => { home.set(x, y); bh.position.set(x, y); },
      render: (r) => bh.render(r),
      update: (dt) => {
        (bh as unknown as { update(dt: number, p?: Vec2): void }).update(dt, null as unknown as Vec2);
        bh.position.copyFrom(home);
        bh.overloaded = false;
        bh.destabilizing = true;
        if (bh.destabilizeTimer > 1300) bh.destabilizeTimer = 600; // keep pulsing the warning
      },
    };
  }

  private bulletSpec(): Specimen {
    const bullets: Bullet[] = [];
    const home = new Vec2();
    // A small fan, as a shotgun blast leaves the barrel.
    const offsets = [-10, 0, 10];
    for (const off of offsets) {
      const b = new Bullet();
      b.active = true;
      b.angle = (off * Math.PI) / 180;
      bullets.push(b);
    }
    return {
      label: 'Bullets (pellet spread)', pass: 'normal', worldX: 0, worldY: 0,
      setPos: (x, y) => {
        home.set(x, y);
        bullets.forEach((b, i) => b.position.set(x - 18 + i * 18, y));
      },
      render: (r) => bullets.forEach((b) => b.render(r)),
    };
  }

  private crosshairSpec(): Specimen {
    const aim = new AimIndicator();
    const home = new Vec2();
    return {
      label: 'Crosshair (aim indicator)', pass: 'normal', worldX: 0, worldY: 0,
      setPos: (x, y) => home.set(x, y),
      render: (r) => aim.render(r, home.x, home.y, this.totalTime),
    };
  }

  private explosionSpec(
    label: string, color: [number, number, number], count: number, duration: number, speed: number,
  ): Specimen {
    const pool = new ExplosionPool();
    const home = new Vec2();
    let respawn = 0;
    return {
      label, pass: 'additive', worldX: 0, worldY: 0,
      setPos: (x, y) => home.set(x, y),
      render: (r) => pool.render(r),
      update: (dt) => {
        pool.update(dt);
        respawn -= dt;
        const anyActive = pool.explosions.some((e) => e.active);
        if (respawn <= 0 && !anyActive) {
          pool.spawn(home.x, home.y, color, count, duration, speed);
          respawn = duration * 1000 + 500;
        }
      },
    };
  }

  private trailSpec(): Specimen {
    const id = this.trails.register([0.3, 1.0, 0.6], TRAIL_LENGTH_ENEMY);
    const home = new Vec2();
    let ang = 0;
    return {
      label: 'Trail (ring buffer)', pass: 'additive', worldX: 0, worldY: 0,
      setPos: (x, y) => home.set(x, y),
      render: () => {}, // drawn by the global trails pass
      update: (dt) => {
        ang += dt * 0.004;
        this.trails.update(id, home.x + Math.cos(ang) * 34, home.y + Math.sin(ang) * 34);
      },
    };
  }

  // ============================================================
  // Layout — assign world positions + build HTML labels
  // ============================================================
  private layout(): void {
    // First pass: total height
    let totalH = 0;
    let maxCols = 1;
    for (const cat of this.categories) {
      const rows = Math.ceil(cat.items.length / COLS);
      totalH += HEADER_H + rows * CELL_H;
      maxCols = Math.max(maxCols, Math.min(COLS, cat.items.length));
    }
    totalH += CELL_H * 0.5; // reserve space for the bottom row's labels
    this.totalWorldH = totalH;
    this.maxUsedCols = maxCols;

    // Zoom-to-fit the whole grid into the viewport.
    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;
    const gridW = maxCols * CELL_W;
    const zoom = Math.min((cssW * 0.94) / gridW, (cssH * 0.9) / totalH);
    this.renderer.zoom = Math.max(0.2, zoom);
    this.renderer.resize();
    this.bloom.resize(this.renderer.canvasWidth, this.renderer.canvasHeight);

    // Second pass: assign world positions (y decreases downward from the top).
    let y = totalH / 2;
    for (const cat of this.categories) {
      y -= HEADER_H;
      cat.headerWorldY = y + HEADER_H * 0.32;
      const rows = Math.ceil(cat.items.length / COLS);
      for (let r = 0; r < rows; r++) {
        const rowY = y - CELL_H / 2 - r * CELL_H;
        const rowItems = cat.items.slice(r * COLS, r * COLS + COLS);
        for (let c = 0; c < rowItems.length; c++) {
          const x = (c - (rowItems.length - 1) / 2) * CELL_W;
          const item = rowItems[c];
          item.worldX = x;
          item.worldY = rowY;
          item.setPos(item.worldX, item.worldY);
        }
      }
      y -= rows * CELL_H;
    }

    this.buildLabels();
  }

  private worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;
    const z = this.renderer.zoom;
    return { x: wx * z + cssW / 2, y: -wy * z + cssH / 2 };
  }

  private buildLabels(): void {
    this.labelRoot.innerHTML = '';

    // Title bar
    const title = document.createElement('div');
    title.style.cssText =
      'position:absolute;left:50%;top:10px;transform:translateX(-50%);color:#20ff20;' +
      'font-size:15px;font-weight:bold;letter-spacing:2px;text-shadow:0 0 8px #20ff20;';
    title.textContent = 'DESIGN LAB — SPECIMEN GALLERY';
    this.labelRoot.appendChild(title);

    const hint = document.createElement('div');
    hint.style.cssText =
      'position:absolute;left:50%;top:32px;transform:translateX(-50%);color:#3aa;font-size:11px;';
    hint.textContent = '★ = elite   ·   Space pause · G grid · B bloom · S stars · L labels';
    this.labelRoot.appendChild(hint);

    for (const cat of this.categories) {
      const h = this.worldToScreen(0, cat.headerWorldY);
      const header = document.createElement('div');
      header.style.cssText =
        `position:absolute;left:${h.x}px;top:${h.y}px;transform:translate(-50%,-50%);` +
        'color:#ffd24a;font-size:13px;font-weight:bold;letter-spacing:2px;white-space:nowrap;' +
        'text-shadow:0 0 6px rgba(255,180,40,0.6);';
      header.textContent = `— ${cat.title} —`;
      this.labelRoot.appendChild(header);

      const cellPx = Math.max(56, CELL_W * this.renderer.zoom - 8);
      for (const item of cat.items) {
        const s = this.worldToScreen(item.worldX, item.worldY - CELL_H * 0.4);
        const lbl = document.createElement('div');
        lbl.style.cssText =
          `position:absolute;left:${s.x}px;top:${s.y}px;transform:translate(-50%,0);` +
          `color:#bfefff;font-size:10px;line-height:1.15;text-align:center;` +
          `width:${cellPx}px;word-wrap:break-word;`;
        lbl.textContent = item.label;
        this.labelRoot.appendChild(lbl);
      }
    }
  }

  // ============================================================
  // Loop
  // ============================================================
  update(dt: number): void {
    if (this.paused) return;
    this.totalTime += dt;
    for (const cat of this.categories) {
      for (const item of cat.items) item.update?.(dt);
    }
    this.grid.update(dt);
  }

  render(): void {
    this.renderer.cameraX = 0;
    this.renderer.cameraY = 0;
    this.bloom.shakeIntensity = 0;
    this.bloom.time = this.totalTime / 1000;

    const drawScene = () => {
      if (this.gridOn) {
        this.grid.render(0, 0, this.renderer.width, this.renderer.height);
      }
      this.renderer.begin(!this.gridOn); // clear here only if grid didn't
      if (this.starfieldOn) this.starfield.render(this.renderer, 0, 0);
      // Normal-blend specimens
      for (const cat of this.categories) {
        for (const item of cat.items) if (item.pass === 'normal') item.render(this.renderer);
      }
      // Additive: trails + explosions
      this.renderer.setBlendMode('additive');
      this.trails.render(this.renderer);
      for (const cat of this.categories) {
        for (const item of cat.items) if (item.pass === 'additive') item.render(this.renderer);
      }
      this.renderer.setBlendMode('normal');
      this.renderer.end();
    };

    if (this.bloomOn) {
      this.bloom.bindSceneFBO();
      drawScene();
      this.bloom.apply(this.renderer.canvasWidth, this.renderer.canvasHeight);
    } else {
      const gl = this.renderer.getGL();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.renderer.canvasWidth, this.renderer.canvasHeight);
      drawScene();
    }
  }

  private onKeyDown(code: string): void {
    switch (code) {
      case 'Space': this.paused = !this.paused; break;
      case 'KeyG': this.gridOn = !this.gridOn; break;
      case 'KeyB': this.bloomOn = !this.bloomOn; break;
      case 'KeyS': this.starfieldOn = !this.starfieldOn; break;
      case 'KeyL':
        this.labelsOn = !this.labelsOn;
        this.labelRoot.style.display = this.labelsOn ? 'block' : 'none';
        break;
    }
  }
}
