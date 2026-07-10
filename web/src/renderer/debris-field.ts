import type { Renderer } from './sprite-batch';
import {
  SHATTER_EDGE_SUBDIV,
  SHATTER_EJECT_SPEED,
  SHATTER_IMPACT_SHARE,
  SHATTER_SPIN,
  SHATTER_DRAG,
  SHATTER_LIFE,
  SHATTER_POOL_SIZE,
  SHATTER_THICKNESS,
} from '../config';

/**
 * One rigid line fragment — a single edge (or sub-edge) sheared off a shattered unit.
 * It keeps its own linear + angular velocity and tumbles as a solid body until it fades.
 * The segment is stored as two endpoints relative to the fragment's own centre, then
 * rotated by the accumulated spin each frame, so it reads as a real snapped-off strut.
 */
class Shard {
  active = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  angle = 0;
  spin = 0;
  // Endpoints relative to (x, y), unrotated
  ex1 = 0;
  ey1 = 0;
  ex2 = 0;
  ey2 = 0;
  r = 1;
  g = 1;
  b = 1;
  life = 0;
  maxLife = 1;
}

/**
 * Geometry shatter — solid-object destruction. Instead of dissolving a killed unit into
 * a generic radial particle cloud, we break it along its OWN edges: every edge of its
 * wireframe becomes an independent fragment that tumbles outward from the shape centroid,
 * inheriting the impact momentum. Cheap enough to build live per death (a shape has only
 * a handful of edges); no precomputation needed.
 *
 * Render during the additive blend pass (same as trails/explosions); bloom does the glow.
 */
export class DebrisField {
  private shards: Shard[] = [];

  constructor() {
    for (let i = 0; i < SHATTER_POOL_SIZE; i++) this.shards.push(new Shard());
  }

  get count(): number {
    let n = 0;
    for (const s of this.shards) if (s.active) n++;
    return n;
  }

  private acquire(): Shard | null {
    for (const s of this.shards) if (!s.active) return s;
    return null;
  }

  /**
   * Break a closed wireframe (world-space points, in loop order) into tumbling fragments.
   * @param points   world-space vertices of the shape (closed loop)
   * @param cx,cy    shape centroid (fragments eject outward from here)
   * @param color    base fragment colour
   * @param impactAngle  direction of the killing blow (rad) — fragments carry its momentum
   * @param impactSpeed  momentum magnitude scale (px/ms) added along impactAngle
   */
  shatter(
    points: number[][],
    cx: number,
    cy: number,
    color: [number, number, number],
    impactAngle: number,
    impactSpeed: number,
  ): void {
    if (points.length < 2) return;
    const [cr, cg, cb] = color;
    const idx = Math.cos(impactAngle);
    const idy = Math.sin(impactAngle);
    const subdiv = Math.max(1, SHATTER_EDGE_SUBDIV);

    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[(i + 1) % points.length];
      for (let s = 0; s < subdiv; s++) {
        const t0 = s / subdiv;
        const t1 = (s + 1) / subdiv;
        const x0 = ax + (bx - ax) * t0;
        const y0 = ay + (by - ay) * t0;
        const x1 = ax + (bx - ax) * t1;
        const y1 = ay + (by - ay) * t1;
        this.spawnShard(x0, y0, x1, y1, cx, cy, cr, cg, cb, idx, idy, impactSpeed);
      }
    }
  }

  private spawnShard(
    x0: number, y0: number, x1: number, y1: number,
    cx: number, cy: number,
    cr: number, cg: number, cb: number,
    idx: number, idy: number, impactSpeed: number,
  ): void {
    const shard = this.acquire();
    if (!shard) return;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    // Outward direction from the shape centroid
    let ox = mx - cx;
    let oy = my - cy;
    const om = Math.hypot(ox, oy) || 1;
    ox /= om;
    oy /= om;
    const eject = SHATTER_EJECT_SPEED * (0.6 + Math.random() * 0.8);
    const impulse = impactSpeed * SHATTER_IMPACT_SHARE;

    shard.active = true;
    shard.x = mx;
    shard.y = my;
    shard.ex1 = x0 - mx;
    shard.ey1 = y0 - my;
    shard.ex2 = x1 - mx;
    shard.ey2 = y1 - my;
    shard.vx = ox * eject + idx * impulse + (Math.random() - 0.5) * 0.04;
    shard.vy = oy * eject + idy * impulse + (Math.random() - 0.5) * 0.04;
    shard.angle = 0;
    shard.spin = (Math.random() - 0.5) * 2 * SHATTER_SPIN;
    shard.r = cr;
    shard.g = cg;
    shard.b = cb;
    shard.maxLife = SHATTER_LIFE * (0.7 + Math.random() * 0.6);
    shard.life = shard.maxLife;
  }

  update(dt: number): void {
    const f = Math.max(0.35, Math.min(2.2, dt / 16.6667));
    const dragF = Math.pow(SHATTER_DRAG, f);
    for (const s of this.shards) {
      if (!s.active) continue;
      s.life -= dt / 1000;
      if (s.life <= 0) { s.active = false; continue; }
      s.x += s.vx * dt; // velocities are px/ms, dt is ms
      s.y += s.vy * dt;
      s.vx *= dragF;
      s.vy *= dragF;
      s.angle += s.spin * dt;
    }
  }

  render(renderer: Renderer): void {
    for (const s of this.shards) {
      if (!s.active) continue;
      const life = s.life / s.maxLife; // 1 → 0
      // A near-white pop at the instant of the break, cooling to the unit's colour.
      const flash = Math.max(0, life - 0.7) / 0.3; // hot for the first 30% of life
      const r = s.r + (1 - s.r) * flash;
      const g = s.g + (1 - s.g) * flash;
      const b = s.b + (1 - s.b) * flash;
      const alpha = life; // fades from the instant of the break, but stays legible
      const cosA = Math.cos(s.angle);
      const sinA = Math.sin(s.angle);
      const p1x = s.x + s.ex1 * cosA - s.ey1 * sinA;
      const p1y = s.y + s.ex1 * sinA + s.ey1 * cosA;
      const p2x = s.x + s.ex2 * cosA - s.ey2 * sinA;
      const p2y = s.y + s.ex2 * sinA + s.ey2 * cosA;
      // Give the shard body: a bright core line + two dimmer parallel lines offset along
      // the segment normal, so it reads as a solid snapped-off strut, not a hairline.
      renderer.drawLine(p1x, p1y, p2x, p2y, r, g, b, alpha);
      let nx = p2y - p1y;
      let ny = -(p2x - p1x);
      const nl = Math.hypot(nx, ny);
      if (nl > 0.001) {
        nx = (nx / nl) * SHATTER_THICKNESS;
        ny = (ny / nl) * SHATTER_THICKNESS;
        renderer.drawLine(p1x + nx, p1y + ny, p2x + nx, p2y + ny, r, g, b, alpha * 0.5);
        renderer.drawLine(p1x - nx, p1y - ny, p2x - nx, p2y - ny, r, g, b, alpha * 0.5);
      }
    }
  }

  clear(): void {
    for (const s of this.shards) s.active = false;
  }
}
