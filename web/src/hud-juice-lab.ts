/**
 * HUD Juice Lab (`?juice=1`) — makes the chosen HUD (candidate 3, "Diegetic Ring") feel
 * ALIVE, gamified, and addictive. Where the HUD Lab (`?hud=1`) picked a static LAYOUT, this
 * lab layers on the MOTION & REWARD feel: a combo-multiplier chain (the addictive core),
 * count-up score, floating "+N" hit numbers, milestone celebrations, juicy life gain/loss,
 * and a satisfying time-dilation ready→engage→drain arc.
 *
 * It's self-contained on the 2D HUD canvas (own faux background) and drives a simulated
 * gameplay loop (auto-demo ON by default) so every effect is visible in motion the instant
 * you open it — nothing here touches the real game HUD until a combination is picked & ported.
 *
 * The base layout is the Diegetic Ring: a slim top chip (score + lives pips) and a
 * bottom-right dark-matter dial. Every juice layer is an independent toggle so combinations
 * can be A/B'd.
 *
 * Keys (also on window.hudJuiceLab):
 *   EVENTS   K kill (+score, +combo)  ·  D take damage  ·  F gain a life
 *            [ ] dark-matter charge −/+  ·  H harvest toggle  ·  Space engage time-dilation
 *            A auto-demo on/off (simulated kills + occasional hits)
 *   LAYERS   1 count-up · 2 score punch · 3 COMBO MULTIPLIER · 4 floating +N · 5 milestones
 *            6 life juice · 7 DM ready ping · 8 DM engage warp · 9 DM harvest stream
 *   VIEW     T mobile chrome · L labels · P pause · R reset · 0 all layers on/off
 */

type Layers = {
  countUp: boolean; punch: boolean; combo: boolean; floaters: boolean; milestones: boolean;
  lifeJuice: boolean; dmReady: boolean; dmWarp: boolean; dmHarvest: boolean;
};

interface Floater { x: number; y: number; vx: number; vy: number; life: number; max: number; text: string; color: string; size: number; }
interface Frag { x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number; max: number; color: string; }
interface Mote { x: number; y: number; life: number; max: number; }
interface Star { x: number; y: number; z: number; }
interface Blob { x: number; y: number; vx: number; vy: number; r: number; hue: number; sides: number; rot: number; spin: number; }

const FONT = 'monospace';
const ACCENT = '#38f2c8';
const ACCENT_DIM = '#1c7d68';
const DM = '#9a7cff';
const DM_HOT = '#d9faff';
const DM_DIM = '#5a4b8a';
const WARN = '#ff5a6e';
const INK = 'rgba(6, 10, 14, 0.62)';
const RULE = 'rgba(120, 200, 190, 0.28)';

// Multiplier heat ramp — the visual reward for keeping the chain alive.
const MULT_COLORS = ['#38f2c8', '#6ef27a', '#c8f24a', '#f2c23a', '#f2883a', '#ff5a4a'];
function multColor(m: number): string {
  return MULT_COLORS[Math.min(MULT_COLORS.length - 1, Math.max(0, m - 1))];
}

const BASE_KILL_SCORE = 100;
const MAX_MULT = 6;
const CAPACITY = 100;
const MIN_ACTIVATION = 10;

function clamp(v: number, a: number, b: number): number { return Math.max(a, Math.min(b, v)); }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function glowText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, font: string, color: string, glow: string, blur = 8): void {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = glow; ctx.shadowColor = glow; ctx.shadowBlur = blur;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0; ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function chip(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, stroke = RULE, fill = INK): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = stroke; ctx.stroke();
}

function chevron(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, filled: boolean, color: string, glow: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.8, size * 0.7);
  ctx.lineTo(0, size * 0.35);
  ctx.lineTo(-size * 0.8, size * 0.7);
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = glow; ctx.fill();
  } else {
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(150,170,180,0.35)'; ctx.stroke();
  }
  ctx.restore();
}

