import { Renderer } from './renderer/sprite-batch';
import { BloomPass } from './renderer/bloom';
import { SpringMassGrid } from './renderer/grid';
import { Starfield } from './renderer/starfield';
import { gameSettings } from './settings';

/**
 * Player Design Lab — open with `?player=1`.
 *
 * A standalone sandbox for redesigning the player ship and auditioning firing feedback.
 * The current shipped ship ("Claw") feels a bit "meh"; this lab renders 8 candidate ship
 * silhouettes side-by-side, and lets you cycle through firing SOUND variants, MUZZLE-flash
 * variants, and BULLET visual variants so a look + feel can be picked before porting.
 *
 * Keys:
 *   1-8  focus a single ship large (same digit / 0 → back to the grid)
 *   [ ]  prev / next fire SOUND variant (plays a sample on change)
 *   , .  prev / next MUZZLE-flash variant
 *   ; '  prev / next BULLET visual variant
 *   F    audition current fire (sound + muzzle) on the focused ship (or ship 1 in grid)
 *   G    reactive grid   B  bloom   L  labels   Space  pause   R  reset
 *
 * `window.playerDesignLab` is exposed for tests.
 */

type RGB = [number, number, number];

interface ShipDesign {
  name: string;
  /** Vertices facing right (+x) at angle 0, roughly within x∈[-1.2,1.6], y∈[-1.2,1.2]. */
  verts: [number, number][];
  /** Leave a gap between the first & last vertex (open nose) instead of a closed loop. */
  openNose: boolean;
  line: RGB;   // bright outline
  line2: RGB;  // darker inner outline (depth)
  fill: RGB;
  fillAlpha: number;
  accent: RGB; // cockpit dot + engine flame
}

interface ShipInst {
  design: ShipDesign;
  aimAngle: number;
  fireTimer: number;
  flashTimer: number; // ms remaining on muzzle flash
  x: number;
  y: number;
  scale: number;
}

interface LabBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  life: number;
  maxLife: number;
  color: RGB;
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

