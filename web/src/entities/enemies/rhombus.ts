import { Enemy } from './enemy';
import { Vec2 } from '../../core/vector';
import type { Renderer } from '../../renderer/sprite-batch';
import { COLORS, ENEMY_SPEED, ENEMY_SCORES } from '../../config';

export class Rhombus extends Enemy {
  constructor() {
    super();
    this.shapePoints = [[-15, 0], [0, 25], [15, 0], [0, -25]];
    this.color = COLORS.rhombus.color;
    this.color2 = COLORS.rhombus.color2;
    this.speed = ENEMY_SPEED.rhombus;
    this.scoreValue = ENEMY_SCORES.rhombus;
  }

  update(dt: number, playerPos?: Vec2): void {
    if (!this.active || !playerPos) return;
    this.follow(playerPos);
    this.move(dt);
  }

  /** Pulsing cyan diamond aura */
  renderGlow(renderer: Renderer, time: number): void {
    if (!this.active) return;
    this.render(renderer);
    // Breathing glow: expanding/contracting scaled outline
    const pulse = 1.2 + Math.sin(time * 4) * 0.3;
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const glowPoints = this.shapePoints.map(([x, y]) => [
      this.position.x + (x * pulse) * cos - (y * pulse) * sin,
      this.position.y + (x * pulse) * sin + (y * pulse) * cos,
    ]);
    const a = 0.3 + Math.sin(time * 4) * 0.15;
    renderer.drawLineLoop(glowPoints, [this.color[0] * a, this.color[1] * a, this.color[2] * a]);
  }
}
