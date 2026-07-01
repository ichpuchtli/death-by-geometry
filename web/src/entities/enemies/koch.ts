import { Enemy } from './enemy';
import { Vec2 } from '../../core/vector';
import type { Renderer } from '../../renderer/sprite-batch';
import { COLORS, ENEMY_SPEED, ENEMY_SCORES, KOCH_HP } from '../../config';

/** Koch snowflake — dashes, leaves ice trails that slow the player */
export class Koch extends Enemy {
  private dashing = false;
  private dashTimer = 0;
  private driftTimer = 0;
  private driftDir = Vec2.random();
  iceTrail: { x: number; y: number; age: number }[] = [];
  private trailTimer = 0;

  static readonly DRIFT_DURATION = 3000; // ms
  static readonly DASH_DURATION = 500;   // ms
  static readonly DASH_SPEED_MULT = 3;
  static readonly TRAIL_INTERVAL = 100;  // ms between trail drops
  static readonly TRAIL_MAX_AGE = 3000;  // ms
  static readonly TRAIL_MAX_SEGMENTS = 100;
  static readonly SLOW_RADIUS = 15;      // px proximity to trigger slow
  static readonly SLOW_FACTOR = 0.4;     // 40% slow
  static readonly SLOW_DURATION = 1000;  // ms

  constructor() {
    super();
    this.color = COLORS.koch.color;
    this.color2 = COLORS.koch.color2;
    this.speed = ENEMY_SPEED.koch;
    this.scoreValue = ENEMY_SCORES.koch;
    this.hp = KOCH_HP;
    this.maxHp = KOCH_HP;
    this.collisionRadius = 38;
    this.driftTimer = Koch.DRIFT_DURATION;

    // Generate Koch snowflake shape at depth 3
    this.shapePoints = generateKochSnowflake(3, 30);
  }

  update(dt: number, playerPos?: Vec2): void {
    if (!this.active) return;

    // Age and cull ice trail
    for (let i = this.iceTrail.length - 1; i >= 0; i--) {
      this.iceTrail[i].age += dt;
      if (this.iceTrail[i].age > Koch.TRAIL_MAX_AGE) {
        this.iceTrail.splice(i, 1);
      }
    }

    // Drop trail segments
    this.trailTimer += dt;
    if (this.trailTimer >= Koch.TRAIL_INTERVAL) {
      this.trailTimer -= Koch.TRAIL_INTERVAL;
      if (this.iceTrail.length < Koch.TRAIL_MAX_SEGMENTS) {
        this.iceTrail.push({ x: this.position.x, y: this.position.y, age: 0 });
      }
    }

    // Dash/drift cycle
    if (this.dashing) {
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) {
        this.dashing = false;
        this.driftTimer = Koch.DRIFT_DURATION;
        this.driftDir = Vec2.random();
      } else if (playerPos) {
        const dir = playerPos.sub(this.position);
        const m = dir.magnitude();
        if (m > 0) {
          const dashSpeed = this.speed * Koch.DASH_SPEED_MULT;
          this.velocity.set(dir.x / m * dashSpeed, dir.y / m * dashSpeed);
        }
      }
    } else {
      this.driftTimer -= dt;
      if (this.driftTimer <= 0) {
        this.dashing = true;
        this.dashTimer = Koch.DASH_DURATION;
      } else {
        this.velocity.set(this.driftDir.x * this.speed * 0.5, this.driftDir.y * this.speed * 0.5);
      }
    }

    this.rotation -= dt * 0.001;
    this.move(dt);
    this.bounce();
  }

  override renderSpawn(renderer: Renderer): void {
    this.renderSpawnCrystallize(renderer);
  }

  render(renderer: Renderer): void {
    if (!this.active) return;
    if (this.isSpawning) { this.renderSpawn(renderer); return; }

    // Draw ice trail
    for (let i = 0; i < this.iceTrail.length - 1; i++) {
      const a = this.iceTrail[i];
      const b = this.iceTrail[i + 1];
      const alpha = 0.4 * (1 - a.age / Koch.TRAIL_MAX_AGE);
      renderer.drawLine(a.x, a.y, b.x, b.y,
        this.color[0], this.color[1], this.color[2], alpha);
    }

    // Draw snowflake shape
    const points = this.getWorldPoints();
    renderer.drawLineLoop(points.map(([x, y]) => [x - 1, y]), this.color2);
    renderer.drawLineLoop(points, this.color);

    // Vertex sparkle
    const time = Date.now() * 0.001;
    const sparkIdx = Math.floor((time * 8) % points.length);
    if (sparkIdx < points.length) {
      const [sx, sy] = points[sparkIdx];
      renderer.drawCircle(sx, sy, 3, [1, 1, 1], 6, 0.8);
    }
  }

  renderGlow(renderer: Renderer, time: number): void {
    if (!this.active) return;
    this.render(renderer);
    const pulse = 0.3 + Math.sin(time * 2.5) * 0.2;
    renderer.drawCircle(this.position.x, this.position.y, this.collisionRadius + 5,
      [this.color[0] * pulse, this.color[1] * pulse, this.color[2] * pulse], 20);
  }
}

/** Generate Koch snowflake vertices at given depth and scale */
function generateKochSnowflake(depth: number, size: number): number[][] {
  // Start with equilateral triangle
  const h = (Math.sqrt(3) / 2) * size;
  let points: [number, number][] = [
    [0, -h * 0.67],
    [size / 2, h * 0.33],
    [-size / 2, h * 0.33],
  ];

  for (let d = 0; d < depth; d++) {
    const newPoints: [number, number][] = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      const dx = x2 - x1;
      const dy = y2 - y1;

      // Divide segment into thirds
      const ax = x1 + dx / 3;
      const ay = y1 + dy / 3;
      const bx = x1 + dx * 2 / 3;
      const by = y1 + dy * 2 / 3;

      // Peak of equilateral triangle on middle third (outward)
      const mx = (ax + bx) / 2 - (by - ay) * Math.sqrt(3) / 2;
      const my = (ay + by) / 2 + (bx - ax) * Math.sqrt(3) / 2;

      newPoints.push([x1, y1], [ax, ay], [mx, my], [bx, by]);
    }
    points = newPoints;
  }

  return points;
}
