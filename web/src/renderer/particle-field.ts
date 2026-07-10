import type { Renderer } from './sprite-batch';
import {
  PARTICLE_FIELD_DENSITY,
  PARTICLE_FIELD_DRAG,
  PARTICLE_FIELD_MAX_SPEED,
  PARTICLE_FIELD_SWIRL,
  PARTICLE_FIELD_STREAK,
  PARTICLE_FIELD_SOFTENING,
  PARTICLE_FIELD_MAX_TRANSIENT,
} from '../config';

/** A gravity source the dust reacts to. `strength` scales both the radial pull
 *  and (via the field's swirl factor) the tangential orbit force; `radius` gates
 *  influence so far-away motes stay calm and cheap. */
export interface FieldAttractor {
  x: number;
  y: number;
  strength: number;
  radius: number;
  /** 0..1 stress/instability of this attractor — biases nearby dust toward hot hues
   *  (amber → white) so the field visibly reacts to a BlackHole's life stage. Optional. */
  heat?: number;
}

/** Camera-space view window the ambient motes wrap within, so density stays even
 *  as the camera moves through the world. */
export interface FieldView {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
}

type MoteMode = 0 | 1 | 2; // 0 = ambient (persistent), 1 = transient, 2 = dead slot

class Mote {
  x = 0;
  y = 0;
  px = 0;
  py = 0;
  vx = 0;
  vy = 0;
  hue = 0;
  size = 1;
  spark = 0;
  mode: MoteMode = 0;
  life = 0;    // seconds remaining (transient only)
  maxLife = 1;
}

/** Convert HSL (h,s,l in 0..1) to linear RGB triplet in 0..1. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

/**
 * Ambient "cosmic dust" field — hundreds of additive motes drifting through world
 * space, pulled and (crucially) *swirled* around attractors so they spiral into
 * glowing accretion disks rather than falling straight in. Motes are drawn as
 * velocity-stretched streaks whose brightness/hue rise with speed. Also accepts
 * transient injected bursts (thruster wake, impact sparklets) that share the same
 * streak look and fade out over a short lifetime.
 *
 * Reusable by both the Particle Lab and the live game. Render during the additive
 * blend pass; bloom does the glow.
 */
export class ParticleField {
  private motes: Mote[] = [];
  private seeded = false;

  // Live-tunable knobs (the lab's sliders write these directly)
  density = PARTICLE_FIELD_DENSITY;
  drag = PARTICLE_FIELD_DRAG;
  maxSpeed = PARTICLE_FIELD_MAX_SPEED;
  /** Tangential force as a fraction of the radial pull — 0 = pure infall, high = tight orbits */
  swirl = PARTICLE_FIELD_SWIRL;
  /** Velocity-stretch multiplier for the streak tail */
  streak = PARTICLE_FIELD_STREAK;
  brightness = 1;

  /** How many motes are currently live (ambient + transient). */
  get count(): number {
    let n = 0;
    for (const m of this.motes) if (m.mode !== 2) n++;
    return n;
  }

  /** (Re)seed the ambient motes uniformly across the view. */
  private seed(view: FieldView): void {
    const margin = 90;
    const minX = view.cx - view.halfW - margin;
    const minY = view.cy - view.halfH - margin;
    const spanX = (view.halfW + margin) * 2;
    const spanY = (view.halfH + margin) * 2;

    // Trim any excess ambient motes if density dropped
    const ambient = this.motes.filter(m => m.mode === 0);
    for (let i = this.density; i < ambient.length; i++) ambient[i].mode = 2;

    for (let i = ambient.length; i < this.density; i++) {
      const m = this.acquire();
      m.mode = 0;
      m.x = minX + Math.random() * spanX;
      m.y = minY + Math.random() * spanY;
      m.px = m.x;
      m.py = m.y;
      m.vx = (Math.random() - 0.5) * 0.6;
      m.vy = (Math.random() - 0.5) * 0.6;
      m.hue = Math.random() * 360;
      m.size = 0.65 + Math.random() * 1.2;
      m.spark = Math.random();
    }
    this.seeded = true;
  }

  /** Grab a dead slot or append a fresh mote. */
  private acquire(): Mote {
    for (const m of this.motes) {
      if (m.mode === 2) return m;
    }
    const m = new Mote();
    this.motes.push(m);
    return m;
  }

  /**
   * Inject a short-lived burst of motes fanning out along `angle` — used for the
   * player thruster wake and bullet-impact sparklets. Reuses dead slots so it
   * never unbounds the pool.
   */
  spawnBurst(
    x: number, y: number, angle: number, spread: number,
    count: number, speed: number, hue: number, life: number,
  ): void {
    let transient = 0;
    for (const m of this.motes) if (m.mode === 1) transient++;

    for (let i = 0; i < count; i++) {
      if (transient >= PARTICLE_FIELD_MAX_TRANSIENT) break;
      const m = this.acquire();
      if (m.mode !== 1) transient++;
      m.mode = 1;
      const a = angle + (Math.random() - 0.5) * spread;
      const sp = speed * (0.4 + Math.random() * 0.6);
      m.x = x;
      m.y = y;
      m.px = x;
      m.py = y;
      m.vx = Math.cos(a) * sp;
      m.vy = Math.sin(a) * sp;
      m.hue = (hue + (Math.random() - 0.5) * 40 + 360) % 360;
      m.size = 0.7 + Math.random() * 1.1;
      m.spark = Math.random();
      m.maxLife = life * (0.7 + Math.random() * 0.6);
      m.life = m.maxLife;
    }
  }

