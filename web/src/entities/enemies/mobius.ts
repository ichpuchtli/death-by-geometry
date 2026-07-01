import { Enemy } from './enemy';
import { Vec2 } from '../../core/vector';
import type { Renderer } from '../../renderer/sprite-batch';
import { COLORS, ENEMY_SPEED, ENEMY_SCORES, MOBIUS_HP } from '../../config';

/** Mobius strip — orbits player, phase-shifts immune every orbit */
export class Mobius extends Enemy {
  private orbitAngle = Math.random() * Math.PI * 2;
  private orbitRadius = 280;
  private orbitTarget = new Vec2(0, 0);
  private orbitCount = 0;
  private lastOrbitCount = 0;
  private immunePhase = false;
  private immuneTimer = 0;
  private dotT = 0; // traveling dot parameter

  static readonly IMMUNE_DURATION = 0.8; // seconds
  static readonly ORBIT_RADIUS = 280;

  constructor() {
    super();
    this.color = COLORS.mobius.color;
    this.color2 = COLORS.mobius.color2;
    this.speed = ENEMY_SPEED.mobius;
    this.scoreValue = ENEMY_SCORES.mobius;
    this.hp = MOBIUS_HP;
    this.maxHp = MOBIUS_HP;
    this.collisionRadius = 30;

    // Figure-eight shape: parametric x=cos(t), y=sin(2t)/2
    this.shapePoints = [];
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      this.shapePoints.push([Math.cos(t) * 20, Math.sin(2 * t) * 10]);
    }
  }

  onBulletHit(_bulletAngle: number): 'damage' | 'absorb' | 'reflect' {
    return this.immunePhase ? 'absorb' : 'damage';
  }

  update(dt: number, playerPos?: Vec2): void {
    if (!this.active || !playerPos) return;

    this.dotT += dt * 0.003;

    // Track player slowly
    const dx = playerPos.x - this.orbitTarget.x;
    const dy = playerPos.y - this.orbitTarget.y;
    this.orbitTarget.x += dx * 0.003 * dt;
    this.orbitTarget.y += dy * 0.003 * dt;

    // Orbit
    this.orbitAngle += (this.speed / this.orbitRadius) * dt;
    this.orbitCount = Math.floor(this.orbitAngle / (Math.PI * 2));

    // Check for orbit completion → trigger immune phase
    if (this.orbitCount > this.lastOrbitCount) {
      this.lastOrbitCount = this.orbitCount;
      this.immunePhase = true;
      this.immuneTimer = Mobius.IMMUNE_DURATION;
    }

    // Tick immune timer
    if (this.immunePhase) {
      this.immuneTimer -= dt / 1000;
      if (this.immuneTimer <= 0) {
        this.immunePhase = false;
        this.immuneTimer = 0;
      }
    }

    // Position on orbit
    const targetX = this.orbitTarget.x + Math.cos(this.orbitAngle) * this.orbitRadius;
    const targetY = this.orbitTarget.y + Math.sin(this.orbitAngle) * this.orbitRadius;
    const toDest = new Vec2(targetX - this.position.x, targetY - this.position.y);
    const dist = toDest.magnitude();
    if (dist > 1) {
      const spd = Math.min(this.speed * 2, dist / dt * 0.5);
      this.velocity.set(toDest.x / dist * spd, toDest.y / dist * spd);
    }

    this.rotation += dt * 0.002;
    this.move(dt);
    this.bounce();
  }

  override renderSpawn(renderer: Renderer): void {
    this.renderSpawnRift(renderer);
  }

  render(renderer: Renderer): void {
    if (!this.active) return;
    if (this.isSpawning) { this.renderSpawn(renderer); return; }

    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const px = this.position.x;
    const py = this.position.y;

    // Color depends on immune state
    const drawColor: [number, number, number] = this.immunePhase
      ? [1.0, 0.39, 0.28]  // coral when immune
      : this.color;
    const alpha = this.immunePhase ? 0.5 : 1.0;

    // Draw figure-eight ribbon
    for (let i = 0; i < this.shapePoints.length; i++) {
      const [x1, y1] = this.shapePoints[i];
      const [x2, y2] = this.shapePoints[(i + 1) % this.shapePoints.length];
      const wx1 = px + x1 * cos - y1 * sin;
      const wy1 = py + x1 * sin + y1 * cos;
      const wx2 = px + x2 * cos - y2 * sin;
      const wy2 = py + x2 * sin + y2 * cos;
      renderer.drawLine(wx1, wy1, wx2, wy2,
        drawColor[0], drawColor[1], drawColor[2], alpha);
    }

    // Traveling dot along the ribbon
    const dotIdx = (this.dotT % 1) * this.shapePoints.length;
    const i0 = Math.floor(dotIdx) % this.shapePoints.length;
    const frac = dotIdx - Math.floor(dotIdx);
    const [ax, ay] = this.shapePoints[i0];
    const [bx, by] = this.shapePoints[(i0 + 1) % this.shapePoints.length];
    const dotX = px + (ax + (bx - ax) * frac) * cos - (ay + (by - ay) * frac) * sin;
    const dotY = py + (ax + (bx - ax) * frac) * sin + (ay + (by - ay) * frac) * cos;
    // Dot is bright teal on "outside", dim on "inside" (halfway through)
    const dotBright = dotIdx < this.shapePoints.length / 2 ? 1.0 : 0.4;
    renderer.drawCircle(dotX, dotY, 4, [drawColor[0] * dotBright, drawColor[1] * dotBright, drawColor[2] * dotBright], 8, 0.9);
  }

  renderGlow(renderer: Renderer, time: number): void {
    if (!this.active) return;
    this.render(renderer);
    const pulse = 0.4 + Math.sin(time * 2) * 0.2;
    renderer.drawCircle(this.position.x, this.position.y, this.collisionRadius + 6,
      [this.color[0] * pulse, this.color[1] * pulse, this.color[2] * pulse], 16);
  }
}
