import { Enemy } from './enemy';
import { Vec2 } from '../../core/vector';
import type { Renderer } from '../../renderer/sprite-batch';
import { COLORS, ENEMY_SPEED, ENEMY_SCORES, PENROSE_HP } from '../../config';

/** Penrose impossible triangle — follows player, teleports short distances */
export class Penrose extends Enemy {
  private teleportCooldown = 0;
  private telegraphTimer = 0;
  private telegraphing = false;
  private ghostPos: Vec2 | null = null;
  private ghostAlpha = 0;
  private overlapPhase = 0; // which bar appears "in front" cycles

  static readonly TELEPORT_MIN_CD = 4000;  // ms
  static readonly TELEPORT_MAX_CD = 5000;
  static readonly TELEGRAPH_DURATION = 500; // ms
  static readonly TELEPORT_MIN_DIST = 10;
  static readonly TELEPORT_MAX_DIST = 80;
  static readonly GHOST_DURATION = 300;     // ms

  constructor() {
    super();
    this.color = COLORS.penrose.color;
    this.color2 = COLORS.penrose.color2;
    this.speed = ENEMY_SPEED.penrose;
    this.scoreValue = ENEMY_SCORES.penrose;
    this.hp = PENROSE_HP;
    this.maxHp = PENROSE_HP;
    this.collisionRadius = 32;
    this.teleportCooldown = Penrose.TELEPORT_MIN_CD + Math.random() * 1000;

    // Penrose impossible triangle — 3 parallelogram bars
    const s = 25;
    const h = s * Math.sqrt(3) / 2;
    const w = 6; // bar width
    this.shapePoints = [
      // Bar 1 (bottom-left to top)
      [-s / 2 - w, -h / 3], [-w, h * 2 / 3], [w, h * 2 / 3], [-s / 2 + w, -h / 3],
      // Bar 2 (bottom-right to top — overlap zone)
      [s / 2 + w, -h / 3], [w, h * 2 / 3], [-w, h * 2 / 3], [s / 2 - w, -h / 3],
      // Bar 3 (bottom connecting)
      [-s / 2 - w, -h / 3], [-s / 2 + w, -h / 3], [s / 2 - w, -h / 3], [s / 2 + w, -h / 3],
    ];
  }

  update(dt: number, playerPos?: Vec2): void {
    if (!this.active || !playerPos) return;

    this.overlapPhase += dt * 0.00125; // cycle overlap every 0.8s
    this.teleportCooldown -= dt;

    // Ghost fade
    if (this.ghostAlpha > 0) {
      this.ghostAlpha -= dt / Penrose.GHOST_DURATION;
      if (this.ghostAlpha < 0) this.ghostAlpha = 0;
    }

    // Telegraph → teleport
    if (this.telegraphing) {
      this.telegraphTimer -= dt;
      if (this.telegraphTimer <= 0) {
        this.telegraphing = false;
        // Execute teleport
        this.ghostPos = this.position.clone();
        this.ghostAlpha = 1;
        const angle = Math.atan2(playerPos.y - this.position.y, playerPos.x - this.position.x)
          + (Math.random() - 0.5) * Math.PI; // biased toward player but randomized
        const dist = Penrose.TELEPORT_MIN_DIST + Math.random() * (Penrose.TELEPORT_MAX_DIST - Penrose.TELEPORT_MIN_DIST);
        this.position.x += Math.cos(angle) * dist;
        this.position.y += Math.sin(angle) * dist;
        this.teleportCooldown = Penrose.TELEPORT_MIN_CD + Math.random() * (Penrose.TELEPORT_MAX_CD - Penrose.TELEPORT_MIN_CD);
      }
    } else if (this.teleportCooldown <= 0) {
      this.telegraphing = true;
      this.telegraphTimer = Penrose.TELEGRAPH_DURATION;
    }

    // Normal movement (with vibration during telegraph)
    this.follow(playerPos);
    this.move(dt);
    this.bounce();
  }

  override renderSpawn(renderer: Renderer): void {
    this.renderSpawnCrystallize(renderer);
  }

  render(renderer: Renderer): void {
    if (!this.active) return;
    if (this.isSpawning) { this.renderSpawn(renderer); return; }

    // Ghost afterimage
    if (this.ghostPos && this.ghostAlpha > 0) {
      this.drawPenrose(renderer, this.ghostPos.x, this.ghostPos.y, this.rotation, this.ghostAlpha * 0.5);
    }

    // Position jitter during telegraph
    let px = this.position.x;
    let py = this.position.y;
    if (this.telegraphing) {
      const intensity = 1 - this.telegraphTimer / Penrose.TELEGRAPH_DURATION;
      px += (Math.random() - 0.5) * 8 * intensity;
      py += (Math.random() - 0.5) * 8 * intensity;
    }

    this.drawPenrose(renderer, px, py, this.rotation, 1.0);
  }

  private drawPenrose(renderer: Renderer, cx: number, cy: number, rot: number, alpha: number): void {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const s = 25;
    const h = s * Math.sqrt(3) / 2;

    // Three vertices of the impossible triangle
    const v0: [number, number] = [0, h * 2 / 3]; // top
    const v1: [number, number] = [-s / 2, -h / 3]; // bottom-left
    const v2: [number, number] = [s / 2, -h / 3]; // bottom-right

    const vertices = [v0, v1, v2];
    const transformed = vertices.map(([x, y]) => [
      cx + x * cos - y * sin,
      cy + x * sin + y * cos,
    ]);

    // Draw 3 thick bars
    const barWidth = 4;
    for (let i = 0; i < 3; i++) {
      const [x1, y1] = transformed[i];
      const [x2, y2] = transformed[(i + 1) % 3];
      // Which bar appears "in front" cycles
      const inFront = Math.floor(this.overlapPhase) % 3 === i;
      const col = inFront ? this.color : this.color2;
      const a = alpha * (inFront ? 1.0 : 0.7);

      // Draw bar as two parallel lines
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        const nx = -dy / len * barWidth;
        const ny = dx / len * barWidth;
        renderer.drawLine(x1 + nx, y1 + ny, x2 + nx, y2 + ny, col[0], col[1], col[2], a);
        renderer.drawLine(x1 - nx, y1 - ny, x2 - nx, y2 - ny, col[0], col[1], col[2], a);
        renderer.drawLine(x1 + nx, y1 + ny, x1 - nx, y1 - ny, col[0], col[1], col[2], a * 0.5);
      }
    }

    // Junction glow at vertices
    for (const [vx, vy] of transformed) {
      renderer.drawCircle(vx, vy, 5, this.color, 8, alpha * 0.6);
    }
  }

  renderGlow(renderer: Renderer, time: number): void {
    if (!this.active) return;
    this.render(renderer);
    const pulse = 0.3 + Math.sin(time * 3) * 0.15;
    renderer.drawCircle(this.position.x, this.position.y, this.collisionRadius + 5,
      [this.color[0] * pulse, this.color[1] * pulse, this.color[2] * pulse], 16);
  }
}
