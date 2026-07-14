import { Vec2 } from './vector';
import type { Camera } from './camera';
import { JOYSTICK_MAX_RADIUS, JOYSTICK_DEAD_ZONE, TIME_BUTTON_BOTTOM, TIME_BUTTON_RADIUS, TIME_BUTTON_RIGHT } from '../config';

export type InputMode = 'keyboard' | 'touch';

/**
 * Minimal input surface the Player depends on. Implemented by the real DOM-backed
 * `Input` and by the headless `ScriptedInput` used for the AI digital twin, so the
 * exact same Player/entity code runs in the browser and in the Node training sim.
 */
export interface InputSource {
  getMovementDir(): Vec2;
  updateAimFromPlayer(playerPos: Vec2): void;
  getAimAngle(): number;
  isMouseDown(): boolean;
  isTimeDilationHeld(): boolean;
}

interface TouchStick {
  active: boolean;
  touchId: number;
  origin: Vec2;   // where touch started
  current: Vec2;  // where finger is now
}

export class Input implements InputSource {
  private keys = new Map<string, boolean>();
  private mouseDown = false;
  private camera: Camera | null = null;
  autoFire = false;

  // AI bot override: when botControl is true, the AI agent drives movement/aim/fire
  // directly (set each frame by the Bot controller) and human keyboard/mouse is ignored.
  botControl = false;
  botMove = new Vec2(0, 0);
  botAimAngle = 0;
  botFire = false;

  // Mouse position aim (desktop) — screen CSS coordinates
  private mouseScreenX = 0;
  private mouseScreenY = 0;
  private _aimAngle = 0;

  // Touch state
  mode: InputMode = 'keyboard';
  private leftStick: TouchStick = { active: false, touchId: -1, origin: new Vec2(), current: new Vec2() };
  private rightStick: TouchStick = { active: false, touchId: -1, origin: new Vec2(), current: new Vec2() };
  private timeTouchId = -1;
  private canvasWidth = 0;
  private canvasHeight = 0;
  private zoom = 1;

  // Expose stick positions for joystick rendering
  get leftStickState() { return this.leftStick; }
  get rightStickState() { return this.rightStick; }
  get timeButtonPressed() { return this.timeTouchId >= 0 || (!this.botControl && this.isKeyDown('Space')); }
  get timeButtonCenter() { return { x: this.canvasWidth - TIME_BUTTON_RIGHT, y: this.canvasHeight - TIME_BUTTON_BOTTOM }; }

  constructor(private canvas: HTMLCanvasElement) {
    this.canvasWidth = canvas.clientWidth;
    this.canvasHeight = canvas.clientHeight;

    // Keyboard
    window.addEventListener('keydown', (e) => {
      this.keys.set(e.code, true);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      this.mode = 'keyboard';
    });
    window.addEventListener('keyup', (e) => {
      this.keys.set(e.code, false);
    });

    // Mouse — track absolute position for aim direction
    canvas.addEventListener('mousemove', (e) => {
      this.mode = 'keyboard';
      this.mouseScreenX = e.clientX;
      this.mouseScreenY = e.clientY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseDown = true;
      this.mode = 'keyboard';
    });
    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Touch
    canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    canvas.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
  }

