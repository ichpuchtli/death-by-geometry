import type { Renderer } from './sprite-batch';

/** One escaping matter lance. Reused via a fixed pool (alive flag), never grows past the cap. */
class Lance {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  life = 0;
  maxLife = 1;
  alive = false;
}

/**
 * MATTER — the BlackHole's third emission element, and the only MASSLESS one.
 * Sharp white-amber lance projectiles sprayed outward on every bullet hit: gravity
 * does NOT act on them (no attractor integration — that's the whole point of the
 * element: dust + embers get recaptured by the well, matter escapes). Slight drag,
 * fades as it leaves the disk.
 *
 * Look: a long thin velocity-stretched lance — hot amber glow tail + a near-white
 * core — sharper and brighter than dust motes and straighter than embers (which
 * visibly curve as they're recaptured). Kept deliberately cheap: pooled, capped,
 * two lines per lance. Render in the additive pass.
 */
export class MatterField {
  private lances: Lance[] = [];
  /** Hard cap on live lances (perf guard — desktop ~700, mobile ~260). */
  readonly max: number;
  /** Velocity-stretch for the lance tail (px per unit velocity). */
  streak = 9;
  /** Per-frame velocity retention (frame-normalized) — matter barely slows down. */
  drag = 0.992;

  constructor(max: number) {
    this.max = max;
  }

  /** Live lance count (test hook / lab status line). */
  get count(): number {
    let n = 0;
    for (const l of this.lances) if (l.alive) n++;
    return n;
  }

  /**
   * Spray `count` lances from (x,y) fanning out along `angle` (rad).
   * `speed` is px/frame (same convention as ParticleField bursts), `life` seconds.
   */
  spray(x: number, y: number, angle: number, spread: number, count: number, speed: number, life: number): void {
    for (let i = 0; i < count; i++) {
      if (this.count >= this.max) break;
      const l = this.acquire();
      const a = angle + (Math.random() - 0.5) * spread;
      const sp = speed * (0.55 + Math.random() * 0.45);
      l.x = x;
      l.y = y;
      l.vx = Math.cos(a) * sp;
      l.vy = Math.sin(a) * sp;
      l.maxLife = life * (0.75 + Math.random() * 0.5);
      l.life = l.maxLife;
    }
  }

  private acquire(): Lance {
    for (const l of this.lances) {
      if (!l.alive) {
        l.alive = true;
        return l;
      }
    }
    const l = new Lance();
    l.alive = true;
    this.lances.push(l);
    return l;
  }

  /** Advance all lances one frame. `dt` in ms. NO gravity — that's the element. */
  update(dt: number): void {
    const f = Math.max(0.35, Math.min(2.2, dt / 16.6667));
    const dragF = Math.pow(this.drag, f);
    for (const l of this.lances) {
      if (!l.alive) continue;
      l.life -= dt / 1000;
      if (l.life <= 0) { l.alive = false; continue; }
      l.vx *= dragF;
      l.vy *= dragF;
      l.x += l.vx * f;
      l.y += l.vy * f;
    }
  }

  /** Draw every lance as a hot two-line streak. Call in the additive pass. */
  render(renderer: Renderer): void {
    const streak = this.streak;
    for (const l of this.lances) {
      if (!l.alive) continue;
      const t = l.life / l.maxLife;
      // Ease-out fade with a bright launch
      const a = Math.min(1, t * 1.6);
      const tx = l.vx * streak;
      const ty = l.vy * streak;
      // Amber glow tail (full length) + white-hot core (inner half) — palette: rayOuter/singularity
      renderer.drawLine(l.x - tx, l.y - ty, l.x, l.y, 1, 0.6, 0.15, a * 0.55);
      renderer.drawLine(l.x - tx * 0.5, l.y - ty * 0.5, l.x, l.y, 1, 1, 0.95, a);
    }
  }

  clear(): void {
    for (const l of this.lances) l.alive = false;
  }
}
