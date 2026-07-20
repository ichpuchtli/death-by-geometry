import { Renderer } from './renderer/sprite-batch';
import { BloomPass } from './renderer/bloom';
import { SpringMassGrid } from './renderer/grid';
import { Starfield } from './renderer/starfield';
import { gameSettings } from './settings';

/**
 * Player Design Lab v2 — open with `?player=1`.
 *
 * A standalone sandbox for redesigning the player ship and auditioning firing feedback.
 * v2 goes back to the iconic Geometry Wars "claw" (open-nose, twin-pronged angular
 * chevron) and evolves it into 8 candidates with FULLY-RENDERED hulls — faceted
 * lambert-shaded plating (light fixed in local space), glass canopies with specular
 * dots, and painted palettes — deliberately more "real" than the wireframe enemies.
 * It also prototypes two game-feel systems before porting them into the game:
 *
 *   1. Rich engine tails — twin engine emitters per ship stream a hot core trail plus
 *      sparks that peel off, curl, flicker and fade (additive). Ships fly gentle
 *      lissajous patrols (grid view) or a big figure-eight (focus view, camera follows)
 *      so the tails stream naturally.
 *   2. Bullet ↔ spacetime-fabric interaction — GRID FX wake variants part the
 *      spring-mass grid ahead of each bullet (leading bow wave + closing pull,
 *      the Geometry Wars wake) in Soft / Medium / Heavy strengths, plus Rip Trail.
 *
 * Keys:
 *   1-8  focus a single ship large (same digit / 0 → back to the grid)
 *   [ ]  prev / next fire SOUND variant (plays a sample on change)
 *   , .  prev / next MUZZLE-flash variant
 *   ; '  prev / next BULLET visual variant
 *   Z X  prev / next GRID FX variant (bullet ↔ grid interaction)
 *   F    audition current fire (sound + muzzle) on the focused ship (or ship 1 in grid)
 *   G    reactive grid   B  bloom   L  labels   Space  pause   R  reset
 *
 * `window.playerDesignLab` is exposed for tests.
 */

type RGB = [number, number, number];

interface ShipDesign {
  name: string;
  /** Vertices facing right (+x) at angle 0, roughly within x∈[-1.3,1.7], y∈[-1.2,1.2]. */
  verts: [number, number][];
  /** Leave a gap between the first & last vertex (open nose) instead of a closed loop. */
  openNose: boolean;
  /** Extra detached stroke polylines (local space) — floating shards / inner layers. */
  extra?: [number, number][][];
  /** Engine emitter offsets (local space). Default: derived from the rear vertices. */
  engines?: [number, number][];
  /** Glass canopy dome: x, y, radius (local units). */
  canopy: [number, number, number];
  line: RGB;      // bright neon trim
  line2: RGB;     // darker trim (depth)
  hull: RGB;      // base plating
  hullDark: RGB;  // facets facing away from the light
  hullLight: RGB; // facets facing the light
  hullAlpha?: number; // default 0.95
  accent: RGB; // engine glow + tail core
}

interface ShipInst {
  design: ShipDesign;
  aimAngle: number;
  heading: number;   // body rotation — follows patrol velocity
  fireTimer: number;
  flashTimer: number; // ms remaining on muzzle flash
  x: number;
  y: number;
  cx: number;        // patrol center
  cy: number;
  vx: number;        // patrol velocity (units / ms)
  vy: number;
  scale: number;
  phase: number;     // patrol phase offset
  coreAcc: number;   // tail core-emission accumulator (ms)
  sparkAcc: number;  // tail spark-emission accumulator (ms)
}

interface LabBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  life: number;
  maxLife: number;
  lastRip: number; // totalTime of last Rip Trail pulse
  color: RGB;
}

interface TailParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  spark: boolean; // false = hot core stream, true = peel-off spark
  seed: number;
  hue: RGB;
}

const SOUND_VARIANTS = [
  'Shotgun Pulse',
  'Laser Zap',
  'Plasma Bolt',
  'Arcade Pew',
  'Deep Thump',
  'Static Crackle',
] as const;

const MUZZLE_VARIANTS = ['Spike', 'Ring Pop', 'Starburst', 'Plasma Orb'] as const;
const BULLET_VARIANTS = ['Diamond', 'Bolt Streak', 'Glow Orb', 'Thin Dart'] as const;
const GRIDFX_VARIANTS = ['Off', 'Wake Soft', 'Wake', 'Wake Heavy', 'Rip Trail'] as const;
const GRIDFX_DEFAULT = 2; // 'Wake' — visible immediately on load