  private onTouchStart(e: TouchEvent): void {
    e.preventDefault();
    this.mode = 'touch';
    const half = this.canvasWidth / 2;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const tc = this.timeButtonCenter;
      if (this.timeTouchId < 0 && Math.hypot(t.clientX - tc.x, t.clientY - tc.y) <= TIME_BUTTON_RADIUS * 1.25) {
        this.timeTouchId = t.identifier;
        continue;
      }
      const stick = t.clientX < half ? this.leftStick : this.rightStick;
      if (!stick.active) {
        stick.active = true;
        stick.touchId = t.identifier;
        stick.origin.set(t.clientX, t.clientY);
        stick.current.set(t.clientX, t.clientY);
      }
    }
  }

  private onTouchMove(e: TouchEvent): void {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (this.timeTouchId === t.identifier) continue;
      if (this.leftStick.active && this.leftStick.touchId === t.identifier) {
        this.leftStick.current.set(t.clientX, t.clientY);
      }
      if (this.rightStick.active && this.rightStick.touchId === t.identifier) {
        this.rightStick.current.set(t.clientX, t.clientY);
      }
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (this.timeTouchId === t.identifier) {
        this.timeTouchId = -1;
        continue;
      }
      if (this.leftStick.active && this.leftStick.touchId === t.identifier) {
        this.leftStick.active = false;
        this.leftStick.touchId = -1;
      }
      if (this.rightStick.active && this.rightStick.touchId === t.identifier) {
        this.rightStick.active = false;
        this.rightStick.touchId = -1;
      }
    }
  }

  /** Get normalized joystick vector with dead zone applied */
  private getStickVector(stick: TouchStick): Vec2 {
    if (!stick.active) return new Vec2(0, 0);
    const dx = stick.current.x - stick.origin.x;
    const dy = stick.current.y - stick.origin.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxR = JOYSTICK_MAX_RADIUS;
    if (dist < maxR * JOYSTICK_DEAD_ZONE) return new Vec2(0, 0);
    const clamped = Math.min(dist, maxR);
    const mag = (clamped - maxR * JOYSTICK_DEAD_ZONE) / (maxR * (1 - JOYSTICK_DEAD_ZONE));
    return new Vec2(dx / dist * mag, dy / dist * mag);
  }

  setCamera(camera: Camera): void {
    this.camera = camera;
  }

  updateCanvasSize(w: number): void {
    this.canvasWidth = w;
    this.canvasHeight = this.canvas.clientHeight;
  }

  setZoom(z: number): void {
    this.zoom = z;
  }

  isKeyDown(code: string): boolean {
    return this.keys.get(code) === true;
  }

  isMouseDown(): boolean {
    if (this.botControl) return this.botFire;
    if (this.mode === 'touch') {
      const rv = this.getStickVector(this.rightStick);
      return rv.magnitudeSq() > 0;
    }
    return this.mouseDown || this.autoFire;
  }

  isTimeDilationHeld(): boolean {
    if (this.botControl) return false;
    return this.isKeyDown('Space') || this.timeTouchId >= 0;
  }

  releaseTimeDilationAction(): void {
    this.keys.set('Space', false);
    this.timeTouchId = -1;
  }

  isTouchActive(): boolean {
    return this.mode === 'touch';
  }

  /** Convert mouse screen CSS coords to world position */
  getMouseWorldPos(): Vec2 {
    const camX = this.camera ? this.camera.position.x : 0;
    const camY = this.camera ? this.camera.position.y : 0;
    const wx = (this.mouseScreenX - this.canvasWidth / 2) / this.zoom + camX;
    const wy = -(this.mouseScreenY - this.canvasHeight / 2) / this.zoom + camY;
    return new Vec2(wx, wy);
  }

  /** Update aim angle from player position toward mouse cursor world position.
   *  Called each frame from Player.update(). */
  updateAimFromPlayer(playerPos: Vec2): void {
    if (this.botControl) { this._aimAngle = this.botAimAngle; return; }
    if (this.mode !== 'keyboard') return;
    const mouseWorld = this.getMouseWorldPos();
    const dx = mouseWorld.x - playerPos.x;
    const dy = mouseWorld.y - playerPos.y;
    if (dx * dx + dy * dy > 1) {
      this._aimAngle = Math.atan2(dy, dx);
    }
  }

  /** Get the current aim angle (radians). Desktop: mouse direction. Touch: from right stick. */
  getAimAngle(): number {
    if (this.mode === 'touch') {
      const rv = this.getStickVector(this.rightStick);
      if (rv.magnitudeSq() > 0) {
        // Right stick direction — screen Y inverted to world Y
        return Math.atan2(-rv.y, rv.x);
      }
      return this._aimAngle; // fallback to last known angle
    }
    return this._aimAngle;
  }

  /** Set the aim angle (used on player reset) */
  setAimAngle(angle: number): void {
    this._aimAngle = angle;
  }

  /** Get movement direction from WASD / arrow keys / left joystick */
  getMovementDir(): Vec2 {
    if (this.botControl) return this.botMove.clone();
    if (this.mode === 'touch') {
      const v = this.getStickVector(this.leftStick);
      // Invert Y because screen Y is down but world Y is up
      return new Vec2(v.x, -v.y);
    }
    const dir = new Vec2(0, 0);
    if (this.isKeyDown('KeyW') || this.isKeyDown('ArrowUp')) dir.y = 1;
    if (this.isKeyDown('KeyS') || this.isKeyDown('ArrowDown')) dir.y = -1;
    if (this.isKeyDown('KeyA') || this.isKeyDown('ArrowLeft')) dir.x = -1;
    if (this.isKeyDown('KeyD') || this.isKeyDown('ArrowRight')) dir.x = 1;
    if (dir.x !== 0 && dir.y !== 0) dir.normalizeMut();
    return dir;
  }

  /** Check if any touch is active (for starting game on mobile) */
  hasTouchTap(): boolean {
    return this.leftStick.active || this.rightStick.active;
  }
}
