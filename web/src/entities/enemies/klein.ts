import { Enemy } from './enemy';
import { Vec2 } from '../../core/vector';
import type { Renderer } from '../../renderer/sprite-batch';
import { COLORS, ENEMY_SPEED, ENEMY_SCORES, KLEIN_HP } from '../../config';

/** Klein bottle cross-section — reflects bullets from wrong angles */
export class Klein extends Enemy {
  private safeArcAngle = 0; // center of the 90° safe arc (radians)
  private hitFlash = 0;
  private arrowFlow = 0;

  static readonly SAFE_ARC_WIDTH = Math.PI / 2; // 90 degrees
  static readonly ARC_ROTATION_SPEED = 0.0008; // radians per ms

  constructor() {
    super();
    this.color = COLORS.klein.color;
    this.color2 = COLORS.klein.color2;
    this.speed = ENEMY_SPEED.klein;
    this.scoreValue = ENEMY_SCORES.klein;
    this.hp = KLEIN_HP;
    this.maxHp = KLEIN_HP;
    this.collisionRadius = 36;
    this.safeArcAngle = Math.random() * Math.PI * 2;

    // Two overlapping circles represented as single shape
    const r = 25;
    this.shapePoints = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.shapePoints.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  /** Check if a bullet angle falls within the safe arc */
  isInSafeArc(bulletAngle: number): boolean {
    let diff = bulletAngle - this.safeArcAngle;
    // Normalize to [-PI, PI]
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) < Klein.SAFE_ARC_WIDTH / 2;
  }

  onBulletHit(bulletAngle: number): 'damage' | 'absorb' | 'reflect' {
    return this.isInSafeArc(bulletAngle) ? 'damage' : 'reflect';
  }

  hit(): boolean {
    this.hitFlash = 0.15;
    return super.hit();
  }

  update(dt: number, playerPos?: Vec2): void {
    if (!this.active || !playerPos) return;
    if (this.hitFlash > 0) this.hitFlash -= dt / 1000;

    // Rotate safe arc
    this.safeArcAngle += Klein.ARC_ROTATION_SPEED * dt;
    this.arrowFlow += dt * 0.003;

    this.follow(playerPos);
    this.rotation += dt * 0.001;
    this.move(dt);
    this.bounce();
  }

  override renderSpawn(renderer: Renderer): void {
    this.renderSpawnCrystallize(renderer);
  }

  render(renderer: Renderer): void {
    if (!this.active) return;
    if (this.isSpawning) { this.renderSpawn(renderer); return; }

    const px = this.position.x;
    const py = this.position.y;
    const r1 = 20; // circle 1 radius
    const r2 = 18; // circle 2 radius
    const offset = 8; // overlap offset
    const drawColor: [number, number, number] = this.hitFlash > 0 ? [1, 1, 1] : this.color;

    // Circle 1 (solid)
    renderer.drawCircle(px - offset, py, r1, drawColor, 20, 0.9);

    // Circle 2 (dashed — draw partial segments)
    const dashCount = 10;
    for (let i = 0; i < dashCount; i++) {
      if (i % 2 === 0) {
        const a1 = (i / dashCount) * Math.PI * 2;
        const a2 = ((i + 1) / dashCount) * Math.PI * 2;
        const x1 = px + offset + Math.cos(a1) * r2;
        const y1 = py + Math.sin(a1) * r2;
        const x2 = px + offset + Math.cos(a2) * r2;
        const y2 = py + Math.sin(a2) * r2;
        renderer.drawLine(x1, y1, x2, y2,
          this.color2[0], this.color2[1], this.color2[2], 0.7);
      }
    }

    // Intersection glow
    renderer.drawCircle(px, py, 8, this.color, 12, 0.5 + Math.sin(this.arrowFlow * 2) * 0.2);

    // Arrow flow indicators along circles
    const arrowCount = 6;
    for (let i = 0; i < arrowCount; i++) {
      const t = (this.arrowFlow + i / arrowCount) % 1;
      const a = t * Math.PI * 2;
      const ax = px - offset + Math.cos(a) * r1;
      const ay = py + Math.sin(a) * r1;
      renderer.drawCircle(ax, ay, 2, [1, 1, 1], 4, 0.6);
    }

    // Safe arc indicator (bright wedge on perimeter)
    const arcSegs = 8;
    const arcR = this.collisionRadius + 5;
    const arcStart = this.safeArcAngle - Klein.SAFE_ARC_WIDTH / 2;
    for (let i = 0; i < arcSegs; i++) {
      const a1 = arcStart + (i / arcSegs) * Klein.SAFE_ARC_WIDTH;
      const a2 = arcStart + ((i + 1) / arcSegs) * Klein.SAFE_ARC_WIDTH;
      const x1 = px + Math.cos(a1) * arcR;
      const y1 = py + Math.sin(a1) * arcR;
      const x2 = px + Math.cos(a2) * arcR;
      const y2 = py + Math.sin(a2) * arcR;
      renderer.drawLine(x1, y1, x2, y2, 0.3, 1, 0.6, 0.7);
    }

    // HP dots
    if (this.hp < this.maxHp) {
      for (let i = 0; i < this.hp; i++) {
        const a = (i / this.maxHp) * Math.PI * 2;
        renderer.drawCircle(px + Math.cos(a) * 45, py + Math.sin(a) * 45, 3, this.color, 8);
      }
    }
  }

  renderGlow(renderer: Renderer, time: number): void {
    if (!this.active) return;
    this.render(renderer);
    const pulse = 0.3 + Math.sin(time * 2.5) * 0.15;
    renderer.drawCircle(this.position.x, this.position.y, this.collisionRadius + 8,
      [this.color[0] * pulse, this.color[1] * pulse, this.color[2] * pulse], 20);
  }
}
