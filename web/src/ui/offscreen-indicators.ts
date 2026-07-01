import type { Renderer } from '../renderer/sprite-batch';
import type { Camera } from '../core/camera';
import { Enemy } from '../entities/enemies/enemy';
import { OFFSCREEN_INDICATOR_RANGE } from '../config';

const INDICATOR_MARGIN = 30;
const INDICATOR_SIZE = 8;

export function renderOffscreenIndicators(
  renderer: Renderer,
  camera: Camera,
  enemies: Enemy[],
): void {
  const cx = camera.position.x;
  const cy = camera.position.y;
  const halfW = camera.viewportWidth / 2 - INDICATOR_MARGIN;
  const halfH = camera.viewportHeight / 2 - INDICATOR_MARGIN;

  const entities: { x: number; y: number; color: [number, number, number] }[] = [];
  for (const e of enemies) {
    if (!e.active) continue;
    if (!camera.isVisible(e.position.x, e.position.y, 0)) {
      const dist = Math.sqrt(
        (e.position.x - cx) ** 2 + (e.position.y - cy) ** 2,
      );
      if (dist < OFFSCREEN_INDICATOR_RANGE) {
        entities.push({ x: e.position.x, y: e.position.y, color: e.color });
      }
    }
  }

  for (const e of entities) {
    // Direction from camera center to entity
    let dx = e.x - cx;
    let dy = e.y - cy;

    // Clamp to viewport edge
    const scaleX = halfW / Math.max(Math.abs(dx), 1);
    const scaleY = halfH / Math.max(Math.abs(dy), 1);
    const scale = Math.min(scaleX, scaleY);
    const ix = cx + dx * scale;
    const iy = cy + dy * scale;

    // Calculate distance-based alpha
    const dist = Math.sqrt(dx * dx + dy * dy);
    const alpha = Math.max(0.2, 1 - dist / OFFSCREEN_INDICATOR_RANGE);

    // Draw a small chevron pointing toward the enemy
    const angle = Math.atan2(dy, dx);
    const s = INDICATOR_SIZE;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const tipX = ix + cos * s;
    const tipY = iy + sin * s;
    const l1X = ix - cos * s * 0.5 - sin * s * 0.7;
    const l1Y = iy - sin * s * 0.5 + cos * s * 0.7;
    const l2X = ix - cos * s * 0.5 + sin * s * 0.7;
    const l2Y = iy - sin * s * 0.5 - cos * s * 0.7;

    const [r, g, b] = e.color;
    renderer.drawLine(tipX, tipY, l1X, l1Y, r, g, b, alpha);
    renderer.drawLine(tipX, tipY, l2X, l2Y, r, g, b, alpha);
  }
}
