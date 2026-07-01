import { Enemy } from './enemy';
import { Vec2 } from '../../core/vector';
import type { Renderer } from '../../renderer/sprite-batch';
import { COLORS, ENEMY_SPEED, ENEMY_SCORES, SPAWN_DURATION_CHILD } from '../../config';

/** Shard — tiny fast triangle spawned by Sierpinski death */
export class Shard extends Enemy {
  constructor(pos?: Vec2) {
    super();
    const s = 8;
    const h = (Math.sqrt(3) / 4) * s;
    this.shapePoints = [
      [-0.5 * s, -h], [0.5 * s, -h], [0, h],
    ];
    this.color = COLORS.shard.color;
    this.color2 = COLORS.shard.color2;
    this.speed = ENEMY_SPEED.shard;
    this.scoreValue = ENEMY_SCORES.shard;
    this.collisionRadius = 12;
    this.spawnDuration = this.spawnTimer = SPAWN_DURATION_CHILD;
    this.velocity = Vec2.random().scale(this.speed);

    if (pos) {
      this.position.copyFrom(pos);
    }
  }

  update(dt: number): void {
    if (!this.active) return;
    this.rotation += dt * 0.006;
    this.move(dt);
    this.bounce();
  }

  render(renderer: Renderer): void {
    if (!this.active) return;
    if (this.isSpawning) { this.renderSpawn(renderer); return; }
    const points = this.getWorldPoints();
    renderer.drawLineLoop(points, this.color);
  }

  renderGlow(renderer: Renderer, time: number): void {
    if (!this.active) return;
    this.render(renderer);
    const pulse = 0.5 + Math.sin(time * 5) * 0.3;
    renderer.drawCircle(this.position.x, this.position.y, 8,
      [this.color[0] * pulse, this.color[1] * pulse, this.color[2] * pulse], 8);
  }
}
