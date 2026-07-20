import { DARK_MATTER_MIN_ACTIVATION, HUD_ACCENT, HUD_ACCENT_DIM, HUD_MILESTONE_INTERVAL, MedalDef, PHASE_DISPLAY_NAMES, TIME_BUTTON_BOTTOM, TIME_BUTTON_RADIUS, TIME_BUTTON_RIGHT, WEAPON_STAGES } from '../config';
import { RunStats } from '../core/run-stats';
import type { Camera } from '../core/camera';
import type { TimeDilationSnapshot } from '../systems/time-dilation-system';

// Dark-matter dial palette (shared with the Diegetic Ring HUD).
const DM = '#9a7cff';
const DM_HOT = '#d9faff';
const DM_DIM = '#5a4b8a';
const DM_WARN = '#ff5a6e';

interface Floater { x: number; y: number; vx: number; vy: number; life: number; max: number; text: string; size: number; }
interface Frag { x: number; y: number; vx: number; vy: number; rot: number; vr: number; life: number; max: number; }
interface Mote { x: number; y: number; life: number; max: number; }

export class HUD {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private touchMode = false;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fpsDisplay = 0;

  // --- juice state (Diegetic Ring HUD) ---
  private juiceNow = 0;          // last performance.now() for internal dt
  private displayScore = 0;      // eased count-up value
  private lastScore = 0;
  private scorePunch = 0;
  private lastLives = -1;
  private maxLives = 0;
  private pipPop: number[] = [];
  private lifeVignette = 0;
  private lowLifeT = 0;
  private nextMilestone = HUD_MILESTONE_INTERVAL;
  private milestoneText = '';
  private milestoneT = 0;
  private floaters: Floater[] = [];
  private frags: Frag[] = [];
  // dark-matter juice
  private dmWasUsable = false;
  private dmWasActive = false;
  private dmReadyFlash = 0;
  private dmEngageBurst = 0;
  private dmMotes: Mote[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2d context for HUD');
    this.ctx = ctx;
  }

  setTouchMode(touch: boolean): void {
    this.touchMode = touch;
  }

  /** Reset per-run juice state (called on game start). */
  resetJuice(): void {
    this.displayScore = 0; this.lastScore = 0; this.scorePunch = 0;
    this.lastLives = -1; this.maxLives = 0; this.pipPop = [];
    this.lifeVignette = 0; this.nextMilestone = HUD_MILESTONE_INTERVAL;
    this.milestoneText = ''; this.milestoneT = 0;
    this.floaters.length = 0; this.frags.length = 0; this.dmMotes.length = 0;
    this.dmWasUsable = false; this.dmWasActive = false;
    this.dmReadyFlash = 0; this.dmEngageBurst = 0;
  }