export class HudJuiceLab {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private labelRoot: HTMLDivElement;
  private stars: Star[] = [];
  private blobs: Blob[] = [];
  private floaters: Floater[] = [];
  private frags: Frag[] = [];
  private motes: Mote[] = [];

  paused = false;
  labelsOn = true;
  touchMode = false;
  autoDemo = true;

  layers: Layers = {
    countUp: true, punch: true, combo: true, floaters: true, milestones: true,
    lifeJuice: true, dmReady: true, dmWarp: true, dmHarvest: true,
  };

  // gameplay-ish state
  private targetScore = 0;
  private displayScore = 0;
  private mult = 1;
  private comboEnergy = 0;      // 0..1 — drains over time, refilled by kills; empties → combo lost
  private comboLostFlash = 0;
  private lives = 4;
  private maxLives = 5;
  private pipPop: number[] = [];   // per-pip gain-in scale animation
  private scorePunch = 0;
  private lifeVignette = 0;        // red flash on damage
  private lowLifePulseT = 0;
  private nextMilestone = 5000;
  private milestoneText = '';
  private milestoneT = 0;
  private shake = 0;
  private time = 0;

  // dark matter
  private charge = 45;
  private harvesting = false;
  private active = false;
  private wasUsable = false;
  private dmReadyFlash = 0;
  private dmEngageBurst = 0;

  private autoTimer = 0;
  private autoDamageTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('HUD Juice Lab needs a 2d context');
    this.ctx = ctx;
    canvas.style.cursor = 'default';
    this.pipPop = new Array(this.maxLives).fill(1);
    this.resize();
    window.addEventListener('resize', () => this.resize());

