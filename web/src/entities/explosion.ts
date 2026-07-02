import { Vec2 } from '../core/vector';
import type { Renderer } from '../renderer/sprite-batch';
import {
  EXPLOSION_POOL_SIZE,
  DEATH_FRAGMENT_CONE,
  DEATH_FRAGMENT_SIDE_DAMPING,
  DEATH_FRAGMENT_FORWARD_BOOST,
} from '../config';

interface Particle {
  dir: Vec2;
}

export class Explosion {
  active = false;
  position = new Vec2(0, 0);
  color: [number, number, number] = [1, 1, 1];
  particles: Particle[] = [];
  elapsed = 0;
  duration = 1; // seconds
  speed = 1;

  init(x: number, y: number, color: [number, number, number], count: number, duration: number, speed: number = 1, direction?: number): void {
    this.position.set(x, y);
    this.color = color;
    this.duration = duration;
    this.speed = speed;
    this.elapsed = 0;
    this.active = true;

    // Reuse or create particles
    while (this.particles.length < count) {
      this.particles.push({ dir: Vec2.random() });
    }
    // Reinitialize directions
    for (let i = 0; i < count; i++) {
      if (direction === undefined) {
        // Radial burst (stored-energy detonation)
        const r = Vec2.random();
        this.particles[i].dir.set(
          (r.x + (Math.random() - 0.5)) * (0.5 + Math.random()),
          (r.y + (Math.random() - 0.5)) * (0.5 + Math.random()),
        );
      } else {
        // Momentum-conserving shatter: fragments fan forward along the impact
        // direction. Triangular spread concentrates mass near the axis, speed
        // falls off toward the cone edge, and the back hemisphere gets nothing.
        const spread = (Math.random() + Math.random() - 1) * DEATH_FRAGMENT_CONE;
        const align = Math.cos(spread); // 1 dead-ahead → ~0.22 at the cone edge
        const mag = (0.5 + Math.random())
          * (DEATH_FRAGMENT_SIDE_DAMPING + (1 - DEATH_FRAGMENT_SIDE_DAMPING) * align)
          * DEATH_FRAGMENT_FORWARD_BOOST;
        this.particles[i].dir.set(
          Math.cos(direction + spread) * mag,
          Math.sin(direction + spread) * mag,
        );
      }
    }
    this.particles.length = count;
  }

  update(dt: number): void {
    if (!this.active) return;
    this.elapsed += dt / 1000;
    if (this.elapsed >= this.duration) {
      this.active = false;
    }
  }

  render(renderer: Renderer): void {
    if (!this.active) return;
    const t = this.elapsed * this.speed * 100;
    const lifeRatio = this.elapsed / this.duration;
    const alpha = Math.max(0, 1 - lifeRatio);
    const [r, g, b] = this.color;
    const cx = this.position.x;
    const cy = this.position.y;

    // Central flash (first 20% of life)
    if (lifeRatio < 0.2) {
      const flashAlpha = (1 - lifeRatio / 0.2) * 0.8;
      const flashR = 10 + lifeRatio * 60;
      renderer.drawFilledCircle(cx, cy, flashR, [1, 1, 1], 10, flashAlpha);
    }

    // Shockwave rings (expanding, fading)
    const ringCount = this.particles.length > 80 ? 3 : this.particles.length > 40 ? 2 : 1;
    for (let ri = 0; ri < ringCount; ri++) {
      const ringDelay = ri * 0.08;
      const ringLife = Math.max(0, lifeRatio - ringDelay);
      if (ringLife > 0 && ringLife < 0.6) {
        const ringProgress = ringLife / 0.6;
        const ringRadius = 20 + ringProgress * (60 + ri * 30);
        const ringAlpha = (1 - ringProgress) * 0.5;
        renderer.drawCircle(cx, cy, ringRadius, [r * 0.8 + 0.2, g * 0.8 + 0.2, b * 0.8 + 0.2], 16, ringAlpha);
      }
    }

    // Particles with enhanced motion blur
    for (const p of this.particles) {
      const x1 = cx + p.dir.x * t;
      const y1 = cy + p.dir.y * t;
      const stretch = 1.25 + t * 0.003;
      const x2 = cx + p.dir.x * t * stretch;
      const y2 = cy + p.dir.y * t * stretch;
      const dist = Math.sqrt(p.dir.x * p.dir.x + p.dir.y * p.dir.y);
      const whiteness = Math.max(0, 1 - dist * 2.0);
      const pr = r + (1 - r) * whiteness;
      const pg = g + (1 - g) * whiteness;
      const pb = b + (1 - b) * whiteness;
      renderer.drawLine(x1, y1, x2, y2, pr, pg, pb, alpha);

      // Secondary ghost trail (dimmer, offset) for big explosions only
      if (this.particles.length > 60) {
        const ghostStretch = stretch * 1.3;
        const x3 = cx + p.dir.x * t * ghostStretch;
        const y3 = cy + p.dir.y * t * ghostStretch;
        renderer.drawLine(x2, y2, x3, y3, pr, pg, pb, alpha * 0.3);
      }
    }

    // Ember sparks (late-life tiny dots drifting outward)
    if (lifeRatio > 0.4 && this.particles.length > 20) {
      const emberAlpha = alpha * 0.6;
      const emberCount = Math.min(8, Math.floor(this.particles.length / 8));
      for (let i = 0; i < emberCount; i++) {
        const p = this.particles[i * 4 % this.particles.length];
        const drift = t * 1.4 + i * 8;
        const ex = cx + p.dir.x * drift;
        const ey = cy + p.dir.y * drift;
        renderer.drawLine(ex, ey, ex + p.dir.x * 3, ey + p.dir.y * 3, 1, 0.9, 0.5, emberAlpha);
      }
    }
  }
}

export class ExplosionPool {
  explosions: Explosion[] = [];

  constructor() {
    for (let i = 0; i < EXPLOSION_POOL_SIZE; i++) {
      this.explosions.push(new Explosion());
    }
  }

  /** `direction` (rad, optional): impact direction — fragments fan forward instead of radially */
  spawn(x: number, y: number, color: [number, number, number], count: number, duration: number, speed: number = 1, direction?: number): void {
    for (const e of this.explosions) {
      if (!e.active) {
        e.init(x, y, color, count, duration, speed, direction);
        return;
      }
    }
  }

  update(dt: number): void {
    for (const e of this.explosions) {
      if (e.active) e.update(dt);
    }
  }

  render(renderer: Renderer): void {
    for (const e of this.explosions) {
      if (e.active) e.render(renderer);
    }
  }

  clear(): void {
    for (const e of this.explosions) e.active = false;
  }
}
