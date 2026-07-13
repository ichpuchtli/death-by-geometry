import { Renderer } from './renderer/sprite-batch';
import { BloomPass } from './renderer/bloom';
import { SpringMassGrid } from './renderer/grid';
import { Starfield } from './renderer/starfield';
import { gameSettings } from './settings';
import { BLACKHOLE_PALETTE } from './config';

/**
 * Glass Lab (`?glass=1`) — an A/B chooser for the BlackHole "glass" chromatic photon ring.
 * The shipped ring (renderGlassDiffraction) reads as a single-pixel hairline because it's
 * three 1px `drawCircle` strokes. This lab renders ~9 THICKER variants side by side on a
 * dark void disc (the "hole"), so you can pick the look you want and I'll port it.
 *
 * Every variant is drawn additively (for glow) and animates a slow specular glint. The knobs
 * that separate them: band thickness, number of spectral bands (RGB vs full ROYGBIV), crisp
 * lines vs soft filled glow, dispersion width, and glint treatment.
 *
 * Keys (also on window.glassLab):
 *   1-9  focus one variant large (press again / 0 to return to the grid)
 *   [ ]  dispersion −/+     · - =  mass/instability −/+  (dispersion & brightness scale with it)
 *   G grid · B bloom · Space pause · L labels · R reset knobs
 */

type Color = [number, number, number];

interface Variant {
  name: string;
  desc: string;
  draw: (cx: number, cy: number, radius: number, disp: number, inst: number, t: number) => void;
}

const COLS = 3;
const CELL = 340;
const R_GRID = 46; // hole radius in the grid
const R_FOCUS = 150; // hole radius when focused

// Spectral palette (ROYGBIV) for the full-rainbow variants.
const SPECTRUM: Color[] = [
  [1.0, 0.12, 0.16], // red
  [1.0, 0.5, 0.1],   // orange
  [1.0, 0.9, 0.2],   // yellow
  [0.25, 1.0, 0.35], // green
  [0.2, 0.9, 1.0],   // cyan
  [0.25, 0.45, 1.0], // blue
  [0.7, 0.3, 1.0],   // violet
];
const RED: Color = [1.0, 0.15, 0.25];
const GRN: Color = [0.5, 1.0, 0.65];
const BLU: Color = [0.25, 0.5, 1.0];
const WHT: Color = [1, 1, 1];

export class GlassLab {
  private renderer: Renderer;
  private bloom: BloomPass;
  private grid: SpringMassGrid;
  private starfield: Starfield;

  private variants: Variant[];
  private totalTime = 0;

  paused = false;
  gridOn = false;
  bloomOn = true;
  labelsOn = true;
  focus = -1; // -1 = grid; else index of focused variant
  dispMult = 1;
  inst = 0.55; // mass/instability (dispersion + brightness scale with it)

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
    this.starfield = new Starfield(120, gameSettings.arenaWidth, gameSettings.arenaHeight);

    this.variants = this.buildVariants();

    this.labelRoot = document.createElement('div');
    this.labelRoot.id = 'glass-labels';
    this.labelRoot.style.cssText = 'position:fixed;inset:0;pointer-events:none;font-family:monospace;z-index:20;';
    document.body.appendChild(this.labelRoot);