  /** Boss defeat → a big floating "+N" at the boss's world position (projected to screen). */
  spawnBossHit(worldX: number, worldY: number, camera: Camera, scoreValue: number): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const f = w / camera.viewportWidth; // equals zoom; corrects dpr/resScale/zoom
    const sx = w / 2 + (worldX - camera.renderX) * f;
    const sy = h / 2 + (worldY - camera.renderY) * f;
    this.floaters.push({ x: sx, y: sy, vx: (Math.random() - 0.5) * 0.03, vy: -0.06, life: 0, max: 1100, text: `+${scoreValue}`, size: 30 });
  }

  /** Player took a hit → red vignette flash (pip shatter is driven by the lives diff). */
  onPlayerHit(): void {
    this.lifeVignette = 1;
  }

  // --- juice helpers ---

  private chip(x: number, y: number, w: number, h: number, r: number, stroke: string): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(6, 10, 14, 0.62)'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = stroke; ctx.stroke();
  }

  private chevron(cx: number, cy: number, size: number, filled: boolean, color: string, glow: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.8, size * 0.7);
    ctx.lineTo(0, size * 0.35);
    ctx.lineTo(-size * 0.8, size * 0.7);
    ctx.closePath();
    if (filled) { ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = glow; ctx.fill(); }
    else { ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(150,170,180,0.35)'; ctx.stroke(); }
    ctx.restore();
  }

  private pipScreenPos(idx: number): { x: number; y: number } {
    const w = this.canvas.clientWidth;
    const cw = 320;
    const rightX = (w + cw) / 2 - 22;
    return { x: rightX - idx * (6 * 1.9), y: 31 };
  }

  private spawnPipShatter(idx: number): void {
    const p = this.pipScreenPos(idx);
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.08 + Math.random() * 0.14;
      this.frags.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.05, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.02, life: 0, max: 600 });
    }
  }

  /** Advance all time-based juice; returns the internal dt (ms). */
  private stepJuice(): void {
    const now = performance.now();
    let dt = this.juiceNow > 0 ? now - this.juiceNow : 16;
    this.juiceNow = now;
    dt = Math.min(dt, 50);
    const s = dt / 1000;
    // score count-up
    const diff = this.lastScore - this.displayScore;
    if (Math.abs(diff) < 1) this.displayScore = this.lastScore;
    else this.displayScore += diff * Math.min(1, s * 8) + Math.sign(diff);
    // decays
    this.scorePunch = Math.max(0, this.scorePunch - s * 4);
    this.lifeVignette = Math.max(0, this.lifeVignette - s * 2);
    this.milestoneT = Math.max(0, this.milestoneT - s * 0.7);
    this.dmReadyFlash = Math.max(0, this.dmReadyFlash - s * 2);
    this.dmEngageBurst = Math.max(0, this.dmEngageBurst - s * 1.6);
    this.lowLifeT += dt;
    for (let i = 0; i < this.pipPop.length; i++) if (this.pipPop[i] < 1) this.pipPop[i] = Math.min(1, this.pipPop[i] + s * 4);
    // particles
    for (const f of this.floaters) { f.life += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 0.00004 * dt; }
    this.floaters = this.floaters.filter(f => f.life < f.max);
    for (const fr of this.frags) { fr.life += dt; fr.x += fr.vx * dt; fr.y += fr.vy * dt; fr.vy += 0.0003 * dt; fr.rot += fr.vr * dt; }
    this.frags = this.frags.filter(fr => fr.life < fr.max);
    for (const m of this.dmMotes) m.life += dt;
    this.dmMotes = this.dmMotes.filter(m => m.life < m.max);
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawGlowText(text: string, x: number, y: number, font: string, color: string, glowColor: string, blur: number = 10): void {
    this.ctx.save();
    this.ctx.font = font;
    this.ctx.fillStyle = glowColor;
    this.ctx.shadowColor = glowColor;
    this.ctx.shadowBlur = blur;
    this.ctx.fillText(text, x, y);
    // Second pass for crisp text on top
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = color;
    this.ctx.fillText(text, x, y);
    this.ctx.restore();
  }

  updateFps(dt: number): void {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 500) {
      this.fpsDisplay = Math.round(this.fpsFrames / (this.fpsTime / 1000));
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
  }

  drawPlaying(score: number, lives: number, muted?: boolean, enemyCount?: number, autoFire?: boolean): void {
    this.clear();
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    // --- detect changes (drives count-up, punch, milestones, life juice) ---
    if (this.lastLives < 0) { this.lastLives = lives; this.maxLives = lives; }
    this.maxLives = Math.max(this.maxLives, lives);
    while (this.pipPop.length < this.maxLives) this.pipPop.push(1);
    if (score > this.lastScore) {
      this.scorePunch = Math.min(1, this.scorePunch + 0.5);
      while (score >= this.nextMilestone) {
        this.milestoneText = `${this.nextMilestone.toLocaleString()}`;
        this.milestoneT = 1;
        this.nextMilestone += HUD_MILESTONE_INTERVAL;
      }
    }
    this.lastScore = score;
    if (lives < this.lastLives) { for (let i = lives; i < this.lastLives; i++) this.spawnPipShatter(i); }
    else if (lives > this.lastLives) { for (let i = this.lastLives; i < lives; i++) this.pipPop[i] = 0; }
    this.lastLives = lives;

    this.stepJuice();

    // --- score + lives cluster: Diegetic Ring top-center chip ---
    const cw = 320;
    const x0 = (w - cw) / 2;
    const breathe = 0.5 + 0.5 * Math.sin(this.juiceNow / 900);
    this.chip(x0, 14, cw, 34, 8, `rgba(120,200,190,${0.22 + breathe * 0.1})`);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const scoreStr = Math.floor(this.displayScore).toString().padStart(6, '0');
    const sx = x0 + 18, sy = 31;
    ctx.save();
    if (this.scorePunch > 0) { const sc = 1 + this.scorePunch * 0.22; ctx.translate(sx, sy); ctx.scale(sc, sc); ctx.translate(-sx, -sy); }
    this.drawGlowText(scoreStr, sx, sy, `bold 18px monospace`, HUD_ACCENT, HUD_ACCENT, 8 + this.scorePunch * 10);
    ctx.restore();

    // lives pips (right-aligned in chip) with breathing + low-life heartbeat + gain pop
    const lowLife = lives <= 1;
    const lifePulse = lowLife ? 0.5 + 0.5 * Math.sin(this.lowLifeT / 180) : 0;
    for (let i = 0; i < this.maxLives; i++) {
      const p = this.pipScreenPos(i);
      const filled = i < lives;
      const pop = this.pipPop[i] ?? 1;
      let color = HUD_ACCENT, glow = filled ? 6 + Math.sin(this.juiceNow / 700 + i) * 2 : 0;
      if (filled && lowLife) { const c = Math.round(90 + lifePulse * 60); color = `rgb(255,${c},${c})`; glow = 6 + lifePulse * 10; }
      ctx.save();
      if (pop < 1) { const sc = pop < 0.5 ? pop * 2 * 1.4 : 1.4 + (1 - 1.4) * ((pop - 0.5) * 2); ctx.translate(p.x, p.y); ctx.scale(sc, sc); ctx.translate(-p.x, -p.y); }
      this.chevron(p.x, p.y, 6, filled, color, glow);
      if (pop < 1) { ctx.globalAlpha = 1 - pop; ctx.strokeStyle = HUD_ACCENT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 4 + pop * 14, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
    }

    // --- pip shatter fragments ---
    for (const fr of this.frags) {
      const t = fr.life / fr.max;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.translate(fr.x, fr.y); ctx.rotate(fr.rot);
      ctx.strokeStyle = HUD_ACCENT; ctx.lineWidth = 1.5; ctx.shadowColor = HUD_ACCENT; ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.stroke();
      ctx.restore();
    }

    // --- boss floating "+N" ---
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of this.floaters) {
      const t = f.life / f.max;
      ctx.save();
      ctx.globalAlpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      this.drawGlowText(f.text, f.x, f.y, `bold ${f.size}px monospace`, '#ffe8a8', '#ffb020', 12);
      ctx.restore();
    }

    // --- milestone celebration ---
    if (this.milestoneT > 0.01) {
      const t = 1 - this.milestoneT;
      const my = h * 0.28;
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      // a small HUD-local shake for punch
      ctx.translate((Math.random() - 0.5) * this.milestoneT * 5, (Math.random() - 0.5) * this.milestoneT * 5);
      ctx.strokeStyle = HUD_ACCENT; ctx.lineWidth = 2; ctx.globalAlpha = this.milestoneT * 0.6;
      ctx.beginPath(); ctx.arc(w / 2, my, 30 + t * 160, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = this.milestoneT;
      this.drawGlowText(this.milestoneText, w / 2, my, `bold 40px monospace`, '#ffffff', HUD_ACCENT, 20);
      ctx.restore();
    }

    // --- FPS + enemy count (debug, bottom-left) ---
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const fpsColor = this.fpsDisplay >= 55 ? HUD_ACCENT : this.fpsDisplay >= 30 ? '#ffff20' : '#ff3030';
    let debugText = `FPS: ${this.fpsDisplay}`;
    if (enemyCount !== undefined) debugText += `  ENEMIES: ${enemyCount}`;
    this.drawGlowText(debugText, 20, h - 10, '14px monospace', fpsColor, fpsColor, 5);

    // --- status indicators (bottom-center, out of the play space) ---
    ctx.textAlign = 'center';
    const indicators: string[] = [];
    if (muted) indicators.push('MUTED [M]');
    if (autoFire) indicators.push('AUTO-FIRE [F]');
    if (indicators.length > 0) {
      this.drawGlowText(indicators.join('  '), w / 2, h - 10, '13px monospace', muted ? '#aa3030' : HUD_ACCENT_DIM, muted ? '#aa3030' : HUD_ACCENT_DIM, 5);
    }
    ctx.textBaseline = 'top';

    // --- damage vignette (over everything in the playing pass) ---
    if (this.lifeVignette > 0.01) {
      const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      vig.addColorStop(0, 'rgba(255,40,60,0)');
      vig.addColorStop(1, `rgba(255,20,40,${0.42 * this.lifeVignette})`);
      ctx.save(); ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h); ctx.restore();
    }
  }

  /**
   * Dark-matter dial (Diegetic Ring) + unscaled full-screen time-dilation treatment.
   * Desktop: a compact bottom-right charge dial. Mobile: the TIME hold button, gated so it
   * only appears once charge is (nearly) spendable. Ready ping / engage warp / harvest stream
   * are self-driven by diffing the snapshot each frame.
   */
  drawTimeDilation(state: TimeDilationSnapshot, buttonPressed = false): void {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const frac = Math.max(0, Math.min(1, state.charge / state.capacity));
    const usable = state.charge >= DARK_MATTER_MIN_ACTIVATION;
    const pulse = 0.5 + 0.5 * Math.sin(this.juiceNow / 320);
    const flash = state.insufficientFlash > 0 && Math.sin(Date.now() * 0.035) > 0;

    // ready ping on crossing the activation threshold; engage burst on activation
    if (usable && !this.dmWasUsable) this.dmReadyFlash = 1;
    this.dmWasUsable = usable;
    if (state.active && !this.dmWasActive) this.dmEngageBurst = 1;
    this.dmWasActive = state.active;
    // harvest motes streaming in
    if (state.harvesting && Math.random() < 0.4) {
      const cx = this.touchMode ? w - TIME_BUTTON_RIGHT : w - 60;
      const cy = this.touchMode ? h - TIME_BUTTON_BOTTOM : h - 60;
      const a = Math.random() * Math.PI * 2, r = 70 + Math.random() * 60;
      this.dmMotes.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, life: 0, max: 500 });
    }

    // --- full-screen time-dilation treatment (vignette + warp streaks) ---
    const strength = Math.max(0, Math.min(1, (1 - state.timeScale) / 0.72));
    if (strength > 0.001) {
      const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.68);
      vignette.addColorStop(0, 'rgba(18, 6, 34, 0)');
      vignette.addColorStop(0.72, `rgba(24, 4, 45, ${0.09 * strength})`);
      vignette.addColorStop(1, `rgba(2, 0, 10, ${0.48 * strength})`);
      ctx.save();
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
      // radiating warp streaks
      ctx.globalCompositeOperation = 'lighter';
      const n = 18;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + this.juiceNow / 4000;
        const r0 = Math.min(w, h) * 0.3, r1 = Math.min(w, h) * 0.46;
        ctx.strokeStyle = `rgba(150,110,255,${0.05 * strength})`; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w / 2 + Math.cos(ang) * r0, h / 2 + Math.sin(ang) * r0);
        ctx.lineTo(w / 2 + Math.cos(ang) * r1, h / 2 + Math.sin(ang) * r1);
        ctx.stroke();
      }
      ctx.restore();
    }

    const color = state.active ? DM_HOT : state.harvesting ? '#a8f4ff' : usable ? DM : DM_DIM;
    let alpha = 0.14;
    if (state.active) alpha = 1; else if (state.harvesting) alpha = 0.95; else if (usable) alpha = 0.85; else if (frac > 0) alpha = 0.42;

    const mobile = this.touchMode;
    const dx = mobile ? w - TIME_BUTTON_RIGHT : w - 60;
    const dy = mobile ? h - TIME_BUTTON_BOTTOM : h - 60;
    const r = mobile ? TIME_BUTTON_RADIUS : 30;

    // harvest motes (draw under the dial)
    for (const m of this.dmMotes) {
      const t = m.life / m.max;
      const mx = m.x + (dx - m.x) * t, my = m.y + (dy - m.y) * t;
      ctx.save(); ctx.globalAlpha = (1 - t) * 0.8; ctx.fillStyle = '#a8f4ff'; ctx.shadowColor = '#a8f4ff'; ctx.shadowBlur = 5;
      ctx.beginPath(); ctx.arc(mx, my, 1.6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }

    // mobile: gate the whole button below activation (fade in as charge approaches ready)
    if (mobile && !state.active && !usable) {
      alpha = frac > 0.4 ? (frac - 0.4) / 0.6 * 0.5 : 0;
      if (alpha <= 0.01) return;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    if (mobile) {
      // filled hold button
      ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2);
      ctx.fillStyle = buttonPressed ? 'rgba(150,95,245,0.72)' : state.active ? 'rgba(120,70,225,0.55)' : 'rgba(40,24,70,0.5)';
      ctx.fill();
    } else {
      // desktop dial track
      ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 5; ctx.stroke();
    }
    // charge arc
    ctx.beginPath(); ctx.arc(dx, dy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    ctx.strokeStyle = flash ? DM_WARN : color; ctx.lineWidth = mobile ? 4 : 5;
    ctx.shadowColor = ctx.strokeStyle as string; ctx.shadowBlur = state.active || state.harvesting ? 8 + pulse * 6 : 2; ctx.stroke(); ctx.shadowBlur = 0;
    // activation tick
    const a = -Math.PI / 2 + Math.PI * 2 * (DARK_MATTER_MIN_ACTIVATION / state.capacity);
    ctx.strokeStyle = flash ? DM_WARN : usable ? 'rgba(120,200,190,0.28)' : DM_WARN; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(dx + Math.cos(a) * (r - 6), dy + Math.sin(a) * (r - 6)); ctx.lineTo(dx + Math.cos(a) * (r + 6), dy + Math.sin(a) * (r + 6)); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    this.drawGlowText(state.active ? 'TIME' : mobile ? 'TIME' : 'DM', dx, dy, `bold ${mobile ? 11 : 10}px monospace`, color, color, usable ? 6 : 0);
    if (!mobile) { ctx.globalAlpha = alpha * 0.8; this.drawGlowText('[SPACE]', dx, dy + r + 12, '8px monospace', DM_DIM, DM_DIM, 0); }
    ctx.restore();

    // ready ping
    if (this.dmReadyFlash > 0.01) {
      ctx.save(); ctx.globalAlpha = this.dmReadyFlash; ctx.strokeStyle = DM; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(dx, dy, r + (1 - this.dmReadyFlash) * 30, 0, Math.PI * 2); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      this.drawGlowText('READY', dx, dy - r - 12, 'bold 10px monospace', DM_HOT, DM, 10);
      ctx.restore();
    }
    // engage burst
    if (this.dmEngageBurst > 0.01) {
      ctx.save(); ctx.globalAlpha = this.dmEngageBurst * 0.7; ctx.strokeStyle = DM_HOT; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(dx, dy, r + (1 - this.dmEngageBurst) * 80, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  }

  /** Draw phase transition banner with fade-in/out animation */
  drawPhaseBanner(name: string, progress: number): void {
    if (!name || progress <= 0 || progress >= 1) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    // Fade: quick in, hold, slow out
    let alpha: number;
    if (progress < 0.15) {
      alpha = progress / 0.15; // fade in
    } else if (progress > 0.7) {
      alpha = (1 - progress) / 0.3; // fade out
    } else {
      alpha = 1;
    }

    // Slide in from left
    const slideOffset = progress < 0.15 ? (1 - progress / 0.15) * -60 : 0;

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    // Background stripe
    const stripeH = 60;
    const y = h * 0.35;
    this.ctx.fillStyle = `rgba(0, 0, 0, ${0.4 * alpha})`;
    this.ctx.fillRect(0, y - stripeH / 2, w, stripeH);

    // Accent lines
    this.ctx.strokeStyle = `rgba(255, 100, 30, ${0.6 * alpha})`;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(w * 0.2, y - stripeH / 2);
    this.ctx.lineTo(w * 0.8, y - stripeH / 2);
    this.ctx.moveTo(w * 0.2, y + stripeH / 2);
    this.ctx.lineTo(w * 0.8, y + stripeH / 2);
    this.ctx.stroke();

    // Banner text
    const bannerX = w / 2 + slideOffset;
    this.drawGlowText(name, bannerX, y, 'bold 36px monospace', '#ff6020', '#ff3000', 20);

    this.ctx.restore();
  }

  /** Draw recovery window banner */
  drawRecoveryBanner(progress: number): void {
    if (progress <= 0) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    // Remaining fraction (1 = just started, 0 = expiring)
    const alpha = progress > 0.15 ? 0.85 : progress / 0.15 * 0.85;

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    const y = h * 0.22;

    // "RECOVERY" text with cyan glow
    const color = progress > 0.2 ? '#50ddff' : '#ff8040'; // Warn color when expiring
    const glowColor = progress > 0.2 ? '#2090cc' : '#cc5020';
    this.drawGlowText('RECOVERY', w / 2, y, 'bold 18px monospace', color, glowColor, 12);

    // Progress bar under text
    const barW = 120;
    const barH = 3;
    const barX = w / 2 - barW / 2;
    const barY = y + 14;
    this.ctx.fillStyle = `rgba(80, 220, 255, ${0.3 * alpha})`;
    this.ctx.fillRect(barX, barY, barW, barH);
    this.ctx.fillStyle = `rgba(80, 220, 255, ${0.8 * alpha})`;
    this.ctx.shadowColor = '#50ddff';
    this.ctx.shadowBlur = 6;
    this.ctx.fillRect(barX, barY, barW * progress, barH);
    this.ctx.shadowBlur = 0;

    this.ctx.restore();
  }

  drawMenu(): void {
    this.clear();
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    // Title with strong glow
    this.drawGlowText('DEATH BY', w / 2, h / 2 - 80, 'bold 56px monospace', '#20ff20', '#20ff20', 25);
    this.drawGlowText('GEOMETRY', w / 2, h / 2 - 20, 'bold 56px monospace', '#20ff20', '#20ff20', 25);

    // Subtitle
    const playText = this.touchMode ? 'Tap to Play' : 'Click to Play';
    this.drawGlowText(playText, w / 2, h / 2 + 50, '22px monospace', '#10dd10', '#10dd10', 15);

    // Controls hint
    const controlsText = this.touchMode
      ? 'Left stick: move  |  Right stick: aim & shoot'
      : 'WASD to move  |  Mouse to aim  |  Click to shoot  |  F auto-fire  |  M mute';
    this.drawGlowText(controlsText, w / 2, h / 2 + 100, '13px monospace', '#0a770a', '#0a770a', 5);

    // Credit
    this.ctx.textBaseline = 'bottom';
    this.drawGlowText('Geometry Wars-inspired arcade shooter', w / 2, h - 20, '11px monospace', '#064006', '#064006', 3);
  }

  /** Draw miniboss HP bar at top of screen */
  drawMinibossHP(name: string, hp: number, maxHp: number, stage: number): void {
    const w = this.canvas.clientWidth;
    const barW = Math.min(300, w * 0.4);
    const barH = 8;
    const barX = (w - barW) / 2;
    const barY = 55;

    this.ctx.save();

    // Boss name
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'bottom';
    const stageText = stage > 1 ? ` — STAGE ${stage}` : '';
    this.drawGlowText(name + stageText, w / 2, barY - 4, 'bold 14px monospace', '#cc2020', '#880000', 8);

    // HP bar background
    this.ctx.fillStyle = 'rgba(80, 0, 0, 0.5)';
    this.ctx.fillRect(barX, barY, barW, barH);

    // HP bar fill
    const hpFrac = hp / maxHp;
    const fill = hpFrac > 0.5 ? '#cc2020' : hpFrac > 0.25 ? '#cc6620' : '#cccc20';
    this.ctx.fillStyle = fill;
    this.ctx.shadowColor = fill;
    this.ctx.shadowBlur = 6;
    this.ctx.fillRect(barX, barY, barW * hpFrac, barH);
    this.ctx.shadowBlur = 0;

    // Border
    this.ctx.strokeStyle = 'rgba(200, 60, 60, 0.6)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(barX, barY, barW, barH);

    this.ctx.restore();
  }

  /** Draw "BOSS DEFEATED" banner with golden glow */
  drawMinibossDefeatedBanner(progress: number): void {
    if (progress <= 0 || progress >= 1) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    // Fade: quick in, hold, slow out
    let alpha: number;
    if (progress < 0.15) {
      alpha = progress / 0.15;
    } else if (progress > 0.65) {
      alpha = (1 - progress) / 0.35;
    } else {
      alpha = 1;
    }

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    // Background stripe
    const stripeH = 70;
    const y = h * 0.35;
    this.ctx.fillStyle = `rgba(0, 0, 0, ${0.5 * alpha})`;
    this.ctx.fillRect(0, y - stripeH / 2, w, stripeH);

    // Golden accent lines
    this.ctx.strokeStyle = `rgba(255, 200, 50, ${0.7 * alpha})`;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(w * 0.15, y - stripeH / 2);
    this.ctx.lineTo(w * 0.85, y - stripeH / 2);
    this.ctx.moveTo(w * 0.15, y + stripeH / 2);
    this.ctx.lineTo(w * 0.85, y + stripeH / 2);
    this.ctx.stroke();

    // Banner text
    this.drawGlowText('BOSS DEFEATED', w / 2, y, 'bold 36px monospace', '#ffc832', '#ff8800', 25);

    this.ctx.restore();
  }

  /** Draw miniboss warning banner (pulsing red "WARNING") */
  drawMinibossWarning(progress: number): void {
    if (progress <= 0 || progress >= 1) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    const pulse = 0.6 + 0.4 * Math.sin(progress * Math.PI * 8);
    const alpha = progress < 0.1 ? progress / 0.1 : progress > 0.9 ? (1 - progress) / 0.1 : 1;

    this.ctx.save();
    this.ctx.globalAlpha = alpha * pulse;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    const y = h * 0.35;
    this.ctx.fillStyle = `rgba(60, 0, 0, ${0.4 * alpha})`;
    this.ctx.fillRect(0, y - 30, w, 60);

    this.drawGlowText('WARNING', w / 2, y, 'bold 40px monospace', '#ff2020', '#cc0000', 30);

    this.ctx.restore();
  }

  drawGameOver(stats: RunStats, medals: MedalDef[], animTime: number): void {
    this.clear();
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    // Background overlay — darkens over time
    const bgAlpha = Math.min(0.55, 0.25 + animTime * 0.1);
    this.ctx.fillStyle = `rgba(0, 0, 0, ${bgAlpha})`;
    this.ctx.fillRect(0, 0, w, h);

    // Responsive layout — scale for small screens
    const scale = Math.min(1, w / 600);
    const cx = w / 2;

    // Fade-in factor for initial appearance
    const fadeIn = Math.min(1, animTime * 2);

    // "GAME OVER" header
    this.ctx.save();
    this.ctx.globalAlpha = fadeIn;
    this.drawGlowText('GAME OVER', cx, h * 0.12, `bold ${Math.round(48 * scale)}px monospace`, '#ff3030', '#ff0000', 25);
    this.ctx.restore();

    // Score — big number
    const scoreAlpha = Math.min(1, Math.max(0, (animTime - 0.2) * 3));
    this.ctx.save();
    this.ctx.globalAlpha = scoreAlpha;
    this.drawGlowText(`${stats.score}`, cx, h * 0.22, `bold ${Math.round(42 * scale)}px monospace`, '#20ff20', '#20ff20', 18);
    this.drawGlowText('SCORE', cx, h * 0.22 + 28 * scale, `${Math.round(13 * scale)}px monospace`, '#0a770a', '#0a770a', 4);
    this.ctx.restore();

    // Stats grid — staggered reveal
    const statsY = h * 0.34;
    const lineH = Math.round(20 * scale);
    const mins = Math.floor(stats.timeSurvived / 60);
    const secs = Math.floor(stats.timeSurvived % 60);
    const phaseName = PHASE_DISPLAY_NAMES[stats.phaseReached] || stats.phaseReached.toUpperCase();
    const weaponName = ['Twin', 'Tri Spread', 'Quad Scatter', 'Penta Burst', 'Hex Storm'][stats.weaponStage] || 'Twin';

    const statLines = [
      { label: 'TIME', value: `${mins}:${secs.toString().padStart(2, '0')}` },
      { label: 'KILLS', value: `${stats.kills}` },
      { label: 'PHASE', value: phaseName },
      { label: 'WEAPON', value: weaponName },
    ];

    // Second column for combat stats (only show non-zero)
    const combatStats: { label: string; value: string }[] = [];
    if (stats.elitesKilled > 0) combatStats.push({ label: 'ELITES', value: `${stats.elitesKilled}` });
    if (stats.blackholesKilled > 0) combatStats.push({ label: 'BLACK HOLES', value: `${stats.blackholesKilled}` });
    if (stats.minibossDefeated) combatStats.push({ label: 'BOSS', value: 'DEFEATED' });
    if (stats.recoveriesUsed > 0) combatStats.push({ label: 'RECOVERIES', value: `${stats.recoveriesUsed}` });
    const heatPct = Math.round(stats.peakHeat * 100);
    if (heatPct > 0) combatStats.push({ label: 'PEAK HEAT', value: `${heatPct}%` });

    const fontSize = `${Math.round(14 * scale)}px monospace`;
    const labelColor = '#0a770a';
    const valueColor = '#10cc10';

    // Draw stats in two columns
    const colW = Math.min(160 * scale, w * 0.22);
    const leftX = cx - colW;
    const rightX = cx + colW;

    for (let i = 0; i < statLines.length; i++) {
      const delay = 0.4 + i * 0.15;
      const alpha = Math.min(1, Math.max(0, (animTime - delay) * 4));
      const y = statsY + i * lineH;
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.textAlign = 'right';
      this.drawGlowText(statLines[i].label, leftX - 8, y, fontSize, labelColor, labelColor, 3);
      this.ctx.textAlign = 'left';
      this.drawGlowText(statLines[i].value, leftX + 8, y, fontSize, valueColor, valueColor, 5);
      this.ctx.restore();
    }

    for (let i = 0; i < combatStats.length; i++) {
      const delay = 0.5 + i * 0.15;
      const alpha = Math.min(1, Math.max(0, (animTime - delay) * 4));
      const y = statsY + i * lineH;
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.textAlign = 'right';
      this.drawGlowText(combatStats[i].label, rightX - 8, y, fontSize, labelColor, labelColor, 3);
      this.ctx.textAlign = 'left';
      this.drawGlowText(combatStats[i].value, rightX + 8, y, fontSize, valueColor, valueColor, 5);
      this.ctx.restore();
    }

    // Separator line before medals
    const sepY = statsY + Math.max(statLines.length, combatStats.length) * lineH + lineH * 0.5;
    const sepAlpha = Math.min(1, Math.max(0, (animTime - 1.0) * 3));
    this.ctx.save();
    this.ctx.globalAlpha = sepAlpha * 0.4;
    this.ctx.strokeStyle = '#20ff20';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(cx - colW * 1.2, sepY);
    this.ctx.lineTo(cx + colW * 1.2, sepY);
    this.ctx.stroke();
    this.ctx.restore();

    // Medals section
    if (medals.length > 0) {
      const medalStartY = sepY + lineH;
      const medalDelay = 1.5; // matches medal reveal SFX timing
      const medalFontSize = `bold ${Math.round(13 * scale)}px monospace`;
      const descFontSize = `${Math.round(11 * scale)}px monospace`;
      const medalLineH = Math.round(32 * scale);

      for (let i = 0; i < medals.length; i++) {
        const delay = medalDelay + i * 0.25;
        const alpha = Math.min(1, Math.max(0, (animTime - delay) * 3));
        if (alpha <= 0) continue;

        const y = medalStartY + i * medalLineH;
        const m = medals[i];
        const colorStr = `rgb(${Math.round(m.color[0] * 255)},${Math.round(m.color[1] * 255)},${Math.round(m.color[2] * 255)})`;
        const glowStr = `rgba(${Math.round(m.color[0] * 255)},${Math.round(m.color[1] * 255)},${Math.round(m.color[2] * 255)},0.7)`;

        // Scale-in pop effect
        const pop = alpha < 0.5 ? 1 + (1 - alpha * 2) * 0.15 : 1;

        this.ctx.save();
        this.ctx.globalAlpha = alpha;
        this.ctx.textAlign = 'center';

        // Medal name with colored glow
        this.ctx.save();
        this.ctx.translate(cx, y);
        this.ctx.scale(pop, pop);
        this.drawGlowText(m.name, 0, 0, medalFontSize, colorStr, glowStr, 12);
        this.ctx.restore();

        // Description below
        this.drawGlowText(m.description, cx, y + 14 * scale, descFontSize, '#0a770a', '#0a770a', 3);
        this.ctx.restore();
      }
    } else {
      // No medals — show encouragement
      const noMedalAlpha = Math.min(1, Math.max(0, (animTime - 1.5) * 2));
      this.ctx.save();
      this.ctx.globalAlpha = noMedalAlpha;
      this.ctx.textAlign = 'center';
      this.drawGlowText('Keep playing to earn medals!', cx, sepY + lineH, `${Math.round(13 * scale)}px monospace`, '#0a770a', '#0a770a', 5);
      this.ctx.restore();
    }

    // Play again prompt — fade in after all medals revealed
    const replayDelay = medals.length > 0 ? 1.5 + medals.length * 0.25 + 0.5 : 2.0;
    const replayAlpha = Math.min(1, Math.max(0, (animTime - replayDelay) * 2));
    if (replayAlpha > 0) {
      const pulse = 0.7 + 0.3 * Math.sin(animTime * 3);
      this.ctx.save();
      this.ctx.globalAlpha = replayAlpha * pulse;
      this.ctx.textAlign = 'center';
      const replayText = this.touchMode ? 'Tap to Play Again' : 'Click to Play Again';
      this.drawGlowText(replayText, cx, h * 0.92, `${Math.round(18 * scale)}px monospace`, '#10dd10', '#10dd10', 10);
      this.ctx.restore();
    }
  }

  /** Draw labels above each BlackHole variant in design lab */
  drawDesignLabLabels(labels: { text: string; subtext: string; screenX: number; screenY: number }[]): void {
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    for (const label of labels) {
      this.drawGlowText(label.text, label.screenX, label.screenY, 'bold 16px monospace', '#ffffff', '#ffffff', 12);
      this.drawGlowText(label.subtext, label.screenX, label.screenY + 20, '12px monospace', '#aaaaaa', '#888888', 4);
    }
  }

  /** Draw bottom overlay bar for design lab */
  drawDesignLabOverlay(selectedType: string, typeColor: string): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    // Semi-transparent dark background strip
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    this.ctx.fillRect(0, h - 40, w, 40);

    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    const y = h - 20;
    // Instructions
    this.ctx.font = '13px monospace';
    this.ctx.fillStyle = '#888888';
    this.ctx.fillText('Click to spawn ', w / 2 - 120, y);

    // Selected type highlighted
    this.ctx.fillStyle = typeColor;
    this.ctx.font = 'bold 13px monospace';
    this.ctx.fillText(`[${selectedType.toUpperCase()}]`, w / 2 - 10, y);

    // Key hints
    this.ctx.fillStyle = '#888888';
    this.ctx.font = '13px monospace';
    this.ctx.fillText('  |  1-5 switch  |  D exit', w / 2 + 120, y);

    // Top-left title
    this.ctx.textAlign = 'left';
    this.drawGlowText('DESIGN LAB', 20, 24, 'bold 18px monospace', '#ff8833', '#ff6600', 10);
    this.drawGlowText('BlackHole Visual Sandbox', 20, 46, '12px monospace', '#aa6622', '#884400', 4);

    this.ctx.restore();
  }

  drawLoading(progress: number): void {
    this.clear();
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    this.drawGlowText('LOADING...', w / 2, h / 2 - 20, 'bold 28px monospace', '#20ff20', '#20ff20', 15);

    // Progress bar
    const barW = 200;
    const barH = 6;
    const barX = w / 2 - barW / 2;
    const barY = h / 2 + 15;
    this.ctx.strokeStyle = '#0a550a';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(barX, barY, barW, barH);
    this.ctx.fillStyle = '#20ff20';
    this.ctx.shadowColor = '#20ff20';
    this.ctx.shadowBlur = 8;
    this.ctx.fillRect(barX, barY, barW * progress, barH);
    this.ctx.shadowBlur = 0;
  }
}
