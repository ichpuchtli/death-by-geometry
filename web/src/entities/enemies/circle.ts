import { Enemy } from './enemy';
import { Vec2 } from '../../core/vector';
import type { Renderer } from '../../renderer/sprite-batch';
import { COLORS, ENEMY_SPEED, ENEMY_SCORES, SPAWN_DURATION_CHILD,
         CIRCLE_EJECT_DECAY, CIRCLE_FLOCK_PULL } from '../../config';

export class CircleEnemy extends Enemy {
  radius = 10;
  override gravityImmune = true;
  override family = 'circle' as const;

  /** Initial outward burst velocity set on supernova spawn — decays over ~730ms */
  ejectVel = new Vec2(0, 0);
  /** Shared Vec2 pointing to group centroid — updated each frame by game.ts */
  flockCenter: Vec2 | null = null;

  constructor(pos?: Vec2, radius: number = 10) {
    super();
    this.radius = radius;
    this.color = COLORS.circle.color;
    this.color2 = COLORS.circle.color2;
    this.speed = ENEMY_SPEED.circle;
    this.scoreValue = ENEMY_SCORES.circle;
    this.collisionRadius = radius + 5;
    if (pos) {
      this.position.copyFrom(pos);
      this.spawnDuration = this.spawnTimer = SPAWN_DURATION_CHILD;
    }
    this.displacer = Vec2.random().scale(25);
  }

  update(dt: number, playerPos?: Vec2): void {
    if (!this.active || !playerPos) return;

    // Decay ejection burst
    const decay = Math.max(0, 1 - dt * CIRCLE_EJECT_DECAY);
    this.ejectVel.x *= decay;
    this.ejectVel.y *= decay;

    // Base player-follow velocity
    this.follow(playerPos);

    // Elastic flock pull toward group centroid
    if (this.flockCenter) {
      const dx = this.flockCenter.x - this.position.x;
      const dy = this.flockCenter.y - this.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        const pullSpeed = CIRCLE_FLOCK_PULL * dist;
        this.velocity.x += (dx / dist) * pullSpeed;
        this.velocity.y += (dy / dist) * pullSpeed;
      }
    }

    // Layer ejection on top of computed velocity
    this.velocity.x += this.ejectVel.x;
    this.velocity.y += this.ejectVel.y;

    this.move(dt);
  }

  render(renderer: Renderer): void {
    if (!this.active) return;
    // Inner circle
    renderer.drawCircle(this.position.x, this.position.y, this.radius - 1, this.color2, 20);
    // Outer circle
    renderer.drawCircle(this.position.x, this.position.y, this.radius, this.color, 20);
    // Outer ring
    renderer.drawCircle(this.position.x, this.position.y, this.radius + 1, this.color2, 20);
  }

  /** Expanding ripple rings */
  renderGlow(renderer: Renderer, time: number): void {
    if (!this.active) return;
    this.render(renderer);
    // Two ripple rings at different phases
    for (let i = 0; i < 2; i++) {
      const phase = (time * 2 + i * 0.5) % 1.0;
      const rippleR = this.radius + phase * 18;
      const alpha = (1 - phase) * 0.4;
      renderer.drawCircle(this.position.x, this.position.y, rippleR,
        [this.color[0] * alpha, this.color[1] * alpha, this.color[2] * alpha], 20);
    }
  }
}