// ------------------------------------------------------------------
// The 8 candidate ship silhouettes. Distinct neon hues so they're easy
// to tell apart at a glance; a port would recolor the pick to player-green.
// ------------------------------------------------------------------
const DESIGNS: ShipDesign[] = [
  {
    name: 'Dart',
    verts: [[1.55, 0], [-0.6, 0.72], [-0.15, 0], [-0.6, -0.72]],
    openNose: false,
    line: [0.2, 1.0, 0.35], line2: [0.08, 0.55, 0.14], fill: [0.15, 0.8, 0.2], fillAlpha: 0.6,
    accent: [0.7, 1.0, 0.8],
  },
  {
    name: 'Claw (current)',
    verts: [
      [1.4, 0.55], [0.5, 0.85], [-0.4, 0.6], [-1.0, 0.3], [-0.6, 0.0],
      [-1.0, -0.3], [-0.4, -0.6], [0.5, -0.85], [1.4, -0.55],
    ],
    openNose: true,
    line: [0.2, 0.95, 1.0], line2: [0.08, 0.45, 0.6], fill: [0.15, 0.7, 0.9], fillAlpha: 0.55,
    accent: [0.8, 1.0, 1.0],
  },
  {
    name: 'Interceptor',
    verts: [
      [1.65, 0], [0.2, 0.18], [-0.4, 0.92], [-0.72, 0.28], [-1.0, 0.16],
      [-1.0, -0.16], [-0.72, -0.28], [-0.4, -0.92], [0.2, -0.18],
    ],
    openNose: false,
    line: [1.0, 0.35, 0.92], line2: [0.55, 0.1, 0.5], fill: [0.85, 0.25, 0.8], fillAlpha: 0.5,
    accent: [1.0, 0.8, 1.0],
  },
  {
    name: 'Talon',
    verts: [
      [1.5, 0.0], [0.0, 0.35], [-0.3, 0.98], [-0.92, 0.55], [-0.5, 0.12],
      [-1.12, 0.0], [-0.5, -0.12], [-0.92, -0.55], [-0.3, -0.98], [0.0, -0.35],
    ],
    openNose: false,
    line: [1.0, 0.55, 0.15], line2: [0.55, 0.28, 0.05], fill: [0.9, 0.45, 0.1], fillAlpha: 0.5,
    accent: [1.0, 0.9, 0.6],
  },
  {
    name: 'Manta',
    verts: [
      [1.35, 0], [0.4, 0.25], [-0.5, 1.18], [-0.92, 0.9], [-0.6, 0.2],
      [-1.0, 0.0], [-0.6, -0.2], [-0.92, -0.9], [-0.5, -1.18], [0.4, -0.25],
    ],
    openNose: false,
    line: [0.62, 0.42, 1.0], line2: [0.3, 0.18, 0.6], fill: [0.5, 0.35, 0.9], fillAlpha: 0.5,
    accent: [0.9, 0.85, 1.0],
  },
  {
    name: 'Hexship',
    verts: [[1.45, 0], [0.55, 0.72], [-0.7, 0.72], [-1.12, 0], [-0.7, -0.72], [0.55, -0.72]],
    openNose: false,
    line: [1.0, 0.9, 0.2], line2: [0.55, 0.5, 0.08], fill: [0.9, 0.8, 0.15], fillAlpha: 0.5,
    accent: [1.0, 1.0, 0.7],
  },
  {
    name: 'Trident',
    verts: [
      [1.55, 0], [0.1, 0.22], [1.1, 0.78], [0.0, 0.46], [-1.0, 0.3],
      [-1.0, -0.3], [0.0, -0.46], [1.1, -0.78], [0.1, -0.22],
    ],
    openNose: false,
    line: [1.0, 0.32, 0.32], line2: [0.55, 0.1, 0.1], fill: [0.9, 0.22, 0.22], fillAlpha: 0.5,
    accent: [1.0, 0.8, 0.8],
  },
  {
    name: 'Wraith',
    verts: [
      [1.55, 0], [0.6, 0.15], [-0.2, 0.55], [-1.12, 0.88], [-0.6, 0.2],
      [-0.88, 0], [-0.6, -0.2], [-1.12, -0.88], [-0.2, -0.55], [0.6, -0.15],
    ],
    openNose: false,
    line: [0.6, 1.0, 0.85], line2: [0.28, 0.55, 0.45], fill: [0.45, 0.85, 0.7], fillAlpha: 0.5,
    accent: [0.9, 1.0, 0.95],
  },
];

const COLS = 4;
const CELL_W = 230;
const CELL_H = 220;
const GRID_SCALE = 46;   // ship scale in grid cells
const FOCUS_SCALE = 120; // ship scale when a single one is focused
const FIRE_PELLET_OFFSETS = [-8, 0, 8]; // degrees — lab always fires a 3-pellet fan

export class PlayerDesignLab {
  private renderer: Renderer;
  private bloom: BloomPass;
  private grid: SpringMassGrid;
  private starfield: Starfield;

  private ships: ShipInst[] = [];
  private bullets: LabBullet[] = [];
  private totalTime = 0;

  // Audio (created lazily on first user gesture)
  private audioCtx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // Public state (also driven by keys / window.playerDesignLab)
  focus = -1; // -1 = grid, else index into ships
  soundIndex = 0;
  muzzleIndex = 0;
  bulletIndex = 0;
  paused = false;
  gridOn = true;
  bloomOn = true;
  labelsOn = true;

  readonly soundVariants = SOUND_VARIANTS;
  readonly muzzleVariants = MUZZLE_VARIANTS;
  readonly bulletVariants = BULLET_VARIANTS;

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