    this.layout();
    window.addEventListener('resize', () => { this.renderer.resize(); this.layout(); });
    window.addEventListener('keydown', (e) => this.onKeyDown(e.code));
  }

  // ============================================================
  // Draw helpers
  // ============================================================
  /** A thick ring band: `thick` px of stacked concentric strokes centered on `radius`. */
  private band(cx: number, cy: number, radius: number, color: Color, thick: number, alpha: number, segs = 72): void {
    const steps = Math.max(1, Math.round(thick));
    for (let i = 0; i < steps; i++) {
      const rr = radius - thick / 2 + (steps === 1 ? thick / 2 : (i / (steps - 1)) * thick);
      this.renderer.drawCircle(cx, cy, rr, color, segs, alpha);
    }
  }

  /** Soft filled glow band: overlapping filled discs subtracted to a low-alpha additive halo. */
  private glowBand(cx: number, cy: number, radius: number, color: Color, thick: number, alpha: number): void {
    const layers = Math.max(2, Math.round(thick / 2));
    for (let i = 0; i < layers; i++) {
      const rr = radius - thick / 2 + (i / (layers - 1)) * thick;
      this.renderer.drawCircle(cx, cy, rr, color, 72, alpha);
      this.renderer.drawCircle(cx, cy, rr + 0.6, color, 72, alpha * 0.6);
    }
  }

  /** Rotating specular glint arc — light catching the "glass" edge. */
  private glint(cx: number, cy: number, radius: number, t: number, span = 0.55, color: Color = WHT, gain = 0.85): void {
    const a0 = t * 1.1;
    const segs = 8;
    for (let i = 0; i < segs; i++) {
      const b1 = a0 + (i / segs) * span;
      const b2 = a0 + ((i + 1) / segs) * span;
      const fade = 1 - i / segs;
      this.renderer.drawLine(
        cx + Math.cos(b1) * radius, cy + Math.sin(b1) * radius,
        cx + Math.cos(b2) * radius, cy + Math.sin(b2) * radius,
        color[0], color[1], color[2], gain * fade);
    }
  }

  // ============================================================
  // Variants
  // ============================================================
  private buildVariants(): Variant[] {
    return [
      {
        name: '1 · Shipped (hairline)',
        desc: 'current: three 1px RGB strokes — the thin look to replace',
        draw: (cx, cy, radius, disp, inst, t) => {
          this.renderer.drawCircle(cx, cy, radius + disp, RED, 64, 0.6);
          this.renderer.drawCircle(cx, cy, radius, GRN, 64, 0.7);
          this.renderer.drawCircle(cx, cy, radius - disp, BLU, 64, 0.6);
          this.renderer.drawCircle(cx, cy, radius, WHT, 64, 0.3 + inst * 0.25);
          this.glint(cx, cy, radius + disp * 0.5, t);
        },
      },
      {
        name: '2 · Thick RGB bands',
        desc: 'each of R/G/B is a fat stacked band — bold prism rim',
        draw: (cx, cy, radius, disp, inst, t) => {
          const th = 4 + inst * 3;
          this.band(cx, cy, radius + disp, RED, th, 0.4);
          this.band(cx, cy, radius, GRN, th, 0.45);
          this.band(cx, cy, radius - disp, BLU, th, 0.4);
          this.band(cx, cy, radius, WHT, 2, 0.5 + inst * 0.3);
          this.glint(cx, cy, radius + disp * 0.5, t);
        },
      },
      {
        name: '3 · Spectral ROYGBIV',
        desc: 'full rainbow, 7 thin bands across the dispersion width',
        draw: (cx, cy, radius, disp, _inst, t) => {
          const n = SPECTRUM.length;
          for (let i = 0; i < n; i++) {
            const off = (i / (n - 1) - 0.5) * 2 * disp;
            this.renderer.drawCircle(cx, cy, radius + off, SPECTRUM[i], 72, 0.6);
          }
          this.glint(cx, cy, radius, t);
        },
      },
      {
        name: '4 · Spectral thick',
        desc: 'full rainbow, each band stacked → smooth gradient ring',
        draw: (cx, cy, radius, disp, inst, t) => {
          const n = SPECTRUM.length;
          const th = 2.5 + inst * 2;
          for (let i = 0; i < n; i++) {
            const off = (i / (n - 1) - 0.5) * 2 * disp;
            this.band(cx, cy, radius + off, SPECTRUM[i], th, 0.4);
          }
          this.band(cx, cy, radius, WHT, 1.5, 0.35 + inst * 0.25);
          this.glint(cx, cy, radius, t);
        },
      },
      {
        name: '5 · Soft glow prism',
        desc: 'blurry additive RGB halo — glowy, less crisp',
        draw: (cx, cy, radius, disp, inst, t) => {
          const th = 8 + inst * 6;
          this.glowBand(cx, cy, radius + disp * 1.2, RED, th, 0.16);
          this.glowBand(cx, cy, radius, GRN, th, 0.18);
          this.glowBand(cx, cy, radius - disp * 1.2, BLU, th, 0.16);
          this.band(cx, cy, radius, WHT, 2, 0.4 + inst * 0.2);
          this.glint(cx, cy, radius, t, 0.7);
        },
      },
      {
        name: '6 · Sharp core + halo',
        desc: 'crisp white photon ring + a soft wide chromatic halo outside',
        draw: (cx, cy, radius, disp, inst, t) => {
          this.glowBand(cx, cy, radius + disp * 1.6, RED, 10, 0.12);
          this.glowBand(cx, cy, radius - disp * 1.6, BLU, 10, 0.12);
          this.band(cx, cy, radius + 1.5, RED, 2, 0.4);
          this.band(cx, cy, radius - 1.5, BLU, 2, 0.4);
          this.band(cx, cy, radius, WHT, 2.5, 0.7 + inst * 0.3);
          this.glint(cx, cy, radius, t);
        },
      },
      {
        name: '7 · Fresnel glint',
        desc: 'dim full ring + a strong sweeping chromatic specular arc',
        draw: (cx, cy, radius, disp, inst, t) => {
          this.band(cx, cy, radius + disp, RED, 2, 0.18);
          this.band(cx, cy, radius, GRN, 2, 0.2);
          this.band(cx, cy, radius - disp, BLU, 2, 0.18);
          // Strong triple-offset glint = a moving prism highlight.
          this.glint(cx, cy, radius + disp, t, 0.5, RED, 0.7);
          this.glint(cx, cy, radius, t, 0.5, WHT, 1.0);
          this.glint(cx, cy, radius - disp, t, 0.5, BLU, 0.7);
        },
      },
      {
        name: '8 · Wide dispersion',
        desc: 'dramatic — spectrum spread wide into a rainbow lens flare',
        draw: (cx, cy, radius, disp, inst, t) => {
          const n = SPECTRUM.length;
          const wide = disp * 2.4;
          const th = 3 + inst * 3;
          for (let i = 0; i < n; i++) {
            const off = (i / (n - 1) - 0.5) * 2 * wide;
            this.band(cx, cy, radius + off, SPECTRUM[i], th, 0.28);
          }
          this.band(cx, cy, radius, WHT, 2, 0.4 + inst * 0.25);
          this.glint(cx, cy, radius, t, 0.8);
        },
      },
      {
        name: '9 · Refraction shards',
        desc: 'short chromatic line shards radiating off the rim — shattered light',
        draw: (cx, cy, radius, disp, inst, t) => {
          this.band(cx, cy, radius, WHT, 2, 0.5 + inst * 0.3);
          const shards = 40;
          for (let i = 0; i < shards; i++) {
            const a = (i / shards) * Math.PI * 2 + t * 0.2;
            const len = disp * 1.6 + Math.sin(i * 3.1 + t * 2) * disp * 0.8;
            const c = SPECTRUM[i % SPECTRUM.length];
            const x1 = cx + Math.cos(a) * (radius - 1);
            const y1 = cy + Math.sin(a) * (radius - 1);
            const x2 = cx + Math.cos(a) * (radius + len);
            const y2 = cy + Math.sin(a) * (radius + len);
            this.renderer.drawLine(x1, y1, x2, y2, c[0], c[1], c[2], 0.5);
          }
          this.glint(cx, cy, radius, t);
        },
      },
    ];
  }

  // ============================================================
  // Layout / labels
  // ============================================================
  private cellPos(i: number): { x: number; y: number } {
    const rows = Math.ceil(this.variants.length / COLS);
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    const rowItems = Math.min(COLS, this.variants.length - r * COLS);
    const x = (c - (rowItems - 1) / 2) * CELL;
    const y = ((rows - 1) / 2 - r) * CELL;
    return { x, y };
  }

  private layout(): void {
    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;
    if (this.focus >= 0) {
      this.renderer.zoom = Math.max(0.4, Math.min((cssW * 0.7) / (R_FOCUS * 3), (cssH * 0.7) / (R_FOCUS * 3)));
    } else {
      const rows = Math.ceil(this.variants.length / COLS);
      const gridW = COLS * CELL;
      const gridH = rows * CELL;
      this.renderer.zoom = Math.max(0.2, Math.min((cssW * 0.94) / gridW, (cssH * 0.88) / gridH));
    }
    this.renderer.resize();
    this.bloom.resize(this.renderer.canvasWidth, this.renderer.canvasHeight);
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
      'position:absolute;left:50%;top:8px;transform:translateX(-50%);color:#7fd8ff;' +
      'font-size:15px;font-weight:bold;letter-spacing:2px;text-shadow:0 0 8px #3af;';
    title.textContent = 'GLASS LAB — CHROMATIC PHOTON-RING VARIANTS';
    this.labelRoot.appendChild(title);

    const hint = document.createElement('div');
    hint.style.cssText = 'position:absolute;left:50%;top:30px;transform:translateX(-50%);color:#5aa;font-size:11px;';
    hint.textContent = `1-9 focus · [ ] dispersion ${this.dispMult.toFixed(1)}× · -/= mass ${this.inst.toFixed(2)} · G grid · B bloom · L labels · R reset`;
    this.labelRoot.appendChild(hint);

    if (this.focus >= 0) {
      const v = this.variants[this.focus];
      const s = this.worldToScreen(0, -R_FOCUS * 1.35);
      this.appendLabel(s.x, s.y, v.name, v.desc, 240);
      return;
    }
    for (let i = 0; i < this.variants.length; i++) {
      const p = this.cellPos(i);
      const s = this.worldToScreen(p.x, p.y - R_GRID * 1.7);
      const v = this.variants[i];
      this.appendLabel(s.x, s.y, v.name, v.desc, Math.max(120, CELL * this.renderer.zoom - 20));
    }
  }

  private appendLabel(x: number, y: number, name: string, desc: string, width: number): void {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      `position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,0);width:${width}px;text-align:center;`;
    const nm = document.createElement('div');
    nm.style.cssText = 'color:#e6f7ff;font-size:12px;font-weight:bold;';
    nm.textContent = name;
    const ds = document.createElement('div');
    ds.style.cssText = 'color:#8fb8cc;font-size:9.5px;line-height:1.2;margin-top:2px;word-wrap:break-word;';
    ds.textContent = desc;
    wrap.append(nm, ds);
    this.labelRoot.appendChild(wrap);
  }

  // ============================================================
  // Loop
  // ============================================================
  update(dt: number): void {
    if (this.paused) return;
    this.totalTime += dt;
    this.grid.update(dt);
  }

  private drawHole(cx: number, cy: number, radius: number): void {
    // Dark void body with a faint inner glow so it reads as a hole, not a hollow ring.
    this.renderer.drawFilledCircle(cx, cy, radius * 0.92, BLACKHOLE_PALETTE.voidBlack, 40, 1);
  }

  render(): void {
    this.renderer.cameraX = 0;
    this.renderer.cameraY = 0;
    this.bloom.shakeIntensity = 0;
    this.bloom.time = this.totalTime / 1000;

    const t = this.totalTime / 1000;
    const baseDisp = (2.2 + this.inst * 4.5) * this.dispMult;

    const drawScene = (): void => {
      if (this.gridOn) this.grid.render(0, 0, this.renderer.width, this.renderer.height);
      this.renderer.begin(!this.gridOn);
      this.starfield.render(this.renderer, 0, 0);

      // Normal pass — void bodies.
      if (this.focus >= 0) {
        this.drawHole(0, 0, R_FOCUS);
      } else {
        for (let i = 0; i < this.variants.length; i++) {
          const p = this.cellPos(i);
          this.drawHole(p.x, p.y, R_GRID);
        }
      }

      // Additive pass — the chromatic rings.
      this.renderer.setBlendMode('additive');
      if (this.focus >= 0) {
        const r = R_FOCUS;
        this.variants[this.focus].draw(0, 0, r, baseDisp * (r / R_GRID) * 0.35, this.inst, t);
      } else {
        for (let i = 0; i < this.variants.length; i++) {
          const p = this.cellPos(i);
          this.variants[i].draw(p.x, p.y, R_GRID, baseDisp, this.inst, t);
        }
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
    if (code.startsWith('Digit')) {
      const n = parseInt(code.slice(5), 10);
      if (n === 0) { this.focus = -1; }
      else if (n >= 1 && n <= this.variants.length) {
        this.focus = this.focus === n - 1 ? -1 : n - 1;
      }
      this.layout();
      return;
    }
    switch (code) {
      case 'Space': this.paused = !this.paused; break;
      case 'KeyG': this.gridOn = !this.gridOn; break;
      case 'KeyB': this.bloomOn = !this.bloomOn; break;
      case 'KeyL':
        this.labelsOn = !this.labelsOn;
        this.labelRoot.style.display = this.labelsOn ? 'block' : 'none';
        break;
      case 'BracketLeft': this.dispMult = Math.max(0.2, this.dispMult - 0.2); this.buildLabels(); break;
      case 'BracketRight': this.dispMult = Math.min(5, this.dispMult + 0.2); this.buildLabels(); break;
      case 'Minus': this.inst = Math.max(0, this.inst - 0.1); this.buildLabels(); break;
      case 'Equal': this.inst = Math.min(1, this.inst + 0.1); this.buildLabels(); break;
      case 'KeyR': this.dispMult = 1; this.inst = 0.55; this.focus = -1; this.layout(); break;
    }
  }
}
