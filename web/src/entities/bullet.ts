import { Entity } from './entity';
import { Vec2 } from '../core/vector';
import type { Renderer } from '../renderer/sprite-batch';
import {
  BULLET_SPEED,
  BULLET_SCALE,
  BULLET_COLOR,
  BULLET_COLOR2,
  BULLET_POOL_SIZE,
} from '../config';
import { gameSettings } from '../settings';

export class Bullet extends Entity {
  angle = 0;
  trailId = -1; // assigned by LifecycleSystem

  init(x: number, y: number, angle: number): void {
    this.position.set(x, y);
    this.angle = angle;
    this.velocity.set(Math.cos(angle) * BULLET_SPEED, Math.sin(angle) * BULLET_SPEED);
    this.active = true;
  }

  update(dt: number): void {
    if (!this.active) return;
    this.move(dt);
    // Deactivate when leaving world
    const hw = gameSettings.arenaWidth / 2 + 50;
    const hh = gameSettings.arenaHeight / 2 + 50;
    if (
      this.position.x < -hw || this.position.x > hw ||
      this.position.y < -hh || this.position.y > hh
    ) {
      this.active = false;
    }
  }

  render(renderer: Renderer): void {
    if (!this.active) return;
    const s = BULLET_SCALE;
    const cos = Math.cos(this.angle);
    const sin = Math.sin(this.angle);
    const px = this.position.x;
    const py = this.position.y;

    // Diamond shape rotated to bullet direction
    const points = [
      [px - sin * s, py + cos * s],       // top
      [px + cos * s * 2, py + sin * s * 2], // right (tip)
      [px + sin * s, py - cos * s],         // bottom
      [px - cos * s * 2, py - sin * s * 2], // left (back)
    ];

    // Fill (two triangles)
    const [cr, cg, cb] = BULLET_COLOR;
    renderer.drawTriangle(points[0][0], points[0][1], points[1][0], points[1][1], points[2][0], points[2][1], cr, cg, cb, 1);
    renderer.drawTriangle(points[0][0], points[0][1], points[2][0], points[2][1], points[3][0], points[3][1], cr, cg, cb, 1);

    // Outline
    const [cr2, cg2, cb2] = BULLET_COLOR2;
    renderer.drawLineLoop(points, [cr2, cg2, cb2]);
  }
}

export class BulletPool {
  bullets: Bullet[] = [];

  constructor() {
    for (let i = 0; i < BULLET_POOL_SIZE; i++) {
      const b = new Bullet();
      b.active = false;
      this.bullets.push(b);
    }
  }

  spawn(x: number, y: number, angle: number): Bullet | null {
    for (const b of this.bullets) {
      if (!b.active) {
        b.init(x, y, angle);
        return b;
      }
    }
    return null; // pool exhausted
  }

  update(dt: number): void {
    for (const b of this.bullets) {
      if (b.active) b.update(dt);
    }
  }

  render(renderer: Renderer): void {
    for (const b of this.bullets) {
      if (b.active) b.render(renderer);
    }
  }

  clear(): void {
    for (const b of this.bullets) b.active = false;
  }

  get activeCount(): number {
    let c = 0;
    for (const b of this.bullets) if (b.active) c++;
    return c;
  }
}
