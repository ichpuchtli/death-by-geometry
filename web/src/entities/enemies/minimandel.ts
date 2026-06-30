import { Enemy } from './enemy';
import { Vec2 } from '../../core/vector';
import { Renderer } from '../../renderer/sprite-batch';
import { COLORS, ENEMY_SPEED, ENEMY_SCORES, SPAWN_DURATION_CHILD } from '../../config';
import type { Mandelbrot } from './mandelbrot';

/** MiniMandel — small cardioid minion spawned by Mandelbrot miniboss */
export class MiniMandel extends Enemy {
  override family = 'minimandel' as const;

  parent: Mandelbrot | null = null;

  constructor(pos?: Vec2) {
    super();
    this.color = COLORS.minimandel.color;
    this.color2 = COLORS.minimandel.color2;
    this.speed = ENEMY_SPEED.minimandel;
    this.scoreValue = ENEMY_SCORES.minimandel;
    this.collisionRadius = 16;
    this.spawnDuration = this.spawnTimer = SPAWN_DURATION_CHILD;

    // Small cardioid shape
    this.shapePoints = [];
    for (let i = 0; i < 16; i++) {
      const theta = (i / 16) * Math.PI * 2;
      const r = (1 - Math.cos(theta)) * 10;
      this.shapePoints.push([Math.cos(theta) * r, Math.sin(theta) * r]);
    }

    if (pos) {
      this.position.copyFrom(pos);
    }
  }

  update(dt: number, playerPos?: Vec2): void {
    if (!this.active || !playerPos) return;
    this.follow(playerPos);
    this.rotation += dt * 0.003;
    this.move(dt);
    this.bounce();
  }

  render(renderer: Renderer): void {
    if (!this.active) return;
    if (this.isSpawning) { this.renderSpawn(renderer); return; }
    const points = this.getWorldPoints();
    renderer.drawLineLoop(points.map(([x, y]) => [x - 1, y]), this.color2);
    renderer.drawLineLoop(points, this.color);
  }

  renderGlow(renderer: Renderer, time: number): void {
    if (!this.active) return;
    this.render(renderer);
    const pulse = 0.5 + Math.sin(time * 4) * 0.3;
    renderer.drawCircle(this.position.x, this.position.y, 10,
      [this.color[0] * pulse, this.color[1] * pulse, this.color[2] * pulse], 8);
  }
}