// ------------------------------------------------------------------
// The 8 candidate ship silhouettes — all evolutions of the Geometry Wars
// "claw": open (or nearly-open) nose, twin forward prongs, angular neon
// vector look, symmetric about the x-axis. Distinct neon hues so they're
// easy to tell apart; a port would recolor the pick to player-green.
// ------------------------------------------------------------------
const DESIGNS: ShipDesign[] = [
  {
    // Faithful homage to the original GW claw: smooth twin prongs off a keel notch.
    name: 'Claw Prime',
    verts: [
      [1.50, 0.50], [0.75, 0.72], [0.0, 0.78], [-0.65, 0.55], [-1.05, 0.28],
      [-0.55, 0.0],
      [-1.05, -0.28], [-0.65, -0.55], [0.0, -0.78], [0.75, -0.72], [1.50, -0.50],
    ],
    openNose: true,
    canopy: [0.35, 0, 0.16],
    line: [0.8, 1.0, 0.95], line2: [0.35, 0.55, 0.5],
    hull: [0.6, 0.66, 0.72], hullDark: [0.16, 0.2, 0.27], hullLight: [0.95, 1.0, 1.0],
    accent: [1.0, 1.0, 0.9],
  },
  {
    // Serrated talon: sawtooth kinks along the outer edge of each prong.
    name: 'Talon',
    verts: [
      [1.45, 0.55], [0.9, 0.85], [0.45, 0.62], [-0.05, 0.9], [-0.45, 0.6],
      [-0.85, 0.85], [-1.15, 0.45], [-0.7, 0.15], [-0.4, 0.0],
      [-0.7, -0.15], [-1.15, -0.45], [-0.85, -0.85], [-0.45, -0.6],
      [-0.05, -0.9], [0.45, -0.62], [0.9, -0.85], [1.45, -0.55],
    ],
    openNose: true,
    canopy: [0.3, 0, 0.15],
    line: [1.0, 0.6, 0.15], line2: [0.55, 0.3, 0.05],
    hull: [0.5, 0.25, 0.09], hullDark: [0.14, 0.06, 0.03], hullLight: [1.0, 0.6, 0.24],
    accent: [1.0, 0.9, 0.6],
  },
  {
    // Long swept scythe: extended nose blades, prongs sweeping back to wingtips.
    name: 'Scythe',
    verts: [
      [1.70, 0.30], [0.7, 0.42], [-0.3, 0.72], [-1.0, 0.95], [-1.25, 0.6],
      [-0.6, 0.2], [-0.35, 0.0],
      [-0.6, -0.2], [-1.25, -0.6], [-1.0, -0.95], [-0.3, -0.72], [0.7, -0.42], [1.70, -0.30],
    ],
    openNose: true,
    canopy: [0.35, 0, 0.14],
    line: [0.7, 0.45, 1.0], line2: [0.32, 0.18, 0.55],
    hull: [0.32, 0.2, 0.52], hullDark: [0.09, 0.05, 0.19], hullLight: [0.72, 0.58, 1.0],
    accent: [0.9, 0.85, 1.0],
  },
  {
    // Wide twin-fang mantis: broad stance, nearly straight fangs.
    name: 'Mantis',
    verts: [
      [1.55, 0.85], [0.8, 1.05], [-0.2, 1.1], [-0.9, 0.85], [-0.55, 0.4], [-0.95, 0.0],
      [-0.55, -0.4], [-0.9, -0.85], [-0.2, -1.1], [0.8, -1.05], [1.55, -0.85],
    ],
    openNose: true,
    canopy: [0.3, 0, 0.17],
    line: [0.35, 1.0, 0.4], line2: [0.12, 0.5, 0.15],
    hull: [0.14, 0.42, 0.18], hullDark: [0.03, 0.13, 0.05], hullLight: [0.42, 1.0, 0.48],
    accent: [0.8, 1.0, 0.8],
  },
  {
    // Splinter: claw with detached, floating prong-tip shards (very Geometry Wars).
    name: 'Splinter',
    verts: [
      [1.05, 0.42], [0.4, 0.66], [-0.4, 0.6], [-1.0, 0.3], [-0.55, 0.0],
      [-1.0, -0.3], [-0.4, -0.6], [0.4, -0.66], [1.05, -0.42],
    ],
    openNose: true,
    extra: [
      [[1.28, 0.46], [1.58, 0.56], [1.36, 0.33]],
      [[1.28, -0.46], [1.58, -0.56], [1.36, -0.33]],
    ],
    canopy: [0.15, 0, 0.15],
    line: [1.0, 0.4, 0.95], line2: [0.5, 0.12, 0.48],
    hull: [0.45, 0.14, 0.42], hullDark: [0.13, 0.03, 0.13], hullLight: [1.0, 0.48, 0.95],
    accent: [1.0, 0.8, 1.0],
  },
  {
    // Reaver: layered double chevron — a full inner claw nested inside the outer one.
    name: 'Reaver',
    verts: [
      [1.5, 0.6], [0.5, 0.9], [-0.5, 0.75], [-1.1, 0.35], [-0.6, 0.0],
      [-1.1, -0.35], [-0.5, -0.75], [0.5, -0.9], [1.5, -0.6],
    ],
    openNose: true,
    extra: [
      [
        [1.05, 0.38], [0.35, 0.58], [-0.35, 0.48], [-0.72, 0.22], [-0.38, 0.0],
        [-0.72, -0.22], [-0.35, -0.48], [0.35, -0.58], [1.05, -0.38],
      ],
    ],
    canopy: [0.3, 0, 0.16],
    line: [1.0, 0.3, 0.3], line2: [0.55, 0.1, 0.1],
    hull: [0.48, 0.1, 0.1], hullDark: [0.14, 0.02, 0.02], hullLight: [1.0, 0.4, 0.36],
    accent: [1.0, 0.75, 0.7],
  },
  {
    // Ghost Claw: minimal thin outline, few sharp verts, translucent ice-glass hull.
    name: 'Ghost Claw',
    verts: [
      [1.35, 0.62], [-0.1, 0.8], [-0.95, 0.38], [-0.45, 0.0],
      [-0.95, -0.38], [-0.1, -0.8], [1.35, -0.62],
    ],
    openNose: true,
    canopy: [0.25, 0, 0.14],
    line: [0.65, 0.85, 1.0], line2: [0.25, 0.38, 0.5],
    hull: [0.34, 0.48, 0.6], hullDark: [0.09, 0.15, 0.21], hullLight: [0.78, 0.9, 1.0],
    hullAlpha: 0.45,
    accent: [0.85, 0.95, 1.0],
  },
  {
    // Bastion: heavy armored claw — blunt prongs, thick fill, armor strakes + keel plate.
    name: 'Bastion',
    verts: [
      [1.30, 0.45], [0.55, 0.7], [-0.25, 0.95], [-0.95, 1.0], [-1.30, 0.55],
      [-1.0, 0.2], [-0.7, 0.0],
      [-1.0, -0.2], [-1.30, -0.55], [-0.95, -1.0], [-0.25, -0.95], [0.55, -0.7], [1.30, -0.45],
    ],
    openNose: true,
    extra: [
      [[0.4, 0.64], [0.12, 0.86]],
      [[-0.5, 0.82], [-0.78, 0.97]],
      [[0.4, -0.64], [0.12, -0.86]],
      [[-0.5, -0.82], [-0.78, -0.97]],
      [[-1.05, 0.32], [-1.32, 0.0], [-1.05, -0.32]], // rear keel plate
    ],
    engines: [[-1.05, 0.32], [-1.05, -0.32]],
    canopy: [0.2, 0, 0.18],
    line: [1.0, 0.85, 0.25], line2: [0.55, 0.45, 0.08],
    hull: [0.42, 0.35, 0.16], hullDark: [0.13, 0.1, 0.04], hullLight: [1.0, 0.84, 0.38],
    accent: [1.0, 1.0, 0.7],
  },
];

