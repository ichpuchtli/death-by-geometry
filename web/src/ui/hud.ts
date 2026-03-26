import { HUD_FONT, HUD_COLOR, MedalDef, PHASE_DISPLAY_NAMES, WEAPON_STAGES } from '../config';
import { RunStats } from '../game';

export class HUD {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private touchMode = false;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fpsDisplay = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2d context for HUD');
    this.ctx = ctx;
  }

  setTouchMode(touch: boolean): void {
    this.touchMode = touch;
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
    this.ctx.textBaseline = 'top';

    // Score top-left with glow
    this.ctx.textAlign = 'left';
    this.drawGlowText(`SCORE: ${score}`, 20, 20, HUD_FONT, HUD_COLOR, '#0a550a', 8);

    // Lives top-right with glow
    this.ctx.textAlign = 'right';
    this.drawGlowText(`LIVES: ${lives}`, this.canvas.clientWidth - 20, 20, HUD_FONT, HUD_COLOR, '#0a550a', 8);

    // FPS + enemy count bottom-left
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'bottom';
    const fpsColor = this.fpsDisplay >= 55 ? '#20ff20' : this.fpsDisplay >= 30 ? '#ffff20' : '#ff3030';
    let debugText = `FPS: ${this.fpsDisplay}`;
    if (enemyCount !== undefined) debugText += `  ENEMIES: ${enemyCount}`;
    this.drawGlowText(debugText, 20, this.canvas.clientHeight - 10, '14px monospace', fpsColor, fpsColor, 5);
    this.ctx.textBaseline = 'top';

    // Status indicators (top-center)
    this.ctx.textAlign = 'center';
    const indicators: string[] = [];
    if (muted) indicators.push('MUTED [M]');
    if (autoFire) indicators.push('AUTO-FIRE [F]');
    if (indicators.length > 0) {
      const text = indicators.join('  ');
      const color = muted ? '#aa3030' : '#30aa30';
      this.drawGlowText(text, this.canvas.clientWidth / 2, 20, '14px monospace', color, color, 5);
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
    const weaponName = ['Single', 'Fast', 'Dual', 'Fast Dual', 'Triple'][stats.weaponStage] || 'Single';

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
