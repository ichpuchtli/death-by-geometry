import { Vec2 } from '../core/vector';
import type { InputSource } from '../core/input';
import type { Action } from '../ai/action';

/**
 * Headless input source that feeds a fixed action into the real `Player`. Set each tick
 * from the policy's decoded action; the exact same Player code then runs as in the browser.
 */
export class ScriptedInput implements InputSource {
  private moveDir = new Vec2(0, 0);
  private aimAngle = 0;
  private firing = true;

  setAction(a: Action): void {
    this.moveDir.set(a.moveX, a.moveY);
    this.aimAngle = a.aimAngle;
    this.firing = a.fire;
  }

  getMovementDir(): Vec2 {
    return this.moveDir.clone();
  }

  updateAimFromPlayer(_playerPos: Vec2): void {
    // aim is set directly via setAction — nothing to derive from a cursor
  }

  getAimAngle(): number {
    return this.aimAngle;
  }

  isMouseDown(): boolean {
    return this.firing;
  }
}
