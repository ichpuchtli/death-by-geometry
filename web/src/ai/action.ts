/**
 * Decodes a policy's raw output vector into a twin-stick action. Shared by the trainer
 * (writes into ScriptedInput) and the browser bot (writes into Input's bot override).
 */

export const ACTION_SIZE = 4; // [moveX, moveY, aimX, aimY]

export interface Action {
  moveX: number;   // -1..1, magnitude scales movement speed (like an analog stick)
  moveY: number;
  aimAngle: number; // radians
  fire: boolean;
}

const MOVE_DEADZONE = 0.15;

export function decodeAction(out: Float32Array): Action {
  let mx = out[0];
  let my = out[1];
  const m = Math.hypot(mx, my);
  if (m < MOVE_DEADZONE) {
    mx = 0;
    my = 0;
  } else if (m > 1) {
    mx /= m; // clamp to the unit disk (max speed), preserving direction
    my /= m;
  }
  const aimAngle = Math.atan2(out[3], out[2]);
  return { moveX: mx, moveY: my, aimAngle, fire: true };
}
