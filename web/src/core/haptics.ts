/**
 * Game haptics using navigator.vibrate directly.
 *
 * The web-haptics library hid its iOS checkbox-switch element with
 * display:none which prevented it from firing, and its PWM intensity
 * simulation made short Android pulses imperceptible. Direct vibrate
 * calls are simpler and more reliable on Android / Chrome.
 *
 * iOS Safari does not support the Vibration API at all — there is no
 * reliable web-only haptics path for iOS, so calls silently no-op.
 */

const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

function vibrate(pattern: number | number[]): void {
  if (supported) navigator.vibrate(pattern);
}

export class HapticsManager {
  /** BlackHole supernova — escalating dramatic pattern */
  supernova(): void {
    vibrate([100, 30, 150, 40, 200]);
  }
}
