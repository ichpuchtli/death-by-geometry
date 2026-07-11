import { Enemy } from './enemy';
import { Vec2 } from '../../core/vector';
import type { Renderer } from '../../renderer/sprite-batch';
import { COLORS, ENEMY_SPEED, ENEMY_SCORES, SPAWN_DURATION_CHILD,
         CIRCLE_ORBIT_SPRING, CIRCLE_ORBIT_DRAG, CIRCLE_ORBIT_SPEED_CAP } from '../../config';

export class CircleEnemy extends Enemy {
  radius = 10;
  override gravityImmune = true;
  override family = 'circle' as const;
  override hasTrail = false; // circles read as dusty motes, not streaking trails

  /** Outward burst velocity set on supernova spawn — consumed once into `velocity` as
   *  the circle's initial orbital momentum (see update). */
  ejectVel = new Vec2(0, 0);
  /** Shared Vec2 pointing to group centroid — set by Threat Lab (vestigial for the game). */
  flockCenter: Vec2 | null = null;
  private ejectConsumed = false;

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

  /**
   * Orbital tracking — the player is treated as a BlackHole. The circle carries momentum
   * and is pulled toward the player by a central spring that strengthens with distance, so
   * it overshoots, curves into an orbit, and falls back into the player's "gravity". Low
   * drag keeps the orbit alive; the supernova eject burst seeds the initial momentum.
   */
  update(dt: number, playerPos?: Vec2, _playerVel?: Vec2): void {
    if (!this.active || !playerPos) return;

    // Consume the one-time eject burst into persistent velocity (initial orbital momentum).
    if (!this.ejectConsumed) {
      this.velocity.x += this.ejectVel.x;
      this.velocity.y += this.ejectVel.y;
      this.ejectConsumed = true;
    }

    const f = Math.max(0.35, Math.min(2.2, dt / 16.6667));

    // Central spring pull toward the player: a = SPRING * distance, so a straying circle
    // is always reeled back in — bound orbits, no escape.
    const dx = playerPos.x - this.position.x;
    const dy = playerPos.y - this.position.y;
    this.velocity.x += dx * CIRCLE_ORBIT_SPRING * dt;
    this.velocity.y += dy * CIRCLE_ORBIT_SPRING * dt;

    // Low drag bleeds a little energy so the orbit slowly tightens rather than orbiting
    // forever; the eject momentum gives the initial overshoot.
    const dragF = Math.pow(CIRCLE_ORBIT_DRAG, f);
    this.velocity.x *= dragF;
    this.velocity.y *= dragF;

    // Speed cap.
    const sp2 = this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y;
    const cap = CIRCLE_ORBIT_SPEED_CAP;
    if (sp2 > cap * cap) {
      const s = cap / Math.sqrt(sp2);
      this.velocity.x *= s;
      this.velocity.y *= s;
    }

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
