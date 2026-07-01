import type { Renderer } from './sprite-batch';

const MAX_TRAIL_ENTITIES = 500;
const DEFAULT_TRAIL_LENGTH = 10;

interface TrailEntry {
  x: number;
  y: number;
}

export class TrailSystem {
  // Map entity ID -> ring buffer of positions
  private trails = new Map<number, { points: TrailEntry[]; head: number; length: number; color: [number, number, number]; maxLen: number }>();
  private nextId = 0;

  register(color: [number, number, number], maxLength: number = DEFAULT_TRAIL_LENGTH): number {
    const id = this.nextId++;
    this.trails.set(id, {
      points: new Array(maxLength).fill(null).map(() => ({ x: 0, y: 0 })),
      head: 0,
      length: 0,
      color,
      maxLen: maxLength,
    });
    return id;
  }

  unregister(id: number): void {
    this.trails.delete(id);
  }

  update(id: number, x: number, y: number): void {
    const trail = this.trails.get(id);
    if (!trail) return;
    trail.points[trail.head].x = x;
    trail.points[trail.head].y = y;
    trail.head = (trail.head + 1) % trail.maxLen;
    if (trail.length < trail.maxLen) trail.length++;
  }

  render(renderer: Renderer): void {
    for (const trail of this.trails.values()) {
      if (trail.length < 2) continue;
      const [r, g, b] = trail.color;
      for (let i = 1; i < trail.length; i++) {
        const idx0 = (trail.head - i - 1 + trail.maxLen) % trail.maxLen;
        const idx1 = (trail.head - i + trail.maxLen) % trail.maxLen;
        const tFrac = i / trail.length;
        const alpha = Math.pow(1 - tFrac, 2) * 0.85;
        renderer.drawLine(
          trail.points[idx0].x, trail.points[idx0].y,
          trail.points[idx1].x, trail.points[idx1].y,
          r, g, b, alpha,
        );
      }
    }
  }

  clear(): void {
    this.trails.clear();
    this.nextId = 0;
  }
}
