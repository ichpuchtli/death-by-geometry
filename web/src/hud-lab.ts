/**
 * HUD Lab (`?hud=1`) — a full-screen chooser for a COHERENT in-game HUD.
 *
 * The shipped HUD grew ad-hoc: score (green 24px), lives (green), FPS (color-coded),
 * status chips (red/green), and the Dark Matter meter (purple, bottom-center, always on)
 * each carry their own font/color/anchor, and the mobile TIME button is painted even when
 * there's no charge to spend. This lab renders several complete candidate layouts — each a
 * self-consistent design system (one type ramp, one anchoring grammar, one accent language) —
 * over a live animated background so legibility over real gameplay can be judged, then A/B'd.
 *
 * Unlike the game HUD this is fully self-contained on the 2D canvas (its own faux background),
 * so nothing here touches the WebGL renderer or the real HUD until a candidate is picked & ported.
 *
 * Keys (also on window.hudLab):
 *   1-4   select a candidate layout (full-screen)
 *   T     toggle touch/mobile chrome (shows the TIME hold button + joysticks)
 *   [ ]   dark matter charge −/+   ·   H harvesting (near a black hole)   ·   Space hold time-dilation
 *   G     toggle "game over" preview off (n/a — playing only)   ·   L labels
 *   ,/.   lives −/+     ·   R reset knobs
 */

type Vec = { x: number; y: number };

interface LabState {
  score: number;
  lives: number;
  maxLives: number;
  charge: number;      // 0..capacity
  capacity: number;
  minActivation: number;
  harvesting: boolean; // near a black hole, refilling
  active: boolean;     // time dilation engaged (space held)
  buttonPressed: boolean;
  touchMode: boolean;
  fps: number;
  enemies: number;
  phase: string;
  time: number;        // ms accumulator
}

interface Candidate {
  name: string;
  desc: string;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, s: LabState) => void;
}