    this.ships = DESIGNS.map((d) => ({
      design: d, aimAngle: 0, fireTimer: 0, flashTimer: 0, x: 0, y: 0, scale: GRID_SCALE,
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
      // Single ship centered; fit a big square into the viewport.
      const z = Math.min((cssW * 0.85) / (CELL_W * 1.6), (cssH * 0.8) / (CELL_H * 1.6));
      this.renderer.zoom = Math.max(0.3, z);
      this.renderer.resize();
      this.bloom.resize(this.renderer.canvasWidth, this.renderer.canvasHeight);
      const s = this.ships[this.focus];
      s.x = -CELL_W * 0.15; s.y = 0; s.scale = FOCUS_SCALE;
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
      this.ships[i].x = (c - (COLS - 1) / 2) * CELL_W;
      this.ships[i].y = ((rows - 1) / 2 - r) * CELL_H;
      this.ships[i].scale = GRID_SCALE;
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

    const title = document.createElement('div');
    title.style.cssText =
      'position:absolute;left:50%;top:10px;transform:translateX(-50%);color:#20ff20;' +
      'font-size:15px;font-weight:bold;letter-spacing:2px;text-shadow:0 0 8px #20ff20;';
    title.textContent = 'PLAYER DESIGN LAB';
    this.labelRoot.appendChild(title);

    const hud = document.createElement('div');
    hud.style.cssText =
      'position:absolute;left:50%;top:32px;transform:translateX(-50%);color:#7fd;font-size:11px;text-align:center;';
    hud.innerHTML =
      `sound <b style="color:#ffd24a">${SOUND_VARIANTS[this.soundIndex]}</b> [ ] &nbsp;·&nbsp; ` +
      `muzzle <b style="color:#ffd24a">${MUZZLE_VARIANTS[this.muzzleIndex]}</b> , . &nbsp;·&nbsp; ` +
      `bullet <b style="color:#ffd24a">${BULLET_VARIANTS[this.bulletIndex]}</b> ; '<br>` +
      `<span style="color:#3aa">1-8 focus · F audition · G grid · B bloom · Space pause · L labels · R reset</span>`;
    this.labelRoot.appendChild(hud);

    if (!this.labelsOn) return;

    const shown = this.focus >= 0 ? [this.ships[this.focus]] : this.ships;
    for (const s of shown) {
      const p = this.worldToScreen(s.x, s.y - CELL_H * 0.42);
      const lbl = document.createElement('div');
      const [r, g, b] = s.design.line;
      const col = `rgb(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0})`;
      lbl.style.cssText =
        `position:absolute;left:${p.x}px;top:${p.y}px;transform:translate(-50%,0);` +
        `color:${col};font-size:12px;font-weight:bold;text-align:center;white-space:nowrap;` +
        `text-shadow:0 0 6px ${col};`;
      lbl.textContent = `${DESIGNS.indexOf(s.design) + 1}. ${s.design.name}`;
      this.labelRoot.appendChild(lbl);
    }
  }

  // ------------------------------------------------------------------
  // Update
  // ------------------------------------------------------------------
  update(dt: number): void {
    if (this.paused) return;
    this.totalTime += dt;

    const active = this.focus >= 0 ? [this.ships[this.focus]] : this.ships;

    for (const s of active) {
      // Gentle aim oscillation so muzzle + bullets sweep and read as motion.
      s.aimAngle = Math.sin(this.totalTime * 0.0006 + DESIGNS.indexOf(s.design)) * 0.28;

      s.fireTimer -= dt;
      if (s.flashTimer > 0) s.flashTimer -= dt;
      if (s.fireTimer <= 0) {
        s.fireTimer = this.focus >= 0 ? 520 : 780;
        this.fireShip(s, this.focus >= 0); // focused ship plays sound
      }
    }

    // Advance bullets
    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);

    this.grid.update(dt);
  }

  private fireShip(s: ShipInst, withSound: boolean): void {
    s.flashTimer = 110;
    const spd = 0.5;
    for (const off of FIRE_PELLET_OFFSETS) {
      const a = s.aimAngle + (off * Math.PI) / 180;
      const nose = s.scale * 1.5;
      this.bullets.push({
        x: s.x + Math.cos(s.aimAngle) * nose,
        y: s.y + Math.sin(s.aimAngle) * nose,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        angle: a,
        life: 900,
        maxLife: 900,
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
  // Render
  // ------------------------------------------------------------------
  render(): void {
    this.renderer.cameraX = 0;
    this.renderer.cameraY = 0;
    this.bloom.shakeIntensity = 0;
    this.bloom.time = this.totalTime / 1000;

    const active = this.focus >= 0 ? [this.ships[this.focus]] : this.ships;

    const drawScene = () => {
      if (this.gridOn) this.grid.render(0, 0, this.renderer.width, this.renderer.height);
      this.renderer.begin(!this.gridOn);
      this.starfield.render(this.renderer, 0, 0);

      // Normal pass: ship bodies + bullet bodies
      for (const s of active) this.drawShipBody(s);
      for (const b of this.bullets) this.drawBulletBody(b);

      // Additive pass: engine flames, muzzle flashes, bullet glow
      this.renderer.setBlendMode('additive');
      for (const s of active) {
        this.drawEngineFlame(s);
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
  }

  private shipWorldVerts(s: ShipInst): { wx: number[]; wy: number[] } {
    const cos = Math.cos(s.aimAngle);
    const sin = Math.sin(s.aimAngle);
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

    // Centroid for the fill fan
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += wx[i]; cy += wy[i]; }
    cx /= n; cy /= n;

    // Fill (fan from centroid)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      r.drawTriangle(cx, cy, wx[i], wy[i], wx[j], wy[j], d.fill[0], d.fill[1], d.fill[2], d.fillAlpha);
    }

    // Outlines — dark then bright. Open nose leaves a gap between last & first vertex.
    const segs = d.openNose ? n - 1 : n;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      r.drawLine(wx[i], wy[i], wx[j], wy[j], d.line2[0], d.line2[1], d.line2[2]);
    }
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      r.drawLine(wx[i], wy[i], wx[j], wy[j], d.line[0], d.line[1], d.line[2]);
    }

    // Cockpit dot — a small accent near the front-center.
    const cos = Math.cos(s.aimAngle), sin = Math.sin(s.aimAngle);
    const ccx = cx + cos * s.scale * 0.35;
    const ccy = cy + sin * s.scale * 0.35;
    r.drawFilledCircle(ccx, ccy, s.scale * 0.12, d.accent, 10, 0.9);
  }

  private drawEngineFlame(s: ShipInst): void {
    const r = this.renderer;
    const d = s.design;
    const cos = Math.cos(s.aimAngle), sin = Math.sin(s.aimAngle);
    // Rear point ~ behind the centroid along -aim.
    const rx = s.x - cos * s.scale * 0.9;
    const ry = s.y - sin * s.scale * 0.9;
    const flick = 0.6 + 0.4 * Math.sin(this.totalTime * 0.02 + DESIGNS.indexOf(d));
    const len = s.scale * (0.5 + 0.35 * flick);
    const tipX = rx - cos * len, tipY = ry - sin * len;
    const perpC = -sin, perpS = cos;
    const w = s.scale * 0.18;
    r.drawLine(rx, ry, tipX, tipY, d.accent[0], d.accent[1], d.accent[2], 0.9);
    r.drawLine(rx + perpC * w, ry + perpS * w, tipX, tipY, d.line[0], d.line[1], d.line[2], 0.5);
    r.drawLine(rx - perpC * w, ry - perpS * w, tipX, tipY, d.line[0], d.line[1], d.line[2], 0.5);
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
        relayout = true;
        break;
      }
      case 'Digit0':
        this.focus = -1; this.bullets.length = 0; relayout = true; break;
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
      case 'KeyF':
        this.audition(); break;
      case 'KeyG': this.gridOn = !this.gridOn; break;
      case 'KeyB': this.bloomOn = !this.bloomOn; break;
      case 'Space': this.paused = !this.paused; break;
      case 'KeyL':
        this.labelsOn = !this.labelsOn; relayout = true; break;
      case 'KeyR':
        this.focus = -1; this.soundIndex = 0; this.muzzleIndex = 0; this.bulletIndex = 0;
        this.bullets.length = 0; relayout = true; break;
    }
    if (relayout) this.layout();
  }
}