const COLS = 4;
const CELL_W = 230;
const CELL_H = 220;
const GRID_SCALE = 46;   // ship scale in grid cells
const FOCUS_SCALE = 120; // ship scale when a single one is focused
const FIRE_PELLET_OFFSETS = [-8, 0, 8]; // degrees — lab always fires a 3-pellet fan
const MAX_TAIL_PARTICLES = 2400;

// Wake tuning (per live bullet, applied every frame unless noted). A wake is a
// LEADING bow wave — a push impulse ahead of the bullet that parts the fabric —
// plus a gentler inward pull behind it that closes the V (the Geometry Wars look).
// The bow also queues a NEGATIVE gravity well: it feeds the spacetime-fabric
// shader, which is what makes the bulge really read on screen.
interface WakeCfg {
  lead: number; leadRadius: number;   // bow-wave push impulse, ahead of the bullet
  well: number; wellRadius: number;   // shader bulge at the bow (negative = push out)
  trail: number; trailRadius: number; // inward pull closing the wake behind
  aheadMs: number; behindMs: number;  // offsets along the velocity vector
}
const FX_WAKE_SOFT: WakeCfg = { lead: 7, leadRadius: 100, well: -1200, wellRadius: 110, trail: -3, trailRadius: 80, aheadMs: 60, behindMs: 90 };
const FX_WAKE_MED: WakeCfg = { lead: 16, leadRadius: 130, well: -2800, wellRadius: 150, trail: -6, trailRadius: 100, aheadMs: 70, behindMs: 110 };
const FX_WAKE_HEAVY: WakeCfg = { lead: 32, leadRadius: 180, well: -5500, wellRadius: 210, trail: -13, trailRadius: 130, aheadMs: 80, behindMs: 130 };
const FX_RIP = { strength: 80, radius: 140, intervalMs: 90 };

export class PlayerDesignLab {
  private renderer: Renderer;
  private bloom: BloomPass;
  private grid: SpringMassGrid;
  private starfield: Starfield;

  private ships: ShipInst[] = [];
  private bullets: LabBullet[] = [];
  private tail: TailParticle[] = [];
  private totalTime = 0;
  private shipLabels: HTMLDivElement[] = [];

  // Audio (created lazily on first user gesture)
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Public state (also driven by keys / window.playerDesignLab)
  focus = -1; // -1 = grid, else index into ships
  soundIndex = 0;
  muzzleIndex = 0;
  bulletIndex = 0;
  gridFxIndex = GRIDFX_DEFAULT;
  paused = false;
  gridOn = true;
  bloomOn = true;
  labelsOn = true;

  readonly soundVariants = SOUND_VARIANTS;
  readonly muzzleVariants = MUZZLE_VARIANTS;
  readonly bulletVariants = BULLET_VARIANTS;
  readonly gridFxVariants = GRIDFX_VARIANTS;

  private labelRoot: HTMLDivElement;

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
    this.starfield = new Starfield(140, gameSettings.arenaWidth, gameSettings.arenaHeight);

    this.ships = DESIGNS.map((d, i) => ({
      design: d, aimAngle: 0, heading: 0, fireTimer: 0, flashTimer: 0,
      x: 0, y: 0, cx: 0, cy: 0, vx: 0, vy: 0, scale: GRID_SCALE,
      phase: i * 1.37, coreAcc: Math.random() * 20, sparkAcc: Math.random() * 40,
    }));

    this.labelRoot = document.createElement('div');
    this.labelRoot.id = 'player-lab-labels';
    this.labelRoot.style.cssText =
      'position:fixed;inset:0;pointer-events:none;font-family:monospace;z-index:20;';
    document.body.appendChild(this.labelRoot);

    this.layout();

