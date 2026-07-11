import { Renderer } from './renderer/sprite-batch';
import { BloomPass } from './renderer/bloom';
import { SpringMassGrid } from './renderer/grid';
import { Starfield } from './renderer/starfield';
import { ParticleField, FieldAttractor, FieldView } from './renderer/particle-field';
import { BlackHole } from './entities/enemies/blackhole';
import { Vec2 } from './core/vector';
import { gameSettings } from './settings';
import { BLACKHOLE_PALETTE } from './config';

/**
 * Taxonomy Lab (`?taxonomy=1`) — a labeled anatomy chart of every visual effect layered
 * onto a BlackHole. Built to answer "we have particles, but there's ALSO something else
 * swirling around the hole and I don't know what it's called."
 *
 * The answer: there are THREE distinct in-class particle systems that swirl around a hole
 * (all separate from the external ambient ParticleField "dust"):
 *   · Swirl Arms   (BlackHole.swirlParticles → renderSwirlArms) — 4 spiral accretion streams
 *   · Orbit Dots   (BlackHole.horizonParticles)                 — dots circling the ring
 *   · Infall Streaks (BlackHole.infallStreaks)                  — matter raining inward
 *
 * Each is rendered SOLO in its own labeled cell (via the new showSwirlArms / showOrbitDots /
 * showInfallStreaks flags on BlackHole) so you can see exactly what each named layer is, and
 * pick which to graft onto the Circle enemy. The 4 accretion-disc *modes* and the ambient
 * dust field get their own cells too, for direct side-by-side comparison.
 *
 * Toggles (also on window.taxonomyLab): Space pause · G grid · B bloom · L labels.
 */

const COLS = 4;
const CELL_W = 300;
const CELL_H = 300;
const HEADER_H = 150;
const FED = 7; // absorbedCount for every hole so the effects are rich (radius ~47)

type CellKind = 'bh' | 'dust';

interface Cell {
  name: string;
  desc: string;
  kind: CellKind;
  bh?: BlackHole;
  /** per-frame hook (hit sparks, destabilize clamp, dust view) */
  tick?: (dt: number, cx: number, cy: number) => void;
  worldX: number;
  worldY: number;
}

interface Section { title: string; cells: Cell[]; headerWorldY: number; }

export class TaxonomyLab {
  private renderer: Renderer;
  private bloom: BloomPass;
  private grid: SpringMassGrid;
  private starfield: Starfield;
  private field: ParticleField;
  private dustView: FieldView = { cx: 0, cy: 0, halfW: CELL_W * 0.42, halfH: CELL_H * 0.42 };
  private dustAttractor: FieldAttractor = { x: 0, y: 0, strength: 2400, radius: CELL_W * 0.55, swirl: 0.9 };

  private sections: Section[] = [];
  private totalTime = 0;

  paused = false;
  gridOn = false;
  bloomOn = true;
  labelsOn = true;

  private labelRoot: HTMLDivElement;
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
    this.starfield = new Starfield(120, gameSettings.arenaWidth, gameSettings.arenaHeight);
    this.field = new ParticleField();
    this.field.density = 150;
    this.field.swirl = 0.9;
    this.field.streak = 3.2; // longer streaks read as accretion-disk arcs at this zoom

    this.labelRoot = document.createElement('div');
    this.labelRoot.id = 'taxonomy-labels';
    this.labelRoot.style.cssText = 'position:fixed;inset:0;pointer-events:none;font-family:monospace;z-index:20;';
    document.body.appendChild(this.labelRoot);

    this.build();
    this.layout();

