import { Enemy } from './enemy';
import { Vec2 } from '../../core/vector';
import type { Renderer } from '../../renderer/sprite-batch';
import { COLORS, ENEMY_SPEED, ENEMY_SCORES, TESSERACT_HP } from '../../config';

/** Tesseract — 4D hypercube. Counter-rotating inner/outer squares. Dimensional phase. */
export class Tesseract extends Enemy {
  private innerRot = 0;
  private outerRot = 0;
  private phaseTimer = 6; // seconds until next phase
  isPhasing = false;
  private phaseProgress = 0; // 0-1 over 0.8s
  private hitFlash = 0;
  private baseCollisionRadius = 42;

  static readonly PHASE_CYCLE = 6;    // seconds between phases
  static readonly PHASE_DURATION = 0.8; // seconds for transition

  constructor() {
    super();
    this.color = COLORS.tesseract.color;
    this.color2 = COLORS.tesseract.color2;
    this.speed = ENEMY_SPEED.tesseract;
    this.scoreValue = ENEMY_SCORES.tesseract;
    this.hp = TESSERACT_HP;
    this.maxHp = TESSERACT_HP;
    this.collisionRadius = 42;

    // Outer square for collision shape
    const s = 30;
    this.shapePoints = [[s, s], [-s, s], [-s, -s], [s, -s]];
  }

  hit(): boolean {
    this.hitFlash = 0.15;
    return super.hit();
  }

  update(dt: number, playerPos?: Vec2): void {
    if (!this.active || !playerPos) return;
    if (this.hitFlash > 0) this.hitFlash -= dt / 1000;

    // Counter-rotating squares
    this.innerRot += dt * 0.002;
    this.outerRot -= dt * 0.002;

    // Phase cycle
    this.phaseTimer -= dt / 1000;
    if (this.phaseTimer <= 0 && !this.isPhasing) {
      this.isPhasing = true;
      this.phaseProgress = 0;
    }

    if (this.isPhasing) {
      this.phaseProgress += dt / 1000 / Tesseract.PHASE_DURATION;
      if (this.phaseProgress >= 1) {
        this.isPhasing = false;
        this.phaseProgress = 0;
        this.phaseTimer = Tesseract.PHASE_CYCLE;
      }

      // During phase: halved collision, doubled speed
      this.collisionRadius = this.baseCollisionRadius * 0.5;
      this.follow(playerPos);
      this.velocity.x *= 2;
      this.velocity.y *= 2;
    } else {
      this.collisionRadius = this.baseCollisionRadius;
      this.follow(playerPos);
    }

    this.move(dt);
    this.bounce();
  }

  override renderSpawn(renderer: Renderer): void {
    this.renderSpawnRift(renderer);
  }

  render(renderer: Renderer): void {
    if (!this.active) return;
    if (this.isSpawning) { this.renderSpawn(renderer); return; }

    const px = this.position.x;
    const py = this.position.y;
    const drawColor: [number, number, number] = this.hitFlash > 0 ? [1, 1, 1] : this.color;
    const drawColor2: [number, number, number] = this.hitFlash > 0 ? [0.8, 0.8, 0.8] : this.color2;

    // During phase transition, sizes interpolate (inner grows, outer shrinks)
    let innerSize = 15;
    let outerSize = 30;
    if (this.isPhasing) {
      const t = this.phaseProgress;
      // Smooth swap
      innerSize = 15 + t * 15;
      outerSize = 30 - t * 15;
    }

    const alpha = this.isPhasing ? 0.4 + Math.sin(this.phaseProgress * 20) * 0.2 : 1.0;

    // Inner square
    const innerPts = this.getSquarePoints(px, py, innerSize, this.innerRot);
    renderer.drawLineLoop(innerPts, drawColor2, alpha);

    // Outer square
    const outerPts = this.getSquarePoints(px, py, outerSize, this.outerRot);
    renderer.drawLineLoop(outerPts, drawColor, alpha);

    // Connecting lines between corresponding vertices
    for (let i = 0; i < 4; i++) {
      const lineAlpha = this.isPhasing
        ? alpha * (0.3 + Math.sin(this.phaseProgress * 30 + i) * 0.3)
        : alpha * 0.6;
      renderer.drawLine(
        innerPts[i][0], innerPts[i][1],
        outerPts[i][0], outerPts[i][1],
        drawColor2[0], drawColor2[1], drawColor2[2], lineAlpha,
      );
    }

    // Vertex halos
    for (const [vx, vy] of [...innerPts, ...outerPts]) {
      renderer.drawCircle(vx, vy, 3, drawColor, 6, alpha * 0.5);
    }

    // HP indicator
    if (this.hp < this.maxHp) {
      for (let i = 0; i < this.hp; i++) {
        const a = (i / this.maxHp) * Math.PI * 2;
        renderer.drawCircle(px + Math.cos(a) * 48, py + Math.sin(a) * 48, 3, this.color, 8);
      }
    }
  }

  private getSquarePoints(cx: number, cy: number, size: number, rotation: number): number[][] {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const corners = [[size, size], [-size, size], [-size, -size], [size, -size]];
    return corners.map(([x, y]) => [
      cx + x * cos - y * sin,
      cy + x * sin + y * cos,
    ]);
  }

  renderGlow(renderer: Renderer, time: number): void {
    if (!this.active) return;
    this.render(renderer);
    const pulse = 0.3 + Math.sin(time * 2) * 0.15;
    renderer.drawCircle(this.position.x, this.position.y, this.collisionRadius + 10,
      [this.color[0] * pulse, this.color[1] * pulse, this.color[2] * pulse], 20);
  }
}
