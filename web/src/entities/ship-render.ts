import type { Renderer } from '../renderer/sprite-batch';

type RGB = [number, number, number];

export interface ShipPalette {
  line: RGB;      // bright neon trim
  line2: RGB;     // darker trim (depth)
  hull: RGB;      // base plating
  hullDark: RGB;  // facets facing away from the light
  hullLight: RGB; // facets facing the light
  hullAlpha: number;
}

// "Scythe" — picked in the Player Design Lab v2 (?player=1): a long-swept evolution
// of the Geometry Wars claw. Open nose (dark intake gap between the blades),
// facing right (+x) at angle 0. Shared by the player and the AI wingman.
const SHIP_VERTS: [number, number][] = [
  [1.70, 0.30], [0.7, 0.42], [-0.3, 0.72], [-1.0, 0.95], [-1.25, 0.6],
  [-0.6, 0.2], [-0.35, 0.0],
  [-0.6, -0.2], [-1.25, -0.6], [-1.0, -0.95], [-0.3, -0.72], [0.7, -0.42], [1.70, -0.30],
];
const SHIP_OPEN_NOSE = true;
const SHIP_CANOPY: [number, number, number] = [0.35, 0, 0.14]; // x, y, radius (local)

// Light direction fixed in local space (up-left of the nose) — the shading is
// painted into the hull, so it rotates with the ship like real plating.
const LIGHT_LEN = Math.hypot(-0.34, 0.94);
const LIGHT_X = -0.34 / LIGHT_LEN;
const LIGHT_Y = 0.94 / LIGHT_LEN;

/**
 * Fully-rendered ship hull: per-edge faceted lambert shading (faux-metallic beveled
 * plating) + dark intake cap on the open nose + neon trim + glass canopy with a
 * specular dot. Deliberately more "real" than the wireframe enemies.
 */
export function drawShip(
  renderer: Renderer,
  px: number, py: number,
  angle: number, scale: number,
  pal: ShipPalette,
): void {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const n = SHIP_VERTS.length;

  const wx: number[] = [];
  const wy: number[] = [];
  for (const [lx, ly] of SHIP_VERTS) {
    wx.push(px + (lx * cos - ly * sin) * scale);
    wy.push(py + (lx * sin + ly * cos) * scale);
  }

  // Centroids (world + local, the local one for outward-normal tests)
  let cx = 0, cy = 0, lcx = 0, lcy = 0;
  for (let i = 0; i < n; i++) { cx += wx[i]; cy += wy[i]; lcx += SHIP_VERTS[i][0]; lcy += SHIP_VERTS[i][1]; }
  cx /= n; cy /= n; lcx /= n; lcy /= n;

  // Faceted hull — one lambert-shaded triangle per edge segment
  const segs = SHIP_OPEN_NOSE ? n - 1 : n;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const [ax, ay] = SHIP_VERTS[i];
    const [bx, by] = SHIP_VERTS[j];
    const ex = bx - ax, ey = by - ay;
    const el = Math.hypot(ex, ey) || 1;
    let nx = -ey / el, ny = ex / el;
    const mx = (ax + bx) / 2 - lcx, my = (ay + by) / 2 - lcy;
    if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
    const lam = nx * LIGHT_X + ny * LIGHT_Y; // [-1, 1]
    const t = Math.abs(lam);
    const tgt = lam >= 0 ? pal.hullLight : pal.hullDark;
    renderer.drawTriangle(
      cx, cy, wx[i], wy[i], wx[j], wy[j],
      pal.hull[0] + (tgt[0] - pal.hull[0]) * t,
      pal.hull[1] + (tgt[1] - pal.hull[1]) * t,
      pal.hull[2] + (tgt[2] - pal.hull[2]) * t,
      pal.hullAlpha,
    );
  }
  // Open nose: cap the missing wedge dark, like an intake between the blades
  if (SHIP_OPEN_NOSE) {
    renderer.drawTriangle(
      cx, cy, wx[n - 1], wy[n - 1], wx[0], wy[0],
      pal.hullDark[0], pal.hullDark[1], pal.hullDark[2], pal.hullAlpha * 0.9,
    );
  }

  // Neon trim — dark then bright, open nose leaves the gap
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    renderer.drawLine(wx[i], wy[i], wx[j], wy[j], pal.line2[0], pal.line2[1], pal.line2[2]);
  }
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    renderer.drawLine(wx[i], wy[i], wx[j], wy[j], pal.line[0], pal.line[1], pal.line[2]);
  }

  // Glass canopy — bright dome with a specular dot offset toward the light
  const [kax, kay, kar] = SHIP_CANOPY;
  const kx = px + (kax * cos - kay * sin) * scale;
  const ky = py + (kax * sin + kay * cos) * scale;
  const kr = kar * scale;
  renderer.drawFilledCircle(kx, ky, kr, [0.82, 0.92, 1.0], 14, 0.5 * pal.hullAlpha);
  const wlx = LIGHT_X * cos - LIGHT_Y * sin;
  const wly = LIGHT_X * sin + LIGHT_Y * cos;
  renderer.drawFilledCircle(kx + wlx * kr * 0.4, ky + wly * kr * 0.4, kr * 0.3, [1, 1, 1], 10, 0.6 * pal.hullAlpha);
}