// --- shared design tokens ---
const FONT = 'monospace';
const ACCENT = '#38f2c8';       // unified primary accent (teal-green) — replaces the raw #20ff20
const ACCENT_DIM = '#1c7d68';
const DM = '#9a7cff';           // dark matter violet
const DM_HOT = '#d9faff';       // harvest/core white-cyan
const WARN = '#ff5a6e';
const INK = 'rgba(6, 10, 14, 0.62)'; // shared panel ink
const RULE = 'rgba(120, 200, 190, 0.28)';

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function glowText(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  font: string, color: string, glow: string, blur = 8,
): void {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = glow;
  ctx.shadowColor = glow;
  ctx.shadowBlur = blur;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Rounded-rect panel — the shared "chip" container every candidate reuses. */
function chip(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  r: number, stroke = RULE, fill = INK,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

/** Lives as ship-chevron pips — one consistent icon everywhere lives appear. */
function livesPips(
  ctx: CanvasRenderingContext2D, x: number, y: number, count: number, max: number,
  size: number, color: string, align: 'left' | 'right',
): void {
  const gap = size * 1.9;
  for (let i = 0; i < max; i++) {
    const filled = i < count;
    const cx = align === 'left' ? x + i * gap : x - i * gap;
    ctx.save();
    ctx.translate(cx, y);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.8, size * 0.7);
    ctx.lineTo(0, size * 0.35);
    ctx.lineTo(-size * 0.8, size * 0.7);
    ctx.closePath();
    if (filled) {
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.fill();
    } else {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(150,170,180,0.35)';
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * The Dark Matter readout, unified across candidates: it only asserts itself when RELEVANT.
 * mode 'idle' when empty & not near a hole → nearly invisible ghost; 'ready' when spendable;
 * 'harvest' when filling; 'active' when engaged. Returned so candidates can place it.
 */
function dmVisibility(s: LabState): { alpha: number; usable: boolean; label: string; color: string } {
  const frac = s.charge / s.capacity;
  const usable = s.charge >= s.minActivation;
  let alpha = 0.14; // ghost when irrelevant
  if (s.active) alpha = 1;
  else if (s.harvesting) alpha = 0.95;
  else if (usable) alpha = 0.8;
  else if (frac > 0) alpha = 0.4;
  const color = s.active ? DM_HOT : s.harvesting ? '#a8f4ff' : usable ? DM : DM_ACCENT_DIM;
  const label = s.active ? 'TIME DILATION' : s.harvesting ? 'HARVESTING' : usable ? 'DARK MATTER' : 'DARK MATTER';
  return { alpha, usable, label, color };
}
const DM_ACCENT_DIM = '#5a4b8a';

// A compact segmented dark-matter bar drawn horizontally from (x,y), width w.
function dmSegBar(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  s: LabState, vis: { alpha: number; usable: boolean; color: string }, pulse: number,
): void {
  const segs = 10;
  const activeThresh = s.minActivation / s.capacity;
  const gap = 2;
  const sw = (w - gap * (segs - 1)) / segs;
  const frac = s.charge / s.capacity;
  ctx.save();
  ctx.globalAlpha = vis.alpha;
  for (let i = 0; i < segs; i++) {
    const segFrac = (i + 1) / segs;
    const on = frac >= segFrac - 1e-6 || (frac > (i / segs) && frac < segFrac);
    const partial = frac > i / segs && frac < segFrac ? (frac - i / segs) * segs : on ? 1 : 0;
    const sx = x + i * (sw + gap);
    // segment shell
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(sx, y, sw, h);
    if (partial > 0) {
      const lit = segFrac <= activeThresh ? '#7a5be0' : vis.color;
      ctx.fillStyle = lit;
      ctx.shadowColor = lit;
      ctx.shadowBlur = s.active || s.harvesting ? 6 + pulse * 6 : 3;
      ctx.fillRect(sx, y, sw * partial, h);
      ctx.shadowBlur = 0;
    }
  }
  // activation threshold notch
  const nx = x + w * activeThresh;
  ctx.globalAlpha = vis.alpha * (vis.usable ? 0.5 : 0.85);
  ctx.strokeStyle = vis.usable ? RULE : WARN;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(nx, y - 2);
  ctx.lineTo(nx, y + h + 2);
  ctx.stroke();
  ctx.restore();
}

/** Mobile TIME hold button — gated: hidden below activation, ghosted approaching it. */
function timeButton(ctx: CanvasRenderingContext2D, bx: number, by: number, r: number, s: LabState, pulse: number): void {
  const usable = s.charge >= s.minActivation;
  const frac = s.charge / s.capacity;
  // Below activation: don't paint a solid dead button — fade it in as charge approaches.
  let alpha = 0;
  if (s.active) alpha = 1;
  else if (usable) alpha = 0.85;
  else if (frac > 0.4) alpha = (frac - 0.4) / (1 - 0.4) * 0.5; // ghost-in approaching readiness
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fillStyle = s.buttonPressed ? 'rgba(150, 95, 245, 0.72)' : s.active ? 'rgba(120, 70, 225, 0.55)' : 'rgba(40, 24, 70, 0.5)';
  ctx.fill();
  // charge ring around the button doubles as the meter on mobile
  ctx.beginPath();
  ctx.arc(bx, by, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
  ctx.strokeStyle = s.active ? DM_HOT : usable ? DM : DM_ACCENT_DIM;
  ctx.lineWidth = 3;
  ctx.shadowColor = ctx.strokeStyle as string;
  ctx.shadowBlur = usable ? 8 + pulse * 6 : 0;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  glowText(ctx, 'TIME', bx, by, `bold 11px ${FONT}`, '#e6dcff', '#7040cc', usable ? 10 : 3);
  ctx.restore();
}

function scoreStr(n: number): string {
  return n.toString().padStart(6, '0');
}

// ============================ CANDIDATES ============================

const CANDIDATES: Candidate[] = [
  // ---------- 1. Corner Rails ----------
  {
    name: 'Corner Rails',
    desc: 'Everything hugs the corners in matching chips; dark matter is a thin rail on the LEFT edge — out of the play space, only bright when spendable.',
    draw(ctx, w, h, s) {
      const pulse = 0.5 + 0.5 * Math.sin(s.time / 320);
      const vis = dmVisibility(s);
      // score chip — top-left
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      chip(ctx, 18, 16, 172, 40, 8);
      glowText(ctx, 'SCORE', 32, 30, `10px ${FONT}`, ACCENT_DIM, ACCENT_DIM, 0);
      glowText(ctx, scoreStr(s.score), 32, 44, `bold 20px ${FONT}`, ACCENT, ACCENT, 8);
      // lives chip — top-right
      chip(ctx, w - 18 - 150, 16, 150, 40, 8);
      ctx.textAlign = 'left';
      glowText(ctx, 'LIVES', w - 18 - 136, 30, `10px ${FONT}`, ACCENT_DIM, ACCENT_DIM, 0);
      livesPips(ctx, w - 18 - 134, 44, s.lives, s.maxLives, 7, ACCENT, 'left');
      // dark matter — vertical rail hugging the left edge, vertically centered
      const railH = Math.min(240, h * 0.4);
      const railX = 20;
      const railY = (h - railH) / 2;
      ctx.save();
      ctx.globalAlpha = vis.alpha;
      chip(ctx, railX - 5, railY - 22, 26, railH + 40, 8, `rgba(140,120,220,${0.3})`);
      const frac = s.charge / s.capacity;
      // fill from bottom up
      const fillH = railH * frac;
      const grad = ctx.createLinearGradient(0, railY + railH, 0, railY);
      grad.addColorStop(0, '#4a2a9a');
      grad.addColorStop(1, vis.color);
      ctx.fillStyle = grad;
      ctx.shadowColor = vis.color;
      ctx.shadowBlur = s.active || s.harvesting ? 6 + pulse * 6 : 2;
      ctx.fillRect(railX, railY + railH - fillH, 6, fillH);
      ctx.shadowBlur = 0;
      // activation notch
      const ny = railY + railH * (1 - s.minActivation / s.capacity);
      ctx.strokeStyle = vis.usable ? RULE : WARN;
      ctx.beginPath();
      ctx.moveTo(railX - 3, ny);
      ctx.lineTo(railX + 9, ny);
      ctx.stroke();
      ctx.restore();
      // vertical label
      ctx.save();
      ctx.globalAlpha = vis.alpha;
      ctx.translate(railX + 2, railY - 8);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      glowText(ctx, vis.label, 0, 0, `9px ${FONT}`, vis.color, vis.color, vis.usable ? 6 : 0);
      ctx.restore();
      if (s.touchMode) timeButton(ctx, w - 82, h - 176, 34, s, pulse);
    },
  },

  // ---------- 2. Bottom Cockpit ----------
  {
    name: 'Bottom Cockpit',
    desc: 'A single bottom status rail: lives left, dark matter center (segmented, ghosts out when empty), score right. Top of screen kept clear for the action.',
    draw(ctx, w, h, s) {
      const pulse = 0.5 + 0.5 * Math.sin(s.time / 320);
      const vis = dmVisibility(s);
      const railY = h - 54;
      // continuous cockpit rail
      chip(ctx, 16, railY, w - 32, 40, 10);
      // lives — left
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      glowText(ctx, 'LIVES', 34, railY + 20, `10px ${FONT}`, ACCENT_DIM, ACCENT_DIM, 0);
      livesPips(ctx, 90, railY + 20, s.lives, s.maxLives, 7, ACCENT, 'left');
      // score — right
      ctx.textAlign = 'right';
      glowText(ctx, scoreStr(s.score), w - 34, railY + 20, `bold 20px ${FONT}`, ACCENT, ACCENT, 8);
      ctx.textAlign = 'left';
      glowText(ctx, 'SCORE', w - 34 - ctx.measureText(scoreStr(s.score)).width * 1.25 - 52, railY + 20, `10px ${FONT}`, ACCENT_DIM, ACCENT_DIM, 0);
      // dark matter — center segmented
      const barW = Math.min(280, w * 0.3);
      const barX = (w - barW) / 2;
      ctx.save();
      ctx.globalAlpha = vis.alpha;
      ctx.textAlign = 'center';
      glowText(ctx, vis.label, w / 2, railY + 13, `bold 9px ${FONT}`, vis.color, vis.color, vis.usable ? 6 : 0);
      ctx.restore();
      dmSegBar(ctx, barX, railY + 22, barW, 8, s, vis, pulse);
      if (s.touchMode) timeButton(ctx, w - 82, h - 176, 34, s, pulse);
    },
  },

  // ---------- 3. Diegetic Ring ----------
  {
    name: 'Diegetic Ring',
    desc: 'Score/lives as slim top chips; dark matter lives ONLY as a charge ring — around the mobile TIME button, or a compact corner dial on desktop. Zero center clutter.',
    draw(ctx, w, h, s) {
      const pulse = 0.5 + 0.5 * Math.sin(s.time / 320);
      const vis = dmVisibility(s);
      const frac = s.charge / s.capacity;
      // slim top-center combined chip
      const cw = 300;
      chip(ctx, (w - cw) / 2, 14, cw, 34, 8);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      glowText(ctx, scoreStr(s.score), (w - cw) / 2 + 18, 31, `bold 18px ${FONT}`, ACCENT, ACCENT, 8);
      livesPips(ctx, (w + cw) / 2 - 22, 31, s.lives, s.maxLives, 6, ACCENT, 'right');
      // desktop dark-matter dial — bottom-right corner
      if (!s.touchMode) {
        const dx = w - 60;
        const dy = h - 60;
        const r = 30;
        ctx.save();
        ctx.globalAlpha = vis.alpha;
        ctx.beginPath();
        ctx.arc(dx, dy, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(dx, dy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.strokeStyle = vis.color;
        ctx.lineWidth = 5;
        ctx.shadowColor = vis.color;
        ctx.shadowBlur = s.active || s.harvesting ? 8 + pulse * 6 : 2;
        ctx.stroke();
        ctx.shadowBlur = 0;
        // activation tick
        const a = -Math.PI / 2 + Math.PI * 2 * (s.minActivation / s.capacity);
        ctx.strokeStyle = vis.usable ? RULE : WARN;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(dx + Math.cos(a) * (r - 6), dy + Math.sin(a) * (r - 6));
        ctx.lineTo(dx + Math.cos(a) * (r + 6), dy + Math.sin(a) * (r + 6));
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        glowText(ctx, s.active ? 'TIME' : 'DM', dx, dy, `bold 10px ${FONT}`, vis.color, vis.color, vis.usable ? 6 : 0);
        ctx.globalAlpha = vis.alpha * 0.8;
        glowText(ctx, '[SPACE]', dx, dy + r + 12, `8px ${FONT}`, DM_ACCENT_DIM, DM_ACCENT_DIM, 0);
        ctx.restore();
      } else {
        timeButton(ctx, w - 82, h - 176, 36, s, pulse);
      }
    },
  },

  // ---------- 4. Minimal HUD ----------
  {
    name: 'Minimal HUD',
    desc: 'No chips at all — bare glowing type in one accent. Score top-left, lives as pips beneath it, dark matter a hairline under the score that only appears when it matters.',
    draw(ctx, w, h, s) {
      const pulse = 0.5 + 0.5 * Math.sin(s.time / 320);
      const vis = dmVisibility(s);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      glowText(ctx, scoreStr(s.score), 24, 20, `bold 26px ${FONT}`, ACCENT, ACCENT, 10);
      livesPips(ctx, 30, 62, s.lives, s.maxLives, 7, ACCENT, 'left');
      // dark matter hairline under the score, appears only when relevant
      const barW = 168;
      const by = 78;
      ctx.save();
      ctx.globalAlpha = vis.alpha;
      const frac = s.charge / s.capacity;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(24, by, barW, 3);
      const lit = vis.color;
      ctx.fillStyle = lit;
      ctx.shadowColor = lit;
      ctx.shadowBlur = s.active || s.harvesting ? 6 + pulse * 6 : 2;
      ctx.fillRect(24, by, barW * frac, 3);
      ctx.shadowBlur = 0;
      const nx = 24 + barW * (s.minActivation / s.capacity);
      ctx.fillStyle = vis.usable ? RULE : WARN;
      ctx.fillRect(nx, by - 2, 1, 7);
      if (vis.alpha > 0.3) {
        ctx.globalAlpha = vis.alpha;
        glowText(ctx, vis.label + (s.touchMode ? '' : '  [SPACE]'), 24, by + 6, `9px ${FONT}`, vis.color, vis.color, vis.usable ? 5 : 0);
      }
      ctx.restore();
      if (s.touchMode) timeButton(ctx, w - 82, h - 176, 34, s, pulse);
    },
  },
];

// ============================ LAB ============================

interface Star { x: number; y: number; z: number; }
interface Blob { p: Vec; v: Vec; r: number; hue: number; sides: number; rot: number; spin: number; }

export class HudLab {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private labelRoot: HTMLDivElement;
  private stars: Star[] = [];
  private blobs: Blob[] = [];
  private rngSeed = 1337;

  paused = false;
  labelsOn = true;
  focus = 0; // which candidate

  state: LabState = {
    score: 24850,
    lives: 4,
    maxLives: 5,
    charge: 62,
    capacity: 100,
    minActivation: 10,
    harvesting: false,
    active: false,
    buttonPressed: false,
    touchMode: false,
    fps: 120,
    enemies: 38,
    phase: 'RAMP UP',
    time: 0,
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('HUD Lab needs a 2d context');
    this.ctx = ctx;
    canvas.style.cursor = 'default';
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // deterministic pseudo-random background (no Math.random for reproducible screenshots)
    for (let i = 0; i < 140; i++) {
      this.stars.push({ x: this.rand() * 2000, y: this.rand() * 1200, z: 0.3 + this.rand() * 0.7 });
    }
    for (let i = 0; i < 9; i++) {
      this.blobs.push({
        p: { x: this.rand() * 1600, y: this.rand() * 900 },
        v: { x: (this.rand() - 0.5) * 0.04, y: (this.rand() - 0.5) * 0.04 },
        r: 30 + this.rand() * 60,
        hue: 140 + this.rand() * 180,
        sides: 3 + Math.floor(this.rand() * 4),
        rot: this.rand() * 6.28,
        spin: (this.rand() - 0.5) * 0.002,
      });
    }

    this.labelRoot = document.createElement('div');
    this.labelRoot.id = 'hud-lab-labels';
    // Anchored to the mid-left empty band (clear of every candidate's chips/rails)
    // so the bottom-cockpit layout isn't obscured by the readout.
    Object.assign(this.labelRoot.style, {
      position: 'fixed', left: '0', top: '46%', padding: '10px 14px',
      font: '12px monospace', color: '#bfe', pointerEvents: 'none',
      textShadow: '0 0 6px rgba(0,0,0,0.9)', lineHeight: '1.5', maxWidth: '46vw',
    });
    document.body.appendChild(this.labelRoot);

    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  private rand(): number {
    // xorshift-ish deterministic
    this.rngSeed ^= this.rngSeed << 13;
    this.rngSeed ^= this.rngSeed >> 17;
    this.rngSeed ^= this.rngSeed << 5;
    return ((this.rngSeed >>> 0) % 100000) / 100000;
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private onKey(e: KeyboardEvent): void {
    const s = this.state;
    switch (e.key) {
      case '1': case '2': case '3': case '4': {
        const i = parseInt(e.key, 10) - 1;
        if (i < CANDIDATES.length) this.focus = i;
        break;
      }
      case 't': case 'T': s.touchMode = !s.touchMode; break;
      case 'h': case 'H': s.harvesting = !s.harvesting; break;
      case ' ': s.active = !s.active; s.buttonPressed = s.active; e.preventDefault(); break;
      case '[': s.charge = clamp(s.charge - 8, 0, s.capacity); break;
      case ']': s.charge = clamp(s.charge + 8, 0, s.capacity); break;
      case ',': s.lives = clamp(s.lives - 1, 0, s.maxLives); break;
      case '.': s.lives = clamp(s.lives + 1, 0, s.maxLives); break;
      case 'l': case 'L': this.labelsOn = !this.labelsOn; break;
      case 'p': case 'P': this.paused = !this.paused; break;
      case 'r': case 'R':
        Object.assign(s, { charge: 62, lives: 4, harvesting: false, active: false, buttonPressed: false });
        break;
    }
  }

  update(dt: number): void {
    if (this.paused) return;
    const s = this.state;
    s.time += dt;
    // simulate charge dynamics so meters animate
    if (s.active && s.charge > 0) {
      s.charge = clamp(s.charge - (20 * dt) / 1000, 0, s.capacity);
      if (s.charge <= 0) { s.active = false; s.buttonPressed = false; }
    } else if (s.harvesting) {
      s.charge = clamp(s.charge + (24 * dt) / 1000, 0, s.capacity);
    }
    // background drift
    for (const b of this.blobs) {
      b.p.x += b.v.x * dt;
      b.p.y += b.v.y * dt;
      b.rot += b.spin * dt;
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      if (b.p.x < -80) b.p.x = w + 80;
      if (b.p.x > w + 80) b.p.x = -80;
      if (b.p.y < -80) b.p.y = h + 80;
      if (b.p.y > h + 80) b.p.y = -80;
    }
  }

  private drawBackground(w: number, h: number): void {
    const ctx = this.ctx;
    // deep space gradient
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    bg.addColorStop(0, '#0a1018');
    bg.addColorStop(1, '#03060a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // faint grid
    ctx.strokeStyle = 'rgba(60, 120, 110, 0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = 56;
    for (let x = 0; x <= w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y <= h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    // stars
    for (const st of this.stars) {
      if (st.x > w || st.y > h) continue;
      ctx.fillStyle = `rgba(180,220,230,${0.15 + st.z * 0.35})`;
      ctx.fillRect(st.x, st.y, st.z * 2, st.z * 2);
    }
    // neon enemy blobs (additive) to stress-test legibility
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.blobs) {
      ctx.save();
      ctx.translate(b.p.x, b.p.y);
      ctx.rotate(b.rot);
      ctx.beginPath();
      for (let i = 0; i < b.sides; i++) {
        const a = (i / b.sides) * Math.PI * 2;
        const px = Math.cos(a) * b.r, py = Math.sin(a) * b.r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = `hsla(${b.hue}, 90%, 62%, 0.55)`;
      ctx.lineWidth = 2;
      ctx.shadowColor = `hsla(${b.hue}, 90%, 62%, 0.8)`;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  render(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    this.drawBackground(w, h);

    const cand = CANDIDATES[this.focus];
    cand.draw(ctx, w, h, this.state);

    // insufficient-charge feedback demo: red flash edge when active pressed with no charge
    if (this.labelsOn) {
      const s = this.state;
      const usable = s.charge >= s.minActivation;
      this.labelRoot.innerHTML =
        `<b style="color:#7ef">HUD LAB</b> — candidate <b>${this.focus + 1}/${CANDIDATES.length}: ${cand.name}</b><br>` +
        `${cand.desc}<br>` +
        `<span style="opacity:0.75">charge ${Math.round(s.charge)}/${s.capacity} ` +
        `(${usable ? 'SPENDABLE' : 'below activation ' + s.minActivation}) · ` +
        `${s.touchMode ? 'MOBILE' : 'DESKTOP'} · ${s.harvesting ? 'harvesting' : 'idle'}${s.active ? ' · TIME ACTIVE' : ''}</span><br>` +
        `<span style="opacity:0.6">1-4 candidate · T mobile · [ ] charge · H harvest · Space time · ,/. lives · L labels · R reset</span>`;
      this.labelRoot.style.display = 'block';
    } else {
      this.labelRoot.style.display = 'none';
    }
  }
}
