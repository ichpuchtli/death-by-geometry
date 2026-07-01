import { Enemy, EnemyDeathResult } from './enemy';
import { Vec2 } from '../../core/vector';
import type { Renderer } from '../../renderer/sprite-batch';
import { COLORS, ENEMY_SPEED, ENEMY_SCORES } from '../../config';

export class Triangle extends Enemy {
  constructor() {
    super();
    const s = 30;
    const h = (Math.sqrt(3) / 4) * s;
    this.shapePoints = [
      [-0.5 * s, -h], [0.5 * s, -h], [0, h],
    ];
    this.color = COLORS.triangle.color;
    this.color2 = COLORS.triangle.color2;
    this.speed = ENEMY_SPEED.triangle;
    this.scoreValue = ENEMY_SCORES.triangle;
    this.velocity = Vec2.random().scale(this.speed);
  }

  update(dt: number): void {
    if (!this.active) return;
    this.bounce();
    this.rotation += dt * 0.002;
    this.move(dt);
  }

  render(renderer: Renderer): void {
    if (!this.active) return;
    const points = this.getWorldPoints();
    // Double-line rendering
    renderer.drawLineLoop(points.map(([x, y]) => [x - 1, y]), this.color2);
    renderer.drawLineLoop(points, this.color);
    // Fusion circles at vertices
    for (const [x, y] of points) {
      renderer.drawCircle(x, y, 8, this.color, 12);
    }
  }

  /** Sequential vertex glow - energy pulses between vertices */
  renderGlow(renderer: Renderer, time: number): void {
    if (!this.active) return;
    this.render(renderer);
    const points = this.getWorldPoints();
    // One vertex glows brightly at a time, cycling
    const activeIdx = Math.floor((time * 3) % 3);
    for (let i = 0; i < points.length; i++) {
      const bright = i === activeIdx ? 0.8 : 0.2;
      renderer.drawCircle(points[i][0], points[i][1], 12,
        [this.color[0] * bright, this.color[1] * bright, this.color[2] * bright], 14);
    }
  }

  onDeath(): EnemyDeathResult {
    return {
      spawnEnemies: this.getWorldPoints().map(([x, y]) => ({
        type: 'circle',
        position: new Vec2(x, y),
      })),
    };
  }
}
