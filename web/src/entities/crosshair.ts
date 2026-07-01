import type { Renderer } from '../renderer/sprite-batch';
import {
  CROSSHAIR_SIZE,
  CROSSHAIR_CHEVRON_SIZE,
  CROSSHAIR_COLOR,
  CROSSHAIR_ALPHA,
  CROSSHAIR_ROTATION_SPEED,
} from '../config';

/**
 * Crosshair: 4 inward-pointing chevrons at 0°/90°/180°/270° with slow rotation.
 * Desktop: rendered at mouse world position.
 * Touch: rendered near player at aim direction.
 */
export class AimIndicator {
  render(renderer: Renderer, worldX: number, worldY: number, time: number): void {
    const rotOffset = time * CROSSHAIR_ROTATION_SPEED;
    const [r, g, b] = CROSSHAIR_COLOR;
    const s = CROSSHAIR_CHEVRON_SIZE;

    // Draw 4 chevrons at cardinal angles, each pointing inward toward center
    for (let i = 0; i < 4; i++) {
      const baseAngle = (i * Math.PI) / 2 + rotOffset;
      // Chevron center position (on circle of radius CROSSHAIR_SIZE from crosshair center)
      const cx = worldX + Math.cos(baseAngle) * CROSSHAIR_SIZE;
      const cy = worldY + Math.sin(baseAngle) * CROSSHAIR_SIZE;

      // Chevron points inward: tip faces center, so rotation = baseAngle + PI
      const inwardAngle = baseAngle + Math.PI;
      const cos = Math.cos(inwardAngle);
      const sin = Math.sin(inwardAngle);

      // V-shape: tip at front, two arms swept back
      const tipX = cx + cos * s * 0.5;
      const tipY = cy + sin * s * 0.5;
      const arm1X = cx - cos * s * 0.5 + (-sin) * s * 0.4;
      const arm1Y = cy - sin * s * 0.5 + cos * s * 0.4;
      const arm2X = cx - cos * s * 0.5 - (-sin) * s * 0.4;
      const arm2Y = cy - sin * s * 0.5 - cos * s * 0.4;

      renderer.drawLine(arm1X, arm1Y, tipX, tipY, r, g, b, CROSSHAIR_ALPHA);
      renderer.drawLine(tipX, tipY, arm2X, arm2Y, r, g, b, CROSSHAIR_ALPHA);
    }
  }
}
