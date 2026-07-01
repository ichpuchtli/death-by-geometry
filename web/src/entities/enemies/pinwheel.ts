import { Enemy } from './enemy';
import { Vec2 } from '../../core/vector';
import type { Renderer } from '../../renderer/sprite-batch';
import { COLORS, ENEMY_SPEED, ENEMY_SCORES } from '../../config';

export class Pinwheel extends Enemy {
  override family = 'pinwheel' as const;
  override isBouncer = true;

  constructor() {
    super();
    const s = 20;
    this.shapePoints = [
      [0, 0], [0, s], [s * 0.5, s * 0.5], [-s * 0.5, -s * 0.5],
      [0, -s], [0, 0], [s, 0], [s * 0.5, -s * 0.5],
      [-s * 0.5, s * 0.5], [-s, 0],
    ];
    this.color = COLORS.pinwheel.color;
    this.color2 = COLORS.pinwheel.color2;
    this.speed = ENEMY_SPEED.pinwheel;
    this.scoreValue = ENEMY_SCORES.pinwheel;
    this.velocity = Vec2.random().scale(this.speed);
  }

  update(dt: number): void {
    if (!this.active) return;
    this.bounce();
    this.rotation -= dt * 0.003; // counter-clockwise
    this.move(dt);
  }

  /** Orbiting purple glow dots */
  renderGlow(renderer: Renderer, time: number): void {
    if (!this.active) return;
    this.render(renderer);
    // 4 orbiting glow dots
    const orbitR = 28;
    for (let i = 0; i < 4; i++) {
      const angle = this.rotation + (i / 4) * Math.PI * 2;
      const gx = this.position.x + Math.cos(angle) * orbitR;
      const gy = this.position.y + Math.sin(angle) * orbitR;
      const pulse = 0.4 + Math.sin(time * 5 + i) * 0.2;
      renderer.drawCircle(gx, gy, 5, [this.color[0] * pulse, this.color[1] * pulse, this.color[2] * pulse], 10);
    }
  }
}