    window.addEventListener('resize', () => { this.renderer.resize(); this.layout(); });
    window.addEventListener('keydown', (e) => this.onKeyDown(e.code));
  }

  // ============================================================
  // Cell construction
  // ============================================================
  /** A fed BlackHole configured with a specific visual mode + component-visibility flags. */
  private makeHole(
    mode: BlackHole['visualMode'],
    opts: { arms?: boolean; dots?: boolean; streaks?: boolean } = {},
  ): BlackHole {
    const bh = new BlackHole();
    bh.visualMode = mode;
    bh.active = true;
    bh.spawnTimer = 0;
    bh.absorbedCount = FED;
    bh.collisionRadius = 30 + FED * 2.5;
    bh.showSwirlArms = opts.arms ?? true;
    bh.showOrbitDots = opts.dots ?? true;
    bh.showInfallStreaks = opts.streaks ?? true;
    return bh;
  }

  private bhCell(name: string, desc: string, bh: BlackHole, tick?: Cell['tick']): Cell {
    return { name, desc, kind: 'bh', bh, tick, worldX: 0, worldY: 0 };
  }

  private build(): void {
    // Row 1 — the four named accretion-disc *modes* (each hole's "visualMode").
    const modes: Cell[] = [
      this.bhCell('Dense Core', 'visualMode "dense" — layered halos + thick ring band', this.makeHole('dense')),
      this.bhCell('Nebula Haze', 'visualMode "haze" — soft gaseous cloud, no hard ring', this.makeHole('haze')),
      this.bhCell('Solar Corona', 'visualMode "corona" — radial sun-like spikes', this.makeHole('corona')),
      this.bhCell('Molten Band', 'visualMode "molten" — thick solid ring + hot-spot flares', this.makeHole('molten')),
    ];

    // Row 2 — ANATOMY: isolate each in-class particle system on a dense hole. "Static"
    // is the reference frame (void + ring + halo, all particles off); each following cell
    // adds back exactly one system so you can name what you're seeing.
    const anatomy: Cell[] = [
      this.bhCell('Static Core + Ring', 'void + ring + halo (all particles OFF)',
        this.makeHole('dense', { arms: false, dots: false, streaks: false })),
      this.bhCell('① Swirl Arms', 'swirlParticles → 4 spiral accretion streams',
        this.makeHole('dense', { arms: true, dots: false, streaks: false })),
      this.bhCell('② Orbit Dots', 'horizonParticles → dots orbiting the ring',
        this.makeHole('dense', { arms: false, dots: true, streaks: false })),
      this.bhCell('③ Infall Streaks', 'infallStreaks → matter raining inward',
        this.makeHole('dense', { arms: false, dots: false, streaks: true })),
    ];

    // Row 3 — RELATED SYSTEMS: the external dust field (the "particles" already on circles),
    // the destabilize telegraph, the bullet-hit sparks, and the fully-combined hole.
    const destabHole = this.makeHole('molten');
    destabHole.destabilizing = true;
    destabHole.destabilizeTimer = 700;
    const hitHole = this.makeHole('dense');
    let hitTimer = 0;

    const related: Cell[] = [
      { name: '④ Ambient Dust Field', desc: 'ParticleField "cosmic dust" — the particles you already ported to Circles',
        kind: 'dust', worldX: 0, worldY: 0 },
      this.bhCell('Destabilize Telegraph', 'pre-supernova warning: warning ring + discharge arcs', destabHole,
        () => {
          destabHole.overloaded = false;
          destabHole.destabilizing = true;
          if (destabHole.destabilizeTimer > 1300) destabHole.destabilizeTimer = 600; // keep pulsing
        }),
      this.bhCell('Hit Sparks', 'bullet-impact feedback: ring pulse + emitted spark puff', hitHole,
        (dt) => {
          hitTimer -= dt;
          if (hitTimer <= 0) {
            hitTimer = 520;
            const a = Math.random() * Math.PI * 2;
            (hitHole as unknown as { registerHit(angle: number): void }).registerHit(a + Math.PI);
          }
        }),
      this.bhCell('Full — all combined', 'everything layered: the complete live hole', this.makeHole('dense')),
    ];

    this.sections = [
      { title: 'ACCRETION-DISC MODES (visualMode)', cells: modes, headerWorldY: 0 },
      { title: 'ANATOMY — the swirling systems, isolated', cells: anatomy, headerWorldY: 0 },
      { title: 'RELATED SYSTEMS', cells: related, headerWorldY: 0 },
    ];
  }

  // ============================================================
  // Layout
  // ============================================================
  private layout(): void {
    let totalH = 0;
    for (const s of this.sections) totalH += HEADER_H + Math.ceil(s.cells.length / COLS) * CELL_H;
    totalH += CELL_H * 0.4;
    this.totalWorldH = totalH;

    const cssW = this.canvas.clientWidth || window.innerWidth;
    const cssH = this.canvas.clientHeight || window.innerHeight;
    const gridW = COLS * CELL_W;
    const zoom = Math.min((cssW * 0.94) / gridW, (cssH * 0.92) / totalH);
    this.renderer.zoom = Math.max(0.2, zoom);
    this.renderer.resize();
    this.bloom.resize(this.renderer.canvasWidth, this.renderer.canvasHeight);

    let y = totalH / 2;
    for (const s of this.sections) {
      y -= HEADER_H;
      s.headerWorldY = y + HEADER_H * 0.34;
      const rows = Math.ceil(s.cells.length / COLS);
      for (let r = 0; r < rows; r++) {
        const rowY = y - CELL_H / 2 - r * CELL_H;
        const rowItems = s.cells.slice(r * COLS, r * COLS + COLS);
        for (let c = 0; c < rowItems.length; c++) {
          const x = (c - (rowItems.length - 1) / 2) * CELL_W;
          rowItems[c].worldX = x;
          rowItems[c].worldY = rowY;
          if (rowItems[c].bh) rowItems[c].bh!.position.set(x, rowY);
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

    const title = document.createElement('div');
    title.style.cssText =
      'position:absolute;left:50%;top:8px;transform:translateX(-50%);color:#7fd8ff;' +
      'font-size:15px;font-weight:bold;letter-spacing:2px;text-shadow:0 0 8px #3af;';
    title.textContent = 'TAXONOMY LAB — BLACKHOLE EFFECT ANATOMY';
    this.labelRoot.appendChild(title);

    const hint = document.createElement('div');
    hint.style.cssText = 'position:absolute;left:50%;top:30px;transform:translateX(-50%);color:#5aa;font-size:11px;';
    hint.textContent = 'Space pause · G grid · B bloom · L labels';
    this.labelRoot.appendChild(hint);

    for (const s of this.sections) {
      const h = this.worldToScreen(0, s.headerWorldY);
      const header = document.createElement('div');
      header.style.cssText =
        `position:absolute;left:${h.x}px;top:${h.y}px;transform:translate(-50%,-50%);` +
        'color:#ffd24a;font-size:13px;font-weight:bold;letter-spacing:2px;white-space:nowrap;' +
        'text-shadow:0 0 6px rgba(255,180,40,0.6);';
      header.textContent = `— ${s.title} —`;
      this.labelRoot.appendChild(header);

      const cellPx = Math.max(90, CELL_W * this.renderer.zoom - 12);
      for (const cell of s.cells) {
        const sc = this.worldToScreen(cell.worldX, cell.worldY - CELL_H * 0.42);
        const wrap = document.createElement('div');
        wrap.style.cssText =
          `position:absolute;left:${sc.x}px;top:${sc.y}px;transform:translate(-50%,0);` +
          `width:${cellPx}px;text-align:center;`;
        const nm = document.createElement('div');
        nm.style.cssText = 'color:#e6f7ff;font-size:12px;font-weight:bold;';
        nm.textContent = cell.name;
        const ds = document.createElement('div');
        ds.style.cssText = 'color:#8fb8cc;font-size:9.5px;line-height:1.2;margin-top:2px;word-wrap:break-word;';
        ds.textContent = cell.desc;
        wrap.append(nm, ds);
        this.labelRoot.appendChild(wrap);
      }
    }
  }

  // ============================================================
  // Loop
  // ============================================================
  update(dt: number): void {
    if (this.paused) return;
    this.totalTime += dt;
    let dustCell: Cell | null = null;
    for (const s of this.sections) {
      for (const cell of s.cells) {
        if (cell.bh) {
          (cell.bh as unknown as { update(dt: number, p?: Vec2): void }).update(dt, null as unknown as Vec2);
          cell.bh.position.set(cell.worldX, cell.worldY);
        }
        if (cell.kind === 'dust') dustCell = cell;
        cell.tick?.(dt, cell.worldX, cell.worldY);
      }
    }
    // Dust field localized to its cell (motes wrap within that cell's box).
    if (dustCell) {
      this.dustView.cx = dustCell.worldX;
      this.dustView.cy = dustCell.worldY;
      this.dustAttractor.x = dustCell.worldX;
      this.dustAttractor.y = dustCell.worldY;
      this.field.update(dt, [this.dustAttractor], this.dustView);
    }
    this.grid.update(dt);
  }

  render(): void {
    this.renderer.cameraX = 0;
    this.renderer.cameraY = 0;
    this.bloom.shakeIntensity = 0;
    this.bloom.time = this.totalTime / 1000;

    const drawScene = (): void => {
      if (this.gridOn) this.grid.render(0, 0, this.renderer.width, this.renderer.height);
      this.renderer.begin(!this.gridOn);
      this.starfield.render(this.renderer, 0, 0);

      // Normal pass: BlackHole bodies + a small void reference disc in the dust cell.
      for (const s of this.sections) {
        for (const cell of s.cells) {
          if (cell.bh) cell.bh.render(this.renderer);
          else if (cell.kind === 'dust') {
            this.renderer.drawFilledCircle(cell.worldX, cell.worldY, 20, BLACKHOLE_PALETTE.voidBlack, 24, 1);
            this.renderer.drawCircle(cell.worldX, cell.worldY, 21, BLACKHOLE_PALETTE.horizonRing, 32, 0.5);
          }
        }
      }

      // Additive pass: ambient dust field.
      this.renderer.setBlendMode('additive');
      this.field.render(this.renderer);
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
      case 'KeyL':
        this.labelsOn = !this.labelsOn;
        this.labelRoot.style.display = this.labelsOn ? 'block' : 'none';
        break;
    }
  }
}