    window.addEventListener('resize', () => { this.renderer.resize(); this.layout(); });
    window.addEventListener('keydown', (e) => this.onKeyDown(e.code));
    // Any pointer press also unlocks audio and auditions the current fire.
    canvas.addEventListener('pointerdown', () => { this.ensureAudio(); this.audition(); });
  }

  // ------------------------------------------------------------------
  // Layout
  // ------------------------------------------------------------------
  private layout(): void {
    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;

    if (this.focus >= 0) {
      // Single ship on a wide patrol; camera follows it (see render()).
      const z = Math.min((cssW * 0.94) / (CELL_W * 3.0), (cssH * 0.9) / (CELL_H * 3.0));
      this.renderer.zoom = Math.max(0.2, z);
      this.renderer.resize();
      this.bloom.resize(this.renderer.canvasWidth, this.renderer.canvasHeight);
      const s = this.ships[this.focus];
      s.cx = 0; s.cy = 0; s.scale = FOCUS_SCALE;
      this.buildLabels();
      return;
    }

    const rows = Math.ceil(this.ships.length / COLS);
    const gridW = COLS * CELL_W;
    const gridH = rows * CELL_H;
    const zoom = Math.min((cssW * 0.94) / gridW, (cssH * 0.86) / gridH);
    this.renderer.zoom = Math.max(0.2, zoom);
    this.renderer.resize();
    this.bloom.resize(this.renderer.canvasWidth, this.renderer.canvasHeight);

    for (let i = 0; i < this.ships.length; i++) {
      const c = i % COLS;
      const r = Math.floor(i / COLS);
      this.ships[i].cx = (c - (COLS - 1) / 2) * CELL_W;
      this.ships[i].cy = ((rows - 1) / 2 - r) * CELL_H;
      this.ships[i].scale = GRID_SCALE;
    }
    this.buildLabels();
  }

  private camera(): { x: number; y: number } {
    // In focus mode the camera chases the patrolling ship so tail + grid FX stay framed.
    if (this.focus >= 0) return { x: this.ships[this.focus].x, y: this.ships[this.focus].y };
    return { x: 0, y: 0 };
  }

  private worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;
    const cam = this.camera();
    const z = this.renderer.zoom;
    return { x: (wx - cam.x) * z + cssW / 2, y: -(wy - cam.y) * z + cssH / 2 };
  }

  private buildLabels(): void {
    this.labelRoot.innerHTML = '';
    this.shipLabels = [];

    const title = document.createElement('div');
    title.style.cssText =
      'position:absolute;left:50%;top:10px;transform:translateX(-50%);color:#20ff20;' +
      'font-size:15px;font-weight:bold;letter-spacing:2px;text-shadow:0 0 8px #20ff20;';
    title.textContent = 'PLAYER DESIGN LAB v2';
    this.labelRoot.appendChild(title);

    const hud = document.createElement('div');
    hud.style.cssText =
      'position:absolute;left:50%;top:32px;transform:translateX(-50%);color:#7fd;font-size:11px;text-align:center;';
    hud.innerHTML =
      `sound <b style="color:#ffd24a">${SOUND_VARIANTS[this.soundIndex]}</b> [ ] &nbsp;·&nbsp; ` +
      `muzzle <b style="color:#ffd24a">${MUZZLE_VARIANTS[this.muzzleIndex]}</b> , . &nbsp;·&nbsp; ` +
      `bullet <b style="color:#ffd24a">${BULLET_VARIANTS[this.bulletIndex]}</b> ; ' &nbsp;·&nbsp; ` +
      `grid fx <b style="color:#ffd24a">${GRIDFX_VARIANTS[this.gridFxIndex]}</b> Z X<br>` +
      `<span style="color:#3aa">1-8 focus · F audition · G grid · B bloom · Space pause · L labels · R reset — ships patrol; tails + grid FX are live</span>`;
    this.labelRoot.appendChild(hud);

    const shown = this.focus >= 0 ? [this.ships[this.focus]] : this.ships;
    for (const s of shown) {
      const lbl = document.createElement('div');
      const [r, g, b] = s.design.line;
      const col = `rgb(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0})`;
      lbl.style.cssText =
        `position:absolute;left:0;top:0;transform:translate(-50%,0);display:none;` +
        `color:${col};font-size:12px;font-weight:bold;text-align:center;white-space:nowrap;` +
        `text-shadow:0 0 6px ${col};`;
      lbl.textContent = `${DESIGNS.indexOf(s.design) + 1}. ${s.design.name}`;
      this.labelRoot.appendChild(lbl);
      this.shipLabels.push(lbl);
    }
    this.updateLabels();
  }

  /** Reposition ship labels every frame — ships patrol, so labels track them. */
  private updateLabels(): void {
    const shown = this.focus >= 0 ? [this.ships[this.focus]] : this.ships;
    for (let i = 0; i < this.shipLabels.length; i++) {
      const lbl = this.shipLabels[i];
      const s = shown[i];
      if (!this.labelsOn || !s) { lbl.style.display = 'none'; continue; }
      const p = this.worldToScreen(s.cx, s.cy - CELL_H * 0.42);
      lbl.style.display = '';
      lbl.style.left = `${p.x}px`;
      lbl.style.top = `${p.y}px`;
    }
  }

  // ------------------------------------------------------------------
  // Update
  // ------------------------------------------------------------------
  update(dt: number): void {
    if (this.paused) return;
    this.totalTime += dt;
    const t = this.totalTime;

    const active = this.focus >= 0 ? [this.ships[this.focus]] : this.ships;

    for (const s of active) {
      const idx = DESIGNS.indexOf(s.design);

      // Patrol: gentle lissajous around the cell center in grid view, big
      // figure-eight across the arena in focus view. Heading follows velocity
      // so engine tails stream naturally behind the ship.
      let ax: number, ay: number, w: number;
      if (this.focus >= 0) {
        ax = 260; ay = 170; w = 0.00042;
      } else {
        ax = 32; ay = 22; w = 0.0011 + idx * 0.00007;
      }
      const p = s.phase;
      const px = s.cx + ax * Math.sin(w * t + p);
      const py = s.cy + ay * Math.sin(2 * w * t + p * 1.7);
      s.vx = ax * w * Math.cos(w * t + p);
      s.vy = 2 * ay * w * Math.cos(2 * w * t + p * 1.7);
      s.x = px; s.y = py;
      if (Math.abs(s.vx) + Math.abs(s.vy) > 1e-6) s.heading = Math.atan2(s.vy, s.vx);

      // Gentle aim oscillation so muzzle + bullets sweep and read as motion.
      s.aimAngle = s.heading + Math.sin(t * 0.0006 + idx) * 0.28;

      s.fireTimer -= dt;
      if (s.flashTimer > 0) s.flashTimer -= dt;
      if (s.fireTimer <= 0) {
        s.fireTimer = this.focus >= 0 ? 520 : 780;
        this.fireShip(s, this.focus >= 0); // focused ship plays sound
      }

      this.emitTail(s, dt);
    }

    // Advance bullets + apply the selected grid-fabric interaction.
    const fx = GRIDFX_VARIANTS[this.gridFxIndex];
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      switch (fx) {
        case 'Wake Soft':
          this.applyWake(b, FX_WAKE_SOFT);
          break;
        case 'Wake':
          this.applyWake(b, FX_WAKE_MED);
          break;
        case 'Wake Heavy':
          this.applyWake(b, FX_WAKE_HEAVY);
          break;
        case 'Rip Trail':
          if (t - b.lastRip >= FX_RIP.intervalMs) {
            b.lastRip = t;
            this.grid.applyImpulse(b.x, b.y, FX_RIP.strength, FX_RIP.radius);
          }
          break;
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);

    this.updateTail(dt);

    this.grid.update(dt);
  }

  /** Geometry Wars wake: a bow-wave push ahead of the bullet + an inward pull behind. */
  private applyWake(b: LabBullet, cfg: WakeCfg): void {
    const bx = b.x + b.vx * cfg.aheadMs;
    const by = b.y + b.vy * cfg.aheadMs;
    this.grid.applyImpulse(bx, by, cfg.lead, cfg.leadRadius);
    this.grid.applyGravityWell(bx, by, cfg.well, cfg.wellRadius);
    this.grid.applyImpulse(
      b.x - b.vx * cfg.behindMs, b.y - b.vy * cfg.behindMs,
      cfg.trail, cfg.trailRadius,
    );
  }

  private fireShip(s: ShipInst, withSound: boolean): void {
    s.flashTimer = 110;
    const spd = 0.5;
    const life = this.focus >= 0 ? 3400 : 2400; // long enough to watch grid FX develop
    for (const off of FIRE_PELLET_OFFSETS) {
      const a = s.aimAngle + (off * Math.PI) / 180;
      const nose = s.scale * 1.5;
      this.bullets.push({
        x: s.x + Math.cos(s.aimAngle) * nose,
        y: s.y + Math.sin(s.aimAngle) * nose,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        angle: a,
        life,
        maxLife: life,
        lastRip: this.totalTime,
        color: s.design.line,
      });
    }
    if (withSound) this.playFire();
  }

  /** Audition the current fire on the focused ship (or ship 0 in grid). */
  private audition(): void {
    this.ensureAudio();
    const s = this.focus >= 0 ? this.ships[this.focus] : this.ships[0];
    this.fireShip(s, true);
  }

  // ------------------------------------------------------------------
  // Engine tail — twin emitters, hot core stream + peel-off sparks
  // ------------------------------------------------------------------
  /** Engine emitter offsets in local space: design-specified, or the two rear-most verts. */
  private enginePoints(d: ShipDesign): [number, number][] {
    if (d.engines) return d.engines;
    let top: [number, number] | null = null;
    let bot: [number, number] | null = null;
    for (const v of d.verts) {
      if (v[1] > 0.05 && (!top || v[0] < top[0])) top = v;
      if (v[1] < -0.05 && (!bot || v[0] < bot[0])) bot = v;
    }
    return [top ?? [-0.8, 0.3], bot ?? [-0.8, -0.3]];
  }

  private emitTail(s: ShipInst, dt: number): void {
    const d = s.design;
    const focused = this.focus >= 0;
    const cos = Math.cos(s.heading), sin = Math.sin(s.heading);
    const sizeScale = s.scale / GRID_SCALE;

    // Exhaust streams backward relative to the ship's motion.
    const spd = Math.hypot(s.vx, s.vy);
    const bx = spd > 1e-5 ? -s.vx / spd : -cos;
    const by = spd > 1e-5 ? -s.vy / spd : -sin;

    const coreInterval = focused ? 9 : 20;
    const sparkInterval = focused ? 26 : 48;

    for (const [lx, ly] of this.enginePoints(d)) {
      const ex = s.x + (lx * cos - ly * sin) * s.scale;
      const ey = s.y + (lx * sin + ly * cos) * s.scale;

      // Hot core stream
      s.coreAcc += dt;
      while (s.coreAcc >= coreInterval) {
        s.coreAcc -= coreInterval;
        const j = () => (Math.random() - 0.5) * 0.02;
        this.pushTail({
          x: ex + (Math.random() - 0.5) * s.scale * 0.08,
          y: ey + (Math.random() - 0.5) * s.scale * 0.08,
          vx: s.vx * 0.35 + bx * 0.055 + j(),
          vy: s.vy * 0.35 + by * 0.055 + j(),
          life: 0, maxLife: 700 + Math.random() * 420,
          size: (1.6 + Math.random() * 1.4) * sizeScale,
          spark: false, seed: Math.random() * 100, hue: d.accent,
        });
      }

      // Peel-off sparks — wider jitter, longer life, occasional sideways flick
      s.sparkAcc += dt;
      while (s.sparkAcc >= sparkInterval) {
        s.sparkAcc -= sparkInterval;
        const j = () => (Math.random() - 0.5) * 0.06;
        const peel = Math.random() < 0.25 ? 0.05 : 0;
        this.pushTail({
          x: ex, y: ey,
          vx: s.vx * 0.3 + bx * (0.03 + Math.random() * 0.04) + j() - by * peel * (Math.random() < 0.5 ? 1 : -1),
          vy: s.vy * 0.3 + by * (0.03 + Math.random() * 0.04) + j() + bx * peel * (Math.random() < 0.5 ? 1 : -1),
          life: 0, maxLife: 950 + Math.random() * 750,
          size: (1.0 + Math.random() * 1.2) * sizeScale,
          spark: true, seed: Math.random() * 100, hue: d.line,
        });
      }
    }
  }

  private pushTail(p: TailParticle): void {
    p.life = p.maxLife;
    this.tail.push(p);
    if (this.tail.length > MAX_TAIL_PARTICLES) {
      this.tail.splice(0, this.tail.length - MAX_TAIL_PARTICLES);
    }
  }

  private updateTail(dt: number): void {
    const t = this.totalTime;
    const drag = Math.max(0, 1 - 0.0011 * dt);
    for (const p of this.tail) {
      // Slight curl so the trail feels alive, not a straight line.
      const curl = Math.sin(t * 0.004 + p.seed * 1.7) * 0.00008 * dt;
      const px = -p.vy, py = p.vx;
      p.vx = p.vx * drag + px * curl;
      p.vy = p.vy * drag + py * curl;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.tail = this.tail.filter((p) => p.life > 0);
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  render(): void {
    const cam = this.camera();
    this.renderer.cameraX = cam.x;
    this.renderer.cameraY = cam.y;
    this.bloom.shakeIntensity = 0;
    this.bloom.time = this.totalTime / 1000;

    const active = this.focus >= 0 ? [this.ships[this.focus]] : this.ships;

    const drawScene = () => {
      if (this.gridOn) this.grid.render(cam.x, cam.y, this.renderer.width, this.renderer.height);
      this.renderer.begin(!this.gridOn);
      this.starfield.render(this.renderer, cam.x, cam.y);

      // Normal pass: ship bodies + bullet bodies
      for (const s of active) this.drawShipBody(s);
      for (const b of this.bullets) this.drawBulletBody(b);

      // Additive pass: engine tails + glow, muzzle flashes, bullet glow
      this.renderer.setBlendMode('additive');
      this.drawTail();
      for (const s of active) {
        this.drawEngineGlow(s);
        if (s.flashTimer > 0) this.drawMuzzle(s);
      }
      for (const b of this.bullets) this.drawBulletGlow(b);
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

    this.updateLabels();
  }

  private shipWorldVerts(s: ShipInst): { wx: number[]; wy: number[] } {
    const cos = Math.cos(s.heading);
    const sin = Math.sin(s.heading);
    const wx: number[] = [];
    const wy: number[] = [];
    // Recoil kick backward along aim while the muzzle flash is active.
    const kick = s.flashTimer > 0 ? (s.flashTimer / 110) * s.scale * 0.14 : 0;
    const bx = s.x - cos * kick;
    const by = s.y - sin * kick;
    for (const [lx, ly] of s.design.verts) {
      wx.push(bx + (lx * cos - ly * sin) * s.scale);
      wy.push(by + (lx * sin + ly * cos) * s.scale);
    }
    return { wx, wy };
  }

  private drawShipBody(s: ShipInst): void {
    const r = this.renderer;
    const d = s.design;
    const { wx, wy } = this.shipWorldVerts(s);
    const n = wx.length;

    // Centroid (world) + local centroid for outward-normal tests
    let cx = 0, cy = 0, lcx = 0, lcy = 0;
    for (let i = 0; i < n; i++) { cx += wx[i]; cy += wy[i]; lcx += d.verts[i][0]; lcy += d.verts[i][1]; }
    cx /= n; cy /= n; lcx /= n; lcy /= n;

    // Faceted hull — one shaded triangle per edge segment. Tone comes from a
    // light direction fixed in LOCAL space (up-left of the nose), so the
    // shading is painted into the hull: faux-metallic beveled plating, much
    // more "rendered" than the wireframe enemies.
    const ha = d.hullAlpha ?? 0.95;
    const LEN = Math.hypot(-0.34, 0.94);
    const lx = -0.34 / LEN, ly = 0.94 / LEN;
    const segs = d.openNose ? n - 1 : n;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      const [ax, ay] = d.verts[i];
      const [bx, by] = d.verts[j];
      const ex = bx - ax, ey = by - ay;
      const el = Math.hypot(ex, ey) || 1;
      // Outward normal: perpendicular pointing away from the centroid
      let nx = -ey / el, ny = ex / el;
      const mx = (ax + bx) / 2 - lcx, my = (ay + by) / 2 - lcy;
      if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
      const lam = nx * lx + ny * ly; // [-1, 1]
      const t = Math.abs(lam);
      const tgt = lam >= 0 ? d.hullLight : d.hullDark;
      const cr = d.hull[0] + (tgt[0] - d.hull[0]) * t;
      const cg = d.hull[1] + (tgt[1] - d.hull[1]) * t;
      const cb = d.hull[2] + (tgt[2] - d.hull[2]) * t;
      r.drawTriangle(cx, cy, wx[i], wy[i], wx[j], wy[j], cr, cg, cb, ha);
    }
    // Open nose: cap the missing wedge dark, like an intake between the prongs.
    if (d.openNose) {
      r.drawTriangle(
        cx, cy, wx[n - 1], wy[n - 1], wx[0], wy[0],
        d.hullDark[0], d.hullDark[1], d.hullDark[2], ha * 0.9,
      );
    }

    // Outlines — dark then bright neon trim. Open nose leaves a gap.
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      r.drawLine(wx[i], wy[i], wx[j], wy[j], d.line2[0], d.line2[1], d.line2[2]);
    }
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      r.drawLine(wx[i], wy[i], wx[j], wy[j], d.line[0], d.line[1], d.line[2]);
    }

    // Detached extra strokes (floating shards / inner layers) — open polylines.
    if (d.extra) {
      const cos = Math.cos(s.heading), sin = Math.sin(s.heading);
      for (const poly of d.extra) {
        for (let i = 0; i < poly.length - 1; i++) {
          const [ax, ay] = poly[i];
          const [bx2, by2] = poly[i + 1];
          const x1 = s.x + (ax * cos - ay * sin) * s.scale;
          const y1 = s.y + (ax * sin + ay * cos) * s.scale;
          const x2 = s.x + (bx2 * cos - by2 * sin) * s.scale;
          const y2 = s.y + (bx2 * sin + by2 * cos) * s.scale;
          r.drawLine(x1, y1, x2, y2, d.line2[0], d.line2[1], d.line2[2]);
          r.drawLine(x1, y1, x2, y2, d.line[0], d.line[1], d.line[2]);
        }
      }
    }

    // Glass canopy — bright dome with a specular dot offset toward the light.
    const cos = Math.cos(s.heading), sin = Math.sin(s.heading);
    const [kax, kay, kar] = d.canopy;
    const kx = s.x + (kax * cos - kay * sin) * s.scale;
    const ky = s.y + (kax * sin + kay * cos) * s.scale;
    const kr = kar * s.scale;
    r.drawFilledCircle(kx, ky, kr, [0.82, 0.92, 1.0], 14, 0.5 * ha);
    const wl = [lx * cos - ly * sin, lx * sin + ly * cos]; // light dir in world
    r.drawFilledCircle(kx + wl[0] * kr * 0.4, ky + wl[1] * kr * 0.4, kr * 0.3, [1, 1, 1], 10, 0.6 * ha);
  }

  /** Rich additive tail: hot core streaks + flickering peel-off sparks. */
  private drawTail(): void {
    const r = this.renderer;
    const t = this.totalTime;
    for (const p of this.tail) {
      const f = p.life / p.maxLife;
      if (!p.spark) {
        // Hot white-amber core: streak along motion, white-hot head fading to hue.
        const a = f * f * 0.85;
        const hx = p.x - p.vx * 70, hy = p.y - p.vy * 70;
        r.drawLine(p.x, p.y, hx, hy, p.hue[0], p.hue[1], p.hue[2], a * 0.7);
        r.drawFilledCircle(p.x, p.y, p.size * (0.4 + 0.6 * f), [1.0, 0.98, 0.9], 8, a);
      } else {
        // Sparks flicker, shrink and fade as they drift off the trail.
        const flicker = 0.55 + 0.45 * Math.sin(t * 0.02 + p.seed * 40);
        const a = f * flicker * 0.8;
        const hx = p.x - p.vx * 45, hy = p.y - p.vy * 45;
        r.drawLine(p.x, p.y, hx, hy, p.hue[0], p.hue[1], p.hue[2], a);
      }
    }
  }

  /** Bright additive glow at each engine emitter (replaces the old 3-line flame). */
  private drawEngineGlow(s: ShipInst): void {
    const r = this.renderer;
    const d = s.design;
    const cos = Math.cos(s.heading), sin = Math.sin(s.heading);
    const flick = 0.7 + 0.3 * Math.sin(this.totalTime * 0.02 + DESIGNS.indexOf(d) * 2.1);
    for (const [lx, ly] of this.enginePoints(d)) {
      const ex = s.x + (lx * cos - ly * sin) * s.scale;
      const ey = s.y + (lx * sin + ly * cos) * s.scale;
      const rad = s.scale * 0.11 * flick;
      r.drawFilledCircle(ex, ey, rad, d.accent, 10, 0.75);
      r.drawFilledCircle(ex, ey, rad * 0.45, [1, 1, 1], 8, 0.9);
    }
  }

  private drawMuzzle(s: ShipInst): void {
    const r = this.renderer;
    const frac = s.flashTimer / 110;
    const cos = Math.cos(s.aimAngle), sin = Math.sin(s.aimAngle);
    const bx = s.x + cos * s.scale * 1.5;
    const by = s.y + sin * s.scale * 1.5;
    const perpC = -sin, perpS = cos;
    const col: RGB = [1.0, 1.0, 0.9];
    const u = s.scale / GRID_SCALE; // size normaliser so focus mode scales up

    switch (MUZZLE_VARIANTS[this.muzzleIndex]) {
      case 'Spike': {
        const len = 16 * u * frac;
        const spread = len * 0.5;
        const tx = bx + cos * len, ty = by + sin * len;
        r.drawLine(bx, by, tx, ty, col[0], col[1], col[2]);
        r.drawLine(bx, by, tx + perpC * spread, ty + perpS * spread, 0.7, 1.0, 0.8);
        r.drawLine(bx, by, tx - perpC * spread, ty - perpS * spread, 0.7, 1.0, 0.8);
        break;
      }
      case 'Ring Pop': {
        const rad = (6 + (1 - frac) * 20) * u;
        r.drawCircle(bx, by, rad, col, 18, frac);
        r.drawCircle(bx, by, rad * 0.6, [0.7, 1.0, 0.9], 14, frac * 0.8);
        break;
      }
      case 'Starburst': {
        const len = 15 * u * frac;
        for (let i = 0; i < 6; i++) {
          const a = s.aimAngle + (i / 6) * Math.PI * 2;
          const l = i % 2 === 0 ? len : len * 0.55;
          r.drawLine(bx, by, bx + Math.cos(a) * l, by + Math.sin(a) * l, col[0], col[1], col[2], frac);
        }
        break;
      }
      case 'Plasma Orb': {
        const rad = (5 + frac * 11) * u;
        r.drawFilledCircle(bx, by, rad, col, 16, frac * 0.85);
        r.drawFilledCircle(bx, by, rad * 0.5, [1, 1, 1], 12, frac);
        break;
      }
    }
  }

  private drawBulletBody(b: LabBullet): void {
    const r = this.renderer;
    const a = b.angle;
    const cos = Math.cos(a), sin = Math.sin(a);
    const u = this.focus >= 0 ? 2.4 : 1.0;
    const fade = Math.min(1, b.life / 300);

    switch (BULLET_VARIANTS[this.bulletIndex]) {
      case 'Diamond': {
        const s = 4 * u;
        const p = [
          [b.x - sin * s, b.y + cos * s],
          [b.x + cos * s * 2, b.y + sin * s * 2],
          [b.x + sin * s, b.y - cos * s],
          [b.x - cos * s * 2, b.y - sin * s * 2],
        ];
        r.drawTriangle(p[0][0], p[0][1], p[1][0], p[1][1], p[2][0], p[2][1], b.color[0], b.color[1], b.color[2], fade);
        r.drawTriangle(p[0][0], p[0][1], p[2][0], p[2][1], p[3][0], p[3][1], b.color[0], b.color[1], b.color[2], fade);
        break;
      }
      case 'Bolt Streak': {
        const len = 16 * u;
        r.drawLine(b.x - cos * len, b.y - sin * len, b.x + cos * len * 0.4, b.y + sin * len * 0.4, b.color[0], b.color[1], b.color[2], fade);
        break;
      }
      case 'Glow Orb': {
        r.drawFilledCircle(b.x, b.y, 4 * u, b.color, 12, fade);
        break;
      }
      case 'Thin Dart': {
        const s = 3 * u;
        r.drawTriangle(
          b.x + cos * s * 2.5, b.y + sin * s * 2.5,
          b.x - sin * s * 0.6, b.y + cos * s * 0.6,
          b.x + sin * s * 0.6, b.y - cos * s * 0.6,
          b.color[0], b.color[1], b.color[2], fade,
        );
        break;
      }
    }
  }

  private drawBulletGlow(b: LabBullet): void {
    const r = this.renderer;
    const a = b.angle;
    const cos = Math.cos(a), sin = Math.sin(a);
    const u = this.focus >= 0 ? 2.4 : 1.0;
    const fade = Math.min(1, b.life / 400) * 0.6;
    const len = 14 * u;
    r.drawLine(b.x - cos * len, b.y - sin * len, b.x, b.y, b.color[0], b.color[1], b.color[2], fade);
  }

  // ------------------------------------------------------------------
  // Audio — self-contained fire-sound variants (prototype; port the pick later)
  // ------------------------------------------------------------------
  private ensureAudio(): void {
    if (this.audioCtx) return;
    try {
      this.audioCtx = new AudioContext();
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = 0.4;
      this.masterGain.connect(this.audioCtx.destination);
    } catch { /* no audio */ }
  }

  private noise(len: number): AudioBufferSourceNode {
    const ctx = this.audioCtx!;
    const buf = ctx.createBuffer(1, Math.max(1, (ctx.sampleRate * len) | 0), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  playFire(): void {
    this.ensureAudio();
    const ctx = this.audioCtx;
    const out = this.masterGain;
    if (!ctx || !out) return;
    const now = ctx.currentTime;

    switch (SOUND_VARIANTS[this.soundIndex]) {
      case 'Shotgun Pulse': {
        const thump = ctx.createOscillator();
        thump.type = 'sine';
        thump.frequency.setValueAtTime(180, now);
        thump.frequency.exponentialRampToValueAtTime(48, now + 0.13);
        const tg = ctx.createGain();
        tg.gain.setValueAtTime(0.34, now);
        tg.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        thump.connect(tg); tg.connect(out); thump.start(now); thump.stop(now + 0.18);
        const n = this.noise(0.12);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.4;
        const ng = ctx.createGain(); ng.gain.setValueAtTime(0.22, now); ng.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        n.connect(bp); bp.connect(ng); ng.connect(out); n.start(now);
        break;
      }
      case 'Laser Zap': {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(1400, now);
        o.frequency.exponentialRampToValueAtTime(180, now + 0.12);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.24, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
        o.connect(lp); lp.connect(g); g.connect(out); o.start(now); o.stop(now + 0.16);
        break;
      }
      case 'Plasma Bolt': {
        // FM-ish bright bell: carrier + detuned partial, quick decay.
        for (const [f, det, gain] of [[880, 0, 0.16], [1320, 6, 0.1], [1760, -8, 0.07]] as const) {
          const o = ctx.createOscillator(); o.type = 'triangle';
          o.frequency.setValueAtTime(f + det, now);
          o.frequency.exponentialRampToValueAtTime((f + det) * 0.6, now + 0.16);
          const g = ctx.createGain(); g.gain.setValueAtTime(gain, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
          o.connect(g); g.connect(out); o.start(now); o.stop(now + 0.2);
        }
        break;
      }
      case 'Arcade Pew': {
        const o = ctx.createOscillator(); o.type = 'square';
        o.frequency.setValueAtTime(240, now);
        o.frequency.exponentialRampToValueAtTime(1200, now + 0.04);
        o.frequency.exponentialRampToValueAtTime(140, now + 0.14);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.16, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        o.connect(g); g.connect(out); o.start(now); o.stop(now + 0.17);
        break;
      }
      case 'Deep Thump': {
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(120, now);
        o.frequency.exponentialRampToValueAtTime(32, now + 0.2);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.42, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        const sh = ctx.createWaveShaper();
        const curve = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; curve[i] = Math.tanh(x * 2.5); }
        sh.curve = curve;
        o.connect(sh); sh.connect(g); g.connect(out); o.start(now); o.stop(now + 0.26);
        break;
      }
      case 'Static Crackle': {
        const n = this.noise(0.14);
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
        bp.frequency.setValueAtTime(2600, now);
        bp.frequency.exponentialRampToValueAtTime(800, now + 0.13);
        bp.Q.value = 0.7;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.3, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        n.connect(hp); hp.connect(bp); bp.connect(g); g.connect(out); n.start(now);
        break;
      }
    }
  }

  // ------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------
  private onKeyDown(code: string): void {
    let relayout = false;
    switch (code) {
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
      case 'Digit5': case 'Digit6': case 'Digit7': case 'Digit8': {
        const idx = parseInt(code.slice(5), 10) - 1;
        this.focus = this.focus === idx ? -1 : idx;
        this.bullets.length = 0;
        this.tail.length = 0;
        relayout = true;
        break;
      }
      case 'Digit0':
        this.focus = -1; this.bullets.length = 0; this.tail.length = 0; relayout = true; break;
      case 'BracketRight':
        this.soundIndex = (this.soundIndex + 1) % SOUND_VARIANTS.length; this.audition(); relayout = true; break;
      case 'BracketLeft':
        this.soundIndex = (this.soundIndex + SOUND_VARIANTS.length - 1) % SOUND_VARIANTS.length; this.audition(); relayout = true; break;
      case 'Period':
        this.muzzleIndex = (this.muzzleIndex + 1) % MUZZLE_VARIANTS.length; relayout = true; break;
      case 'Comma':
        this.muzzleIndex = (this.muzzleIndex + MUZZLE_VARIANTS.length - 1) % MUZZLE_VARIANTS.length; relayout = true; break;
      case 'Quote':
        this.bulletIndex = (this.bulletIndex + 1) % BULLET_VARIANTS.length; relayout = true; break;
      case 'Semicolon':
        this.bulletIndex = (this.bulletIndex + BULLET_VARIANTS.length - 1) % BULLET_VARIANTS.length; relayout = true; break;
      case 'KeyX':
        this.gridFxIndex = (this.gridFxIndex + 1) % GRIDFX_VARIANTS.length; relayout = true; break;
      case 'KeyZ':
        this.gridFxIndex = (this.gridFxIndex + GRIDFX_VARIANTS.length - 1) % GRIDFX_VARIANTS.length; relayout = true; break;
      case 'KeyF':
        this.audition(); break;
      case 'KeyG': this.gridOn = !this.gridOn; break;
      case 'KeyB': this.bloomOn = !this.bloomOn; break;
      case 'Space': this.paused = !this.paused; break;
      case 'KeyL':
        this.labelsOn = !this.labelsOn; relayout = true; break;
      case 'KeyR':
        this.focus = -1; this.soundIndex = 0; this.muzzleIndex = 0; this.bulletIndex = 0;
        this.gridFxIndex = GRIDFX_DEFAULT;
        this.bullets.length = 0; this.tail.length = 0;
        this.grid.clear();
        relayout = true; break;
    }
    if (relayout) this.layout();
  }
}
