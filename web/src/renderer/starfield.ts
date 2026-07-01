import type { Renderer } from './sprite-batch';

interface Star {
  x: number;
  y: number;
  brightness: number;
  size: number;
}

interface Galaxy {
  x: number;
  y: number;
  rotation: number;
  armCount: number;
  radius: number;
  color: [number, number, number];
  pointCount: number;
  // Pre-computed spiral points (relative to center)
  points: { dx: number; dy: number; b: number }[];
}

interface Nebula {
  x: number;
  y: number;
  radius: number;
  color: [number, number, number];
  // Pre-computed blob points
  blobs: { dx: number; dy: number; r: number; alpha: number }[];
}

interface Sun {
  x: number;
  y: number;
  radius: number;
  color: [number, number, number];
  coronaRays: number;
}

export class Starfield {
  private stars: Star[] = [];
  private galaxies: Galaxy[] = [];
  private nebulae: Nebula[] = [];
  private suns: Sun[] = [];
  private parallax = 0.3;

  constructor(count: number, worldW: number, worldH: number) {
    const spread = 1.5;

    // Regular stars
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: (Math.random() - 0.5) * worldW * spread,
        y: (Math.random() - 0.5) * worldH * spread,
        brightness: 0.35 + Math.random() * 0.5,
        size: 2 + Math.random() * 4,
      });
    }

    // Galaxies (4-6 scattered across the arena)
    const galaxyCount = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < galaxyCount; i++) {
      const gx = (Math.random() - 0.5) * worldW * spread;
      const gy = (Math.random() - 0.5) * worldH * spread;
      const rotation = Math.random() * Math.PI * 2;
      const armCount = 2 + Math.floor(Math.random() * 3);
      const radius = 60 + Math.random() * 100;
      const pointCount = 40 + Math.floor(Math.random() * 30);
      const hue = Math.random();
      const color: [number, number, number] = hue < 0.33
        ? [0.6 + Math.random() * 0.3, 0.3 + Math.random() * 0.2, 0.8 + Math.random() * 0.2] // purple
        : hue < 0.66
        ? [0.3 + Math.random() * 0.2, 0.5 + Math.random() * 0.3, 0.9 + Math.random() * 0.1] // blue
        : [0.9 + Math.random() * 0.1, 0.7 + Math.random() * 0.2, 0.3 + Math.random() * 0.2]; // gold

      // Pre-compute spiral points
      const points: Galaxy['points'] = [];
      for (let p = 0; p < pointCount; p++) {
        const arm = Math.floor(Math.random() * armCount);
        const armAngle = (arm / armCount) * Math.PI * 2;
        const t = Math.random();
        const r = t * radius;
        const angle = armAngle + t * 3.0 + rotation;
        // Add some scatter
        const scatter = (1 - t) * radius * 0.15;
        const dx = Math.cos(angle) * r + (Math.random() - 0.5) * scatter;
        const dy = Math.sin(angle) * r + (Math.random() - 0.5) * scatter;
        const b = (1 - t * 0.6) * 0.35; // brighter near center
        points.push({ dx, dy, b });
      }

      this.galaxies.push({ x: gx, y: gy, rotation, armCount, radius, color, pointCount, points });
    }

    // Nebulae (3-5 large diffuse colored clouds)
    const nebulaCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < nebulaCount; i++) {
      const nx = (Math.random() - 0.5) * worldW * spread;
      const ny = (Math.random() - 0.5) * worldH * spread;
      const radius = 120 + Math.random() * 200;
      const colorChoice = Math.random();
      const color: [number, number, number] = colorChoice < 0.25
        ? [0.8, 0.2, 0.4]  // red/pink
        : colorChoice < 0.5
        ? [0.2, 0.4, 0.8]  // blue
        : colorChoice < 0.75
        ? [0.3, 0.7, 0.5]  // teal/green
        : [0.6, 0.3, 0.7]; // purple

      // Pre-compute blob positions
      const blobCount = 12 + Math.floor(Math.random() * 10);
      const blobs: Nebula['blobs'] = [];
      for (let b = 0; b < blobCount; b++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * radius * 0.8;
        blobs.push({
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist,
          r: 15 + Math.random() * 40,
          alpha: 0.03 + Math.random() * 0.06,
        });
      }

      this.nebulae.push({ x: nx, y: ny, radius, color, blobs });
    }

    // Suns (6-10 bright stars with corona)
    const sunCount = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < sunCount; i++) {
      const colorChoice = Math.random();
      const color: [number, number, number] = colorChoice < 0.3
        ? [1.0, 0.95, 0.8]   // white-yellow
        : colorChoice < 0.5
        ? [1.0, 0.6, 0.2]    // orange
        : colorChoice < 0.7
        ? [0.6, 0.8, 1.0]    // blue-white
        : [1.0, 0.3, 0.2];   // red giant

      this.suns.push({
        x: (Math.random() - 0.5) * worldW * spread,
        y: (Math.random() - 0.5) * worldH * spread,
        radius: 3 + Math.random() * 5,
        color,
        coronaRays: 4 + Math.floor(Math.random() * 5),
      });
    }
  }

  render(renderer: Renderer, cameraX: number, cameraY: number): void {
    const px = this.parallax;

    // Nebulae first (background, very faint)
    for (const n of this.nebulae) {
      const nx = n.x - cameraX * px;
      const ny = n.y - cameraY * px;
      const [cr, cg, cb] = n.color;
      for (const blob of n.blobs) {
        const bx = nx + blob.dx;
        const by = ny + blob.dy;
        // Draw as a cluster of faint triangles to simulate glow
        const segs = 6;
        const step = (Math.PI * 2) / segs;
        for (let i = 0; i < segs; i++) {
          const a1 = i * step;
          const a2 = (i + 1) * step;
          renderer.drawTriangle(
            bx, by,
            bx + Math.cos(a1) * blob.r, by + Math.sin(a1) * blob.r,
            bx + Math.cos(a2) * blob.r, by + Math.sin(a2) * blob.r,
            cr, cg, cb, blob.alpha,
          );
        }
      }
    }

    // Galaxies
    for (const g of this.galaxies) {
      const gx = g.x - cameraX * px;
      const gy = g.y - cameraY * px;
      const [cr, cg, cb] = g.color;

      // Core glow
      const coreSegs = 8;
      const coreR = g.radius * 0.12;
      const coreStep = (Math.PI * 2) / coreSegs;
      for (let i = 0; i < coreSegs; i++) {
        const a1 = i * coreStep;
        const a2 = (i + 1) * coreStep;
        renderer.drawTriangle(
          gx, gy,
          gx + Math.cos(a1) * coreR, gy + Math.sin(a1) * coreR,
          gx + Math.cos(a2) * coreR, gy + Math.sin(a2) * coreR,
          cr, cg, cb, 0.15,
        );
      }

      // Spiral arm points as small crosses
      for (const p of g.points) {
        const sx = gx + p.dx;
        const sy = gy + p.dy;
        const sz = 1.5;
        renderer.drawLine(sx - sz, sy, sx + sz, sy, cr * p.b, cg * p.b, cb * p.b, 0.7);
        renderer.drawLine(sx, sy - sz, sx, sy + sz, cr * p.b, cg * p.b, cb * p.b, 0.7);
      }
    }

    // Suns (bright dots with corona rays)
    for (const s of this.suns) {
      const sx = s.x - cameraX * px;
      const sy = s.y - cameraY * px;
      const [cr, cg, cb] = s.color;
      const r = s.radius;

      // Core filled circle
      const segs = 8;
      const step = (Math.PI * 2) / segs;
      for (let i = 0; i < segs; i++) {
        const a1 = i * step;
        const a2 = (i + 1) * step;
        renderer.drawTriangle(
          sx, sy,
          sx + Math.cos(a1) * r, sy + Math.sin(a1) * r,
          sx + Math.cos(a2) * r, sy + Math.sin(a2) * r,
          cr, cg, cb, 0.6,
        );
      }

      // Corona rays
      const rayStep = (Math.PI * 2) / s.coronaRays;
      for (let i = 0; i < s.coronaRays; i++) {
        const angle = i * rayStep;
        const rayLen = r * 2.5;
        renderer.drawLine(
          sx + Math.cos(angle) * r * 1.2,
          sy + Math.sin(angle) * r * 1.2,
          sx + Math.cos(angle) * rayLen,
          sy + Math.sin(angle) * rayLen,
          cr, cg, cb, 0.25,
        );
      }
    }

    // Regular stars
    for (const s of this.stars) {
      const sx = s.x - cameraX * px;
      const sy = s.y - cameraY * px;
      const b = s.brightness;
      const sz = s.size;
      renderer.drawLine(sx - sz, sy, sx + sz, sy, b, b, b * 1.3, 1.0);
      renderer.drawLine(sx, sy - sz, sx, sy + sz, b, b, b * 1.3, 1.0);
    }
  }
}
