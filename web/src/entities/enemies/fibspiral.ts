import { Enemy } from './enemy';
import { Vec2 } from '../../core/vector';
import type { Renderer } from '../../renderer/sprite-batch';
import { COLORS, ENEMY_SPEED, ENEMY_SCORES } from '../../config';

/** Golden spiral enemy — corkscrews toward player in tightening golden-ratio orbits */
export class FibSpiral extends Enemy {
  private orbitAngle = Math.random() * Math.PI * 2;
  private orbitRadius = 0;
  private orbitTarget = new Vec2(0, 0);
  private orbitInitialized = false;
  private totalOrbits = 0;
  private dotPhase = 0;
  private spiralPoints: number[][] = [];

  constructor() {
    super();
    this.color = COLORS.fibspiral.color;
    this.color2 = COLORS.fibspiral.color2;
    this.speed = ENEMY_SPEED.fibspiral;
    this.scoreValue = ENEMY_SCORES.fibspiral;
    this.collisionRadius = 28;

    // Generate golden spiral shape
    this.spiralPoints = [];
    const fibDots = [1, 1, 2, 3, 5, 8, 13];
    for (let i = 0; i < 20; i++) {
      const t = (i / 19) * Math.PI * 6; // 3 rotations
      const r = 3 + i * 1.2;
      this.spiralPoints.push([Math.cos(t) * r, Math.sin(t) * r]);
    }
    // Use spiral outline as shape points for collision/rendering
    this.shapePoints = this.spiralPoints;
  }

  update(dt: number, playerPos?: Vec2): void {
    if (!this.active || !playerPos) return;

    this.dotPhase += dt * 0.004;

    // After 3 full orbits, just follow directly
    if (this.totalOrbits >= 3) {
      this.follow(playerPos);
      this.rotation += dt * 0.003;
      this.move(dt);
      return;
    }

    // Initialize orbit on first update
    if (!this.orbitInitialized) {
      this.orbitTarget.copyFrom(playerPos);
      this.orbitRadius = this.position.sub(playerPos).magnitude();
      if (this.orbitRadius < 100) this.orbitRadius = 300;
      this.orbitInitialized = true;
    }

    // Update target to track player (slowly)
    const dx = playerPos.x - this.orbitTarget.x;
    const dy = playerPos.y - this.orbitTarget.y;
    this.orbitTarget.x += dx * 0.002 * dt;
    this.orbitTarget.y += dy * 0.002 * dt;

    // Spiral inward: tighten radius by golden ratio complement per orbit
    const angularSpeed = this.speed / Math.max(50, this.orbitRadius);
    this.orbitAngle += angularSpeed * dt;
    this.orbitRadius *= 1 - 0.000382 * dt; // slow golden-ratio tightening

    // Track orbits
    if (this.orbitAngle > (this.totalOrbits + 1) * Math.PI * 2) {
      this.totalOrbits++;
    }

    // Position on spiral
    const targetX = this.orbitTarget.x + Math.cos(this.orbitAngle) * this.orbitRadius;
    const targetY = this.orbitTarget.y + Math.sin(this.orbitAngle) * this.orbitRadius;
    const toDest = new Vec2(targetX - this.position.x, targetY - this.position.y);
    const dist = toDest.magnitude();
    if (dist > 1) {
      this.velocity.set(toDest.x / dist * this.speed, toDest.y / dist * this.speed);
    }
    this.rotation = this.orbitAngle;
    this.move(dt);
    this.bounce();
  }

  render(renderer: Renderer): void {
    if (!this.active) return;
    if (this.isSpawning) { this.renderSpawn(renderer); return; }

    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const px = this.position.x;
    const py = this.position.y;

    // Draw spiral line
    for (let i = 0; i < this.spiralPoints.length - 1; i++) {
      const [x1, y1] = this.spiralPoints[i];
      const [x2, y2] = this.spiralPoints[i + 1];
      const wx1 = px + x1 * cos - y1 * sin;
      const wy1 = py + x1 * sin + y1 * cos;
      const wx2 = px + x2 * cos - y2 * sin;
      const wy2 = py + x2 * sin + y2 * cos;
      renderer.drawLine(wx1, wy1, wx2, wy2,
        this.color[0], this.color[1], this.color[2], 0.9);
    }

    // Fibonacci dots pulsing in sequence
    const fibPositions = [0, 0, 1, 2, 4, 7, 12]; // indices into spiralPoints
    for (let i = 0; i < fibPositions.length; i++) {
      const idx = Math.min(fibPositions[i], this.spiralPoints.length - 1);
      const [sx, sy] = this.spiralPoints[idx];
      const wx = px + sx * cos - sy * sin;
      const wy = py + sx * sin + sy * cos;
      const pulse = 0.5 + Math.sin(this.dotPhase + i * 0.8) * 0.5;
      renderer.drawCircle(wx, wy, 3 + pulse * 2, this.color, 8, 0.6 + pulse * 0.4);
    }
  }

  renderGlow(renderer: Renderer, time: number): void {
    if (!this.active) return;
    this.render(renderer);
    // Spiral afterimage
    const pulse = 0.3 + Math.sin(time * 3) * 0.15;
    renderer.drawCircle(this.position.x, this.position.y, this.collisionRadius + 5,
      [this.color[0] * pulse, this.color[1] * pulse, this.color[2] * pulse], 16);
  }
}
