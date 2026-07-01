import { Enemy } from './enemy';
import { Vec2 } from '../../core/vector';
import type { Renderer } from '../../renderer/sprite-batch';
import { COLORS, ENEMY_SPEED, ENEMY_SCORES, HYPERBOLICDISC_HP } from '../../config';

/** HyperbolicDisc — Poincare disk model. Curves nearby bullet paths. */
export class HyperbolicDisc extends Enemy {
  private hitFlash = 0;
  private tilingRotation = 0;

  constructor() {
    super();
    this.color = COLORS.hyperbolicdisc.color;
    this.color2 = COLORS.hyperbolicdisc.color2;
    this.speed = ENEMY_SPEED.hyperbolicdisc;
    this.scoreValue = ENEMY_SCORES.hyperbolicdisc;
    this.hp = HYPERBOLICDISC_HP;
    this.maxHp = HYPERBOLICDISC_HP;
    this.collisionRadius = 40;

    // Circle shape for collision
    const r = 35;
    this.shapePoints = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.shapePoints.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  hit(): boolean {
    this.hitFlash = 0.15;
    return super.hit();
  }

  update(dt: number, playerPos?: Vec2): void {
    if (!this.active || !playerPos) return;
    if (this.hitFlash > 0) this.hitFlash -= dt / 1000;
    this.follow(playerPos);
    // Hyperbolic tiling rotation — inner faster than outer
    this.tilingRotation += dt * 0.002;
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
    const r = 35;
    const drawColor: [number, number, number] = this.hitFlash > 0 ? [1, 1, 1] : this.color;

    // Outer boundary circle
    renderer.drawCircle(px, py, r, drawColor, 32, 0.9);

    // Internal hyperbolic tiling — concentric arcs with increasing density
    for (let ring = 1; ring <= 4; ring++) {
      const ringR = r * (ring / 5);
      const segments = 6 + ring * 2;
      // Inner rings rotate faster (hyperbolic distortion)
      const rot = this.tilingRotation * (5 - ring);
      const alpha = 0.3 + (ring / 5) * 0.3;

      for (let i = 0; i < segments; i++) {
        const a1 = rot + (i / segments) * Math.PI * 2;
        const a2 = rot + ((i + 1) / segments) * Math.PI * 2;
        const x1 = px + Math.cos(a1) * ringR;
        const y1 = py + Math.sin(a1) * ringR;
        const x2 = px + Math.cos(a2) * ringR;
        const y2 = py + Math.sin(a2) * ringR;
        renderer.drawLine(x1, y1, x2, y2,
          this.color2[0], this.color2[1], this.color2[2], alpha);
      }

      // Radial spokes for this ring
      if (ring <= 3) {
        for (let i = 0; i < segments; i += 2) {
          const a = rot + (i / segments) * Math.PI * 2;
          const x1 = px + Math.cos(a) * ringR;
          const y1 = py + Math.sin(a) * ringR;
          const nextR = r * ((ring + 1) / 5);
          const x2 = px + Math.cos(a) * nextR;
          const y2 = py + Math.sin(a) * nextR;
          renderer.drawLine(x1, y1, x2, y2,
            this.color2[0], this.color2[1], this.color2[2], alpha * 0.5);
        }
      }
    }

    // Boundary shimmer
    const shimmer = 0.3 + Math.sin(this.tilingRotation * 3) * 0.15;
    renderer.drawCircle(px, py, r + 3, [this.color2[0], this.color2[1], this.color2[2]], 32, shimmer);

    // HP indicator
    if (this.hp < this.maxHp) {
      for (let i = 0; i < this.hp; i++) {
        const a = (i / this.maxHp) * Math.PI * 2;
        const dx = px + Math.cos(a) * (r + 10);
        const dy = py + Math.sin(a) * (r + 10);
        renderer.drawCircle(dx, dy, 3, this.color, 8);
      }
    }
  }

  renderGlow(renderer: Renderer, time: number): void {
    if (!this.active) return;
    this.render(renderer);
    // Gravity distortion rings
    for (let i = 0; i < 3; i++) {
      const phase = (time * 0.8 + i * 0.33) % 1.0;
      const ringR = this.collisionRadius + phase * 50;
      const alpha = (1 - phase) * 0.25;
      renderer.drawCircle(this.position.x, this.position.y, ringR,
        [this.color[0] * alpha, this.color[1] * alpha, this.color[2] * alpha], 28);
    }
  }
}