  /** Advance the whole field one frame. `dt` in ms. */
  update(dt: number, attractors: FieldAttractor[], view: FieldView): void {
    if (!this.seeded) this.seed(view);

    const f = Math.max(0.35, Math.min(2.2, dt / 16.6667));
    const dragF = Math.pow(this.drag, f);
    const soft = PARTICLE_FIELD_SOFTENING;
    const maxSp = this.maxSpeed;
    const maxSp2 = maxSp * maxSp;
    const swirlFactor = this.swirl;

    const margin = 90;
    const minX = view.cx - view.halfW - margin;
    const maxX = view.cx + view.halfW + margin;
    const minY = view.cy - view.halfH - margin;
    const maxY = view.cy + view.halfH + margin;
    const spanX = maxX - minX;
    const spanY = maxY - minY;

    for (const m of this.motes) {
      if (m.mode === 2) continue;
      if (m.mode === 1) {
        m.life -= dt / 1000;
        if (m.life <= 0) { m.mode = 2; continue; }
      }

      m.px = m.x;
      m.py = m.y;

      let ax = 0;
      let ay = 0;
      let heatPull = 0; // strongest heat*proximity across attractors this frame
      for (const a of attractors) {
        const dx = a.x - m.x;
        const dy = a.y - m.y;
        const raw = dx * dx + dy * dy;
        if (raw > a.radius * a.radius) continue;
        const d2 = raw + soft;
        const inv = 1 / Math.sqrt(d2);
        const pull = a.strength / d2;
        const swirl = (a.strength * swirlFactor) / d2;
        ax += dx * inv * pull + (-dy * inv) * swirl;
        ay += dy * inv * pull + (dx * inv) * swirl;
        if (a.heat) {
          const prox = 1 - Math.sqrt(raw) / a.radius; // 1 at centre → 0 at rim
          const h = a.heat * prox;
          if (h > heatPull) heatPull = h;
        }
      }

      m.vx += ax * f;
      m.vy += ay * f;
      m.vx *= dragF;
      m.vy *= dragF;

      const sp2 = m.vx * m.vx + m.vy * m.vy;
      if (sp2 > maxSp2) {
        const scale = maxSp / Math.sqrt(sp2);
        m.vx *= scale;
        m.vy *= scale;
      } else if (m.mode === 0 && sp2 < 0.0012) {
        // Keep ambient dust alive with a faint brownian nudge when it stalls
        m.vx += (Math.random() - 0.5) * 0.36;
        m.vy += (Math.random() - 0.5) * 0.36;
      }

      m.x += m.vx * f;
      m.y += m.vy * f;
      m.hue = (m.hue + 0.05 * f + Math.sqrt(sp2) * 0.02) % 360;
      // Heat bias: stressed attractors drag nearby dust toward an amber-hot hue (~30°),
      // so the field glows hotter as the hole nears overload.
      if (heatPull > 0) {
        const diff = ((30 - m.hue + 540) % 360) - 180; // shortest signed path to 30°
        m.hue = (m.hue + diff * heatPull * 0.3 * f + 360) % 360;
      }

      // Ambient motes wrap within the camera view so density stays even
      if (m.mode === 0) {
        let wrapped = false;
        if (m.x < minX) { m.x += spanX; wrapped = true; }
        else if (m.x > maxX) { m.x -= spanX; wrapped = true; }
        if (m.y < minY) { m.y += spanY; wrapped = true; }
        else if (m.y > maxY) { m.y -= spanY; wrapped = true; }
        if (wrapped) { m.px = m.x; m.py = m.y; }
      }
    }
  }

  /** Draw every live mote as a velocity-stretched streak. Call in the additive pass. */
  render(renderer: Renderer): void {
    const streak = this.streak;
    const bright = this.brightness;

    for (const m of this.motes) {
      if (m.mode === 2) continue;

      const sp = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
      let lifeAlpha = 1;
      if (m.mode === 1) lifeAlpha = Math.max(0, m.life / m.maxLife);

      const alpha = Math.min(0.9, 0.2 + sp * 0.085 + m.spark * 0.16) * lifeAlpha * bright;
      const lightness = Math.min(0.82, 0.54 + sp * 0.035);
      const [r, g, b] = hslToRgb((m.hue % 360) / 360, 0.95, lightness);

      // Streak tail trails behind along the velocity; near-still motes get a tiny
      // nub so they still read as a point of light.
      let tx = m.vx * streak;
      let ty = m.vy * streak;
      const segLen = Math.hypot(tx, ty);
      if (segLen < 1.2) {
        const a = m.hue * 0.017453;
        tx = Math.cos(a) * 1.3;
        ty = Math.sin(a) * 1.3;
      }
      renderer.drawLine(m.x - tx, m.y - ty, m.x, m.y, r, g, b, alpha);
    }
  }

  /** Force a reseed on the next update (e.g. after a density change or reset). */
  reseed(): void {
    for (const m of this.motes) if (m.mode === 0) m.mode = 2;
    this.seeded = false;
  }

  clear(): void {
    this.motes.length = 0;
    this.seeded = false;
  }
}