    for (let i = 0; i < 140; i++) this.stars.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, z: 0.3 + Math.random() * 0.7 });
    for (let i = 0; i < 9; i++) this.blobs.push({
      x: Math.random() * innerWidth, y: Math.random() * innerHeight,
      vx: (Math.random() - 0.5) * 0.04, vy: (Math.random() - 0.5) * 0.04,
      r: 30 + Math.random() * 60, hue: 140 + Math.random() * 180,
      sides: 3 + Math.floor(Math.random() * 4), rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.002,
    });

    this.labelRoot = document.createElement('div');
    this.labelRoot.id = 'hud-juice-labels';
    Object.assign(this.labelRoot.style, {
      position: 'fixed', left: '0', top: '42%', padding: '10px 14px',
      font: '12px monospace', color: '#bfe', pointerEvents: 'none',
      textShadow: '0 0 6px rgba(0,0,0,0.9)', lineHeight: '1.5', maxWidth: '44vw',
    });
    document.body.appendChild(this.labelRoot);

    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('mousedown', () => this.kill());
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---- gameplay events (the sim the juice reacts to) ----

  /** Register a kill: score gain scales with the combo multiplier; feeds the chain. */
  kill(atX?: number, atY?: number): void {
    const gain = BASE_KILL_SCORE * this.mult;
    this.targetScore += gain;
    this.scorePunch = Math.min(1, this.scorePunch + 0.5);
    // combo chain
    this.comboEnergy = Math.min(1, this.comboEnergy + 0.30);
    if (this.comboEnergy >= 1 && this.mult < MAX_MULT) { this.mult++; this.comboEnergy = 0.2; }
    // floating +N
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const x = atX ?? w * (0.3 + Math.random() * 0.4);
    const y = atY ?? h * (0.3 + Math.random() * 0.35);
    this.floaters.push({
      x, y, vx: (Math.random() - 0.5) * 0.03, vy: -0.05 - Math.random() * 0.03,
      life: 0, max: 900, text: `+${gain}`, color: multColor(this.mult), size: 16 + this.mult * 2,
    });
    // milestone
    if (this.targetScore >= this.nextMilestone) {
      this.milestoneText = `${this.nextMilestone.toLocaleString()}!`;
      this.milestoneT = 1;
      this.shake = Math.max(this.shake, 6);
      this.nextMilestone += 5000;
    }
  }

  damage(): void {
    if (this.lives <= 0) return;
    const idx = this.lives - 1;
    this.lives--;
    this.spawnPipShatter(idx);
    this.lifeVignette = 1;
    this.shake = Math.max(this.shake, 9);
    // taking a hit breaks the chain — the tension that makes the combo matter
    if (this.mult > 1) { this.comboLostFlash = 1; }
    this.mult = 1;
    this.comboEnergy = 0;
  }

  gainLife(): void {
    if (this.lives >= this.maxLives) return;
    const idx = this.lives;
    this.lives++;
    this.pipPop[idx] = 0; // animates up to 1 (pop-in)
  }

  private spawnPipShatter(idx: number): void {
    const p = this.pipScreenPos(idx);
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.08 + Math.random() * 0.14;
      this.frags.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.05, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.02, life: 0, max: 600, color: ACCENT });
    }
  }

  private pipScreenPos(idx: number): { x: number; y: number } {
    const w = this.canvas.clientWidth;
    const cw = 320;
    const rightX = (w + cw) / 2 - 22;
    const gap = 6 * 1.9;
    return { x: rightX - idx * gap, y: 31 };
  }

  private onKey(e: KeyboardEvent): void {
    const L = this.layers;
    switch (e.key) {
      case 'k': case 'K': this.kill(); break;
      case 'd': case 'D': this.damage(); break;
      case 'f': case 'F': this.gainLife(); break;
      case 'a': case 'A': this.autoDemo = !this.autoDemo; break;
      case '[': this.charge = clamp(this.charge - 8, 0, CAPACITY); break;
      case ']': this.charge = clamp(this.charge + 8, 0, CAPACITY); break;
      case 'h': case 'H': this.harvesting = !this.harvesting; break;
      case ' ':
        if (this.charge >= MIN_ACTIVATION || this.active) { this.active = !this.active; if (this.active) this.dmEngageBurst = 1; }
        e.preventDefault(); break;
      case '1': L.countUp = !L.countUp; break;
      case '2': L.punch = !L.punch; break;
      case '3': L.combo = !L.combo; break;
      case '4': L.floaters = !L.floaters; break;
      case '5': L.milestones = !L.milestones; break;
      case '6': L.lifeJuice = !L.lifeJuice; break;
      case '7': L.dmReady = !L.dmReady; break;
      case '8': L.dmWarp = !L.dmWarp; break;
      case '9': L.dmHarvest = !L.dmHarvest; break;
      case '0': {
        const anyOff = Object.values(L).some(v => !v);
        (Object.keys(L) as (keyof Layers)[]).forEach(k => { L[k] = anyOff; });
        break;
      }
      case 't': case 'T': this.touchMode = !this.touchMode; break;
      case 'l': case 'L': this.labelsOn = !this.labelsOn; break;
      case 'p': case 'P': this.paused = !this.paused; break;
      case 'r': case 'R': this.reset(); break;
    }
  }

  private reset(): void {
    this.targetScore = 0; this.displayScore = 0; this.mult = 1; this.comboEnergy = 0;
    this.lives = 4; this.charge = 45; this.harvesting = false; this.active = false;
    this.nextMilestone = 5000; this.floaters.length = 0; this.frags.length = 0; this.motes.length = 0;
    this.pipPop = new Array(this.maxLives).fill(1);
  }

  update(dt: number): void {
    if (this.paused) return;
    const s = Math.min(dt, 50) / 1000;
    this.time += dt;

    // auto-demo: a steady kill cadence + occasional damage so the HUD is alive on open
    if (this.autoDemo) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0) { this.kill(); this.autoTimer = 260 + Math.random() * 380; }
      this.autoDamageTimer -= dt;
      if (this.autoDamageTimer <= 0) {
        if (this.lives <= 1) this.gainLife(); else if (Math.random() < 0.5) this.damage();
        this.autoDamageTimer = 4200 + Math.random() * 4200;
      }
      if (!this.harvesting && this.charge < CAPACITY * 0.9 && Math.random() < 0.01) this.harvesting = true;
      if (this.harvesting && this.charge >= CAPACITY) this.harvesting = false;
    }

    // score count-up
    if (this.layers.countUp) {
      const diff = this.targetScore - this.displayScore;
      this.displayScore += diff * Math.min(1, s * 8) + Math.sign(diff) * Math.min(Math.abs(diff), 1);
      if (Math.abs(this.targetScore - this.displayScore) < 1) this.displayScore = this.targetScore;
    } else this.displayScore = this.targetScore;

    // combo decay — faster at higher multipliers (tension)
    if (this.comboEnergy > 0) {
      const decay = (0.16 + this.mult * 0.03) * s;
      this.comboEnergy -= decay;
      if (this.comboEnergy <= 0) {
        if (this.mult > 1) { this.mult = 1; this.comboLostFlash = 1; }
        this.comboEnergy = 0;
      }
    }

    // decays
    this.scorePunch = Math.max(0, this.scorePunch - s * 4);
    this.comboLostFlash = Math.max(0, this.comboLostFlash - s * 1.5);
    this.lifeVignette = Math.max(0, this.lifeVignette - s * 2);
    this.milestoneT = Math.max(0, this.milestoneT - s * 0.7);
    this.shake = Math.max(0, this.shake - s * 30);
    this.dmReadyFlash = Math.max(0, this.dmReadyFlash - s * 2);
    this.dmEngageBurst = Math.max(0, this.dmEngageBurst - s * 1.6);
    this.lowLifePulseT += dt;
    for (let i = 0; i < this.pipPop.length; i++) if (this.pipPop[i] < 1) this.pipPop[i] = Math.min(1, this.pipPop[i] + s * 4);

    // dark matter dynamics
    if (this.active && this.charge > 0) { this.charge = clamp(this.charge - 20 * s, 0, CAPACITY); if (this.charge <= 0) this.active = false; }
    else if (this.harvesting) {
      this.charge = clamp(this.charge + 24 * s, 0, CAPACITY);
      if (this.layers.dmHarvest && Math.random() < 0.4) this.spawnHarvestMote();
    }
    const usable = this.charge >= MIN_ACTIVATION;
    if (usable && !this.wasUsable) this.dmReadyFlash = 1; // ready ping on crossing activation
    this.wasUsable = usable;

    // particles
    for (const f of this.floaters) { f.life += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 0.00004 * dt; }
    this.floaters = this.floaters.filter(f => f.life < f.max);
    for (const fr of this.frags) { fr.life += dt; fr.x += fr.vx * dt; fr.y += fr.vy * dt; fr.vy += 0.0003 * dt; fr.rot += fr.vr * dt; }
    this.frags = this.frags.filter(fr => fr.life < fr.max);
    for (const m of this.motes) m.life += dt;
    this.motes = this.motes.filter(m => m.life < m.max);

    // background drift
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    for (const b of this.blobs) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.spin * dt;
      if (b.x < -80) b.x = w + 80; if (b.x > w + 80) b.x = -80;
      if (b.y < -80) b.y = h + 80; if (b.y > h + 80) b.y = -80;
    }
  }

  private spawnHarvestMote(): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const dx = this.touchMode ? w - 82 : w - 60;
    const dy = this.touchMode ? h - 176 : h - 60;
    const a = Math.random() * Math.PI * 2;
    const r = 70 + Math.random() * 60;
    this.motes.push({ x: dx + Math.cos(a) * r, y: dy + Math.sin(a) * r, life: 0, max: 500 });
  }

  // ---- render ----

  private drawBackground(w: number, h: number): void {
    const ctx = this.ctx;
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    bg.addColorStop(0, '#0a1018'); bg.addColorStop(1, '#03060a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(60, 120, 110, 0.10)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 56) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y <= h; y += 56) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    for (const st of this.stars) { if (st.x > w || st.y > h) continue; ctx.fillStyle = `rgba(180,220,230,${0.15 + st.z * 0.35})`; ctx.fillRect(st.x, st.y, st.z * 2, st.z * 2); }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const b of this.blobs) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      ctx.beginPath();
      for (let i = 0; i < b.sides; i++) { const a = (i / b.sides) * Math.PI * 2; const px = Math.cos(a) * b.r, py = Math.sin(a) * b.r; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.closePath();
      ctx.strokeStyle = `hsla(${b.hue}, 90%, 62%, 0.5)`; ctx.lineWidth = 2;
      ctx.shadowColor = `hsla(${b.hue}, 90%, 62%, 0.8)`; ctx.shadowBlur = 12; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawScoreCluster(w: number): void {
    const ctx = this.ctx;
    const cw = 320;
    const x0 = (w - cw) / 2;
    // breathing chip
    const breathe = 0.5 + 0.5 * Math.sin(this.time / 900);
    chip(ctx, x0, 14, cw, 34, 8, `rgba(120,200,190,${0.22 + breathe * 0.1})`);

    // score (count-up + punch)
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const scoreStr = Math.floor(this.displayScore).toString().padStart(6, '0');
    ctx.save();
    const sx = x0 + 18, sy = 31;
    if (this.layers.punch && this.scorePunch > 0) {
      const sc = 1 + this.scorePunch * 0.22;
      ctx.translate(sx, sy); ctx.scale(sc, sc); ctx.translate(-sx, -sy);
    }
    glowText(ctx, scoreStr, sx, sy, `bold 18px ${FONT}`, ACCENT, ACCENT, 8 + this.scorePunch * 10);
    ctx.restore();

    // combo multiplier badge (the addictive centerpiece)
    if (this.layers.combo && this.mult > 1) {
      const mc = multColor(this.mult);
      const bx = x0 + 18 + ctx.measureText(scoreStr).width * 1.0 + 74;
      const pulse = 0.5 + 0.5 * Math.sin(this.time / 140);
      const mSize = 20 + (this.mult >= MAX_MULT ? pulse * 4 : 0);
      glowText(ctx, `×${this.mult}`, bx, 31, `bold ${mSize}px ${FONT}`, mc, mc, 10 + pulse * 8);
      // combo decay bar under the badge
      const barW = 46, barY = 44;
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(bx - 2, barY, barW, 3);
      ctx.fillStyle = mc; ctx.shadowColor = mc; ctx.shadowBlur = 5;
      ctx.fillRect(bx - 2, barY, barW * this.comboEnergy, 3); ctx.shadowBlur = 0;
    }
    // combo-lost flash
    if (this.layers.combo && this.comboLostFlash > 0.01) {
      ctx.save(); ctx.globalAlpha = this.comboLostFlash; ctx.textAlign = 'center';
      glowText(ctx, 'CHAIN LOST', w / 2, 66, `bold 12px ${FONT}`, WARN, WARN, 10);
      ctx.restore();
    }

    // lives pips (right-aligned) with juice
    const lowLife = this.lives <= 1;
    const lifePulse = lowLife && this.layers.lifeJuice ? 0.5 + 0.5 * Math.sin(this.lowLifePulseT / 180) : 0;
    for (let i = 0; i < this.maxLives; i++) {
      const p = this.pipScreenPos(i);
      const filled = i < this.lives;
      const pop = this.layers.lifeJuice ? (this.pipPop[i] ?? 1) : 1;
      const breatheG = filled ? 6 + Math.sin(this.time / 700 + i) * 2 : 0;
      let color = ACCENT, glow = breatheG;
      if (filled && lowLife) { color = `rgb(255,${Math.round(90 + lifePulse * 60)},${Math.round(90 + lifePulse * 60)})`; glow = 6 + lifePulse * 10; }
      ctx.save();
      if (pop < 1) { const sc = pop < 0.5 ? pop * 2 * 1.4 : lerp(1.4, 1, (pop - 0.5) * 2); ctx.translate(p.x, p.y); ctx.scale(sc, sc); ctx.translate(-p.x, -p.y); }
      chevron(ctx, p.x, p.y, 6, filled, color, glow);
      // sparkle ring on fresh gain
      if (this.layers.lifeJuice && pop < 1) {
        ctx.globalAlpha = 1 - pop; ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, 4 + pop * 14, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawFloaters(): void {
    if (!this.layers.floaters) return;
    const ctx = this.ctx;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of this.floaters) {
      const t = f.life / f.max;
      ctx.save();
      ctx.globalAlpha = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      glowText(ctx, f.text, f.x, f.y, `bold ${f.size}px ${FONT}`, f.color, f.color, 8);
      ctx.restore();
    }
  }

  private drawFrags(): void {
    if (!this.layers.lifeJuice) return;
    const ctx = this.ctx;
    for (const fr of this.frags) {
      const t = fr.life / fr.max;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.translate(fr.x, fr.y); ctx.rotate(fr.rot);
      ctx.strokeStyle = fr.color; ctx.lineWidth = 1.5; ctx.shadowColor = fr.color; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.stroke();
      ctx.restore();
    }
  }

  private drawMilestone(w: number, h: number): void {
    if (!this.layers.milestones || this.milestoneT <= 0.01) return;
    const ctx = this.ctx;
    const t = 1 - this.milestoneT;
    ctx.save();
    ctx.globalAlpha = this.milestoneT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const y = h * 0.32;
    // expanding celebration ring
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 2; ctx.globalAlpha = this.milestoneT * 0.6;
    ctx.beginPath(); ctx.arc(w / 2, y, 30 + t * 160, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = this.milestoneT;
    glowText(ctx, this.milestoneText, w / 2, y, `bold 40px ${FONT}`, '#ffffff', ACCENT, 20);
    ctx.restore();
  }

  private drawDarkMatter(w: number, h: number): void {
    const ctx = this.ctx;
    const frac = this.charge / CAPACITY;
    const usable = this.charge >= MIN_ACTIVATION;
    const pulse = 0.5 + 0.5 * Math.sin(this.time / 320);
    const color = this.active ? DM_HOT : this.harvesting ? '#a8f4ff' : usable ? DM : DM_DIM;
    let alpha = 0.14;
    if (this.active) alpha = 1; else if (this.harvesting) alpha = 0.95; else if (usable) alpha = 0.85; else if (frac > 0) alpha = 0.42;

    const mobile = this.touchMode;
    const dx = mobile ? w - 82 : w - 60;
    const dy = mobile ? h - 176 : h - 60;
    const r = mobile ? 36 : 30;

    // harvest motes streaming into the dial
    if (this.layers.dmHarvest) {
      for (const m of this.motes) {
        const t = m.life / m.max;
        const mx = lerp(m.x, dx, t), my = lerp(m.y, dy, t);
        ctx.save(); ctx.globalAlpha = (1 - t) * 0.8; ctx.fillStyle = '#a8f4ff'; ctx.shadowColor = '#a8f4ff'; ctx.shadowBlur = 5;
        ctx.beginPath(); ctx.arc(mx, my, 1.6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    // track
    ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = mobile ? 4 : 5; ctx.stroke();
    // fill arc
    ctx.beginPath(); ctx.arc(dx, dy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.strokeStyle = color; ctx.lineWidth = mobile ? 4 : 5;
    ctx.shadowColor = color; ctx.shadowBlur = this.active || this.harvesting ? 8 + pulse * 6 : 2; ctx.stroke(); ctx.shadowBlur = 0;
    // activation tick
    const a = -Math.PI / 2 + Math.PI * 2 * (MIN_ACTIVATION / CAPACITY);
    ctx.strokeStyle = usable ? RULE : WARN; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(dx + Math.cos(a) * (r - 6), dy + Math.sin(a) * (r - 6)); ctx.lineTo(dx + Math.cos(a) * (r + 6), dy + Math.sin(a) * (r + 6)); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    glowText(ctx, this.active ? 'TIME' : mobile ? 'TIME' : 'DM', dx, dy, `bold ${mobile ? 11 : 10}px ${FONT}`, color, color, usable ? 6 : 0);
    if (!mobile) { ctx.globalAlpha = alpha * 0.8; glowText(ctx, '[SPACE]', dx, dy + r + 12, `8px ${FONT}`, DM_DIM, DM_DIM, 0); }
    ctx.restore();

    // ready ping — a bloom when charge crosses the activation threshold
    if (this.layers.dmReady && this.dmReadyFlash > 0.01) {
      ctx.save(); ctx.globalAlpha = this.dmReadyFlash; ctx.strokeStyle = DM; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(dx, dy, r + (1 - this.dmReadyFlash) * 30, 0, Math.PI * 2); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      glowText(ctx, 'READY', dx, dy - r - 12, `bold 10px ${FONT}`, DM_HOT, DM, 10);
      ctx.restore();
    }
    // engage burst
    if (this.layers.dmWarp && this.dmEngageBurst > 0.01) {
      ctx.save(); ctx.globalAlpha = this.dmEngageBurst * 0.7; ctx.strokeStyle = DM_HOT; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(dx, dy, r + (1 - this.dmEngageBurst) * 80, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  }

  private drawActiveOverlay(w: number, h: number): void {
    if (!this.layers.dmWarp || !this.active) return;
    const ctx = this.ctx;
    const strength = 0.8;
    const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.68);
    vig.addColorStop(0, 'rgba(18, 6, 34, 0)');
    vig.addColorStop(0.72, `rgba(24, 4, 45, ${0.1 * strength})`);
    vig.addColorStop(1, `rgba(2, 0, 10, ${0.5 * strength})`);
    ctx.save(); ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);
    // warp streaks radiating from center
    ctx.globalCompositeOperation = 'lighter';
    const n = 18;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + this.time / 4000;
      const r0 = Math.min(w, h) * 0.3, r1 = Math.min(w, h) * 0.46;
      ctx.strokeStyle = `rgba(150,110,255,${0.05})`; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.cos(ang) * r0, h / 2 + Math.sin(ang) * r0);
      ctx.lineTo(w / 2 + Math.cos(ang) * r1, h / 2 + Math.sin(ang) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }

  render(): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    this.drawBackground(w, h);

    ctx.save();
    if (this.shake > 0.1) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    this.drawActiveOverlay(w, h);
    this.drawScoreCluster(w);
    this.drawFrags();
    this.drawFloaters();
    this.drawMilestone(w, h);
    this.drawDarkMatter(w, h);

    // damage vignette (drawn over everything, inside shake)
    if (this.layers.lifeJuice && this.lifeVignette > 0.01) {
      const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      vig.addColorStop(0, 'rgba(255,40,60,0)');
      vig.addColorStop(1, `rgba(255,20,40,${0.42 * this.lifeVignette})`);
      ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();

    if (this.labelsOn) {
      const L = this.layers;
      const on = (b: boolean, s: string) => `<span style="color:${b ? '#7ef' : '#456'}">${s}</span>`;
      this.labelRoot.innerHTML =
        `<b style="color:#7ef">HUD JUICE LAB</b> — base layout: Diegetic Ring (candidate 3)<br>` +
        `score ${Math.floor(this.displayScore).toLocaleString()} · ` +
        `<b style="color:${multColor(this.mult)}">×${this.mult}</b> combo · ${this.lives}/${this.maxLives} lives · ` +
        `DM ${Math.round(this.charge)}/${CAPACITY}${this.active ? ' ACTIVE' : this.harvesting ? ' harvesting' : ''} · ` +
        `${this.autoDemo ? '<span style="color:#7ef">AUTO-DEMO</span>' : 'manual'}<br>` +
        `layers: ${on(L.countUp, '1count')} ${on(L.punch, '2punch')} ${on(L.combo, '3COMBO')} ${on(L.floaters, '4+N')} ${on(L.milestones, '5milestone')} ${on(L.lifeJuice, '6life')} ${on(L.dmReady, '7ready')} ${on(L.dmWarp, '8warp')} ${on(L.dmHarvest, '9harvest')}<br>` +
        `<span style="opacity:0.6">K kill · D damage · F +life · A auto · Space time · [ ] charge · H harvest · T mobile · 0 all · L labels · R reset · click=kill</span>`;
      this.labelRoot.style.display = 'block';
    } else this.labelRoot.style.display = 'none';
  }
}
