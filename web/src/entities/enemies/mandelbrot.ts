import { Enemy, EnemyDeathResult } from './enemy';
import { Vec2 } from '../../core/vector';
import type { Renderer } from '../../renderer/sprite-batch';
import {
  COLORS,
  MINIBOSS_HP, MINIBOSS_SCORE, MINIBOSS_COLLISION_RADIUS,
  MINIBOSS_STAGE_THRESHOLDS,
  MINIBOSS_SPAWN_INTERVAL, MINIBOSS_MAX_MINIONS, MINIBOSS_SPEED,
  MINIBOSS_BUD_REGROW_TIME,
} from '../../config';

/** Mandelbrot cardioid — signature miniboss with 3 HP stages */
export class Mandelbrot extends Enemy {
  isMiniboss = true;
  override family = 'mandelbrot' as const;
  override separationWeight = 0.25; // miniboss resists separation pushes
  activeMinions = 0;
  private minionSpawnTimer = 0;
  private budTimers: number[] = [0, 0, 0, 0, -2, -2, -2, -2]; // 4 active buds in stage 1, -2 = locked
  private hitFlash = 0;
  private tendrilPhase = 0;
  private stageTransitionFlash = 0;
  private _currentStage = 1;
  private _prevStage = 1;
  private crackAngles: number[] = [];
  /** Pending minion spawns for game.ts to process */
  pendingMinions: Vec2[] = [];

  constructor() {
    super();
    this.gravityImmune = true;
    this.bossFeedback = true; // shared Boss Damage Feedback (spark/tick/milestones + heat body)
    this.color = COLORS.mandelbrot.color;
    this.color2 = COLORS.mandelbrot.color2;
    this.speed = MINIBOSS_SPEED[0];
    this.scoreValue = MINIBOSS_SCORE;
    this.hp = MINIBOSS_HP;
    this.maxHp = MINIBOSS_HP;
    this.collisionRadius = MINIBOSS_COLLISION_RADIUS;
    this.spawnDuration = this.spawnTimer = 2.5; // longer spawn animation for boss

    // Cardioid shape with fine detail: r = 1 - cos(theta)
    this.shapePoints = [];
    for (let i = 0; i < 40; i++) {
      const theta = (i / 40) * Math.PI * 2;
      const r = (1 - Math.cos(theta)) * 28;
      this.shapePoints.push([Math.cos(theta) * r, Math.sin(theta) * r]);
    }
  }

  get stage(): number { return this._currentStage; }

  /** Returns true if a stage transition happened since last check */
  checkStageTransition(): boolean {
    if (this._currentStage !== this._prevStage) {
      this._prevStage = this._currentStage;
      return true;
    }
    return false;
  }

  hit(): boolean {
    this.hitFlash = 0.2;
    const prevStage = this._currentStage;
    const dead = super.hit();

    // Check stage transitions
    if (!dead) {
      if (this.hp <= MINIBOSS_STAGE_THRESHOLDS[1] && prevStage < 3) {
        this.transitionToStage(3);
      } else if (this.hp <= MINIBOSS_STAGE_THRESHOLDS[0] && prevStage < 2) {
        this.transitionToStage(2);
      }
    }

    // Add visual crack at random angle on each hit
    this.crackAngles.push(Math.random() * Math.PI * 2);

    return dead;
  }

  private transitionToStage(stage: number): void {
    this._currentStage = stage;
    this.stageTransitionFlash = 0.5;
    this.speed = MINIBOSS_SPEED[stage - 1];

    // Unlock additional buds
    const budCount = this.getActiveBudCount();
    for (let i = 0; i < budCount; i++) {
      if (this.budTimers[i] === -2) this.budTimers[i] = 0; // unlock
    }
  }

  /** Called by game.ts when a MiniMandel child dies */
  onMinionDeath(): void {
    this.activeMinions = Math.max(0, this.activeMinions - 1);
    // Regrow a used bud
    const budCount = this.getActiveBudCount();
    for (let i = 0; i < budCount; i++) {
      if (this.budTimers[i] === -1) { // -1 = used
        this.budTimers[i] = MINIBOSS_BUD_REGROW_TIME;
        break;
      }
    }
  }

  private getActiveBudCount(): number {
    return this._currentStage === 1 ? 4 : this._currentStage === 2 ? 6 : 8;
  }

  private getMinionInterval(): number {
    return MINIBOSS_SPAWN_INTERVAL[this._currentStage - 1];
  }

  private getMaxMinions(): number {
    return MINIBOSS_MAX_MINIONS[this._currentStage - 1];
  }

  update(dt: number, playerPos?: Vec2): void {
    if (!this.active) return;
    if (this.hitFlash > 0) this.hitFlash -= dt / 1000;
    if (this.stageTransitionFlash > 0) this.stageTransitionFlash -= dt / 1000;
    this.tendrilPhase += dt * 0.002;

    // Drift toward player
    if (playerPos) {
      this.follow(playerPos);
    }
    this.move(dt);
    this.bounce();

    // Tick bud regrow timers
    const budCount = this.getActiveBudCount();
    for (let i = 0; i < budCount; i++) {
      if (this.budTimers[i] > 0) {
        this.budTimers[i] -= dt / 1000;
        if (this.budTimers[i] <= 0) this.budTimers[i] = 0; // ready
      }
    }

    // Spawn minions
    this.minionSpawnTimer -= dt / 1000;
    if (this.minionSpawnTimer <= 0 && this.activeMinions < this.getMaxMinions()) {
      this.minionSpawnTimer = this.getMinionInterval();

      // Find a ready bud
      for (let i = 0; i < budCount; i++) {
        if (this.budTimers[i] === 0) {
          this.budTimers[i] = -1; // mark as used
          this.activeMinions++;
          const angle = (i / budCount) * Math.PI * 2;
          const budDist = this.collisionRadius + 20;
          const budPos = new Vec2(
            this.position.x + Math.cos(angle) * budDist,
            this.position.y + Math.sin(angle) * budDist,
          );
          this.pendingMinions.push(budPos);
          break;
        }
      }
    }
  }

  override renderSpawn(renderer: Renderer): void {
    this.renderSpawnGravity(renderer);
  }

  render(renderer: Renderer): void {
    if (!this.active) return;
    if (this.isSpawning) { this.renderSpawn(renderer); return; }

    // Diegetic damage: the cardioid trembles harder + glows hotter toward death.
    const [shx, shy] = this.damageShudder(this.tendrilPhase * 0.5);
    const px = this.position.x + shx;
    const py = this.position.y + shy;
    const isHit = this.hitFlash > 0;
    const isTransition = this.stageTransitionFlash > 0;
    const drawColor: [number, number, number] = isHit ? [1, 1, 1]
      : isTransition ? [1, 0.5, 0.2] : this.damageHeatColor(this.color);

    // Double-line cardioid for thickness (shuddering with damage)
    const points = this.getWorldPoints().map(([x, y]) => [x + shx, y + shy]);
    renderer.drawLineLoop(points.map(([x, y]) => [x - 1.5, y]), this.color2);
    renderer.drawLineLoop(points.map(([x, y]) => [x + 0.5, y - 0.5]), this.color2, 0.4);
    renderer.drawLineLoop(points, drawColor);

    // Period-2 bulb
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    const bulbX = px + (-35) * cos;
    const bulbY = py + (-35) * sin;
    renderer.drawCircle(bulbX, bulbY, 12, drawColor, 16, 0.8);
    renderer.drawCircle(bulbX, bulbY, 14, this.color2, 16, 0.3);

    // Fractal tendrils — escalate with stage
    const tendrilCount = 6 + this._currentStage * 3;
    const tendrilBase = 15 + this._currentStage * 5;
    for (let i = 0; i < tendrilCount; i++) {
      const angle = (i / tendrilCount) * Math.PI * 2;
      const wobble = Math.sin(this.tendrilPhase + i * 1.2) * (8 + this._currentStage * 3);
      const tendrilLen = tendrilBase + wobble;
      const tx = px + Math.cos(angle) * (this.collisionRadius + tendrilLen);
      const ty = py + Math.sin(angle) * (this.collisionRadius + tendrilLen);
      const bx = px + Math.cos(angle) * this.collisionRadius;
      const by = py + Math.sin(angle) * this.collisionRadius;
      const alpha = 0.3 + this._currentStage * 0.1;
      renderer.drawLine(bx, by, tx, ty, this.color[0], this.color[1], this.color[2], alpha);
      // Bright tips in stage 3
      if (this._currentStage >= 3) {
        renderer.drawLine(tx - 3, ty - 3, tx + 3, ty + 3, 1, 0.5, 0.2, 0.4);
      }
    }

    // Bud indicators
    const budCount = this.getActiveBudCount();
    for (let i = 0; i < budCount; i++) {
      const angle = (i / budCount) * Math.PI * 2;
      const bx = px + Math.cos(angle) * (this.collisionRadius + 18);
      const by = py + Math.sin(angle) * (this.collisionRadius + 18);

      if (this.budTimers[i] === 0) {
        // Ready — bright glow
        renderer.drawCircle(bx, by, 6, this.color, 10, 0.9);
        renderer.drawCircle(bx, by, 8, [1, 0.3, 0.3], 10, 0.3);
      } else if (this.budTimers[i] > 0) {
        // Regrowing — dim progress
        const progress = 1 - this.budTimers[i] / MINIBOSS_BUD_REGROW_TIME;
        renderer.drawCircle(bx, by, 6 * progress, this.color2, 8, 0.4);
      }
      // -1 = used (no visual), -2 = locked (no visual)
    }

    // Interior pulse — intensifies per stage
    const pulseSpeed = 1.5 + this._currentStage * 0.5;
    const pulseBase = 0.2 + this._currentStage * 0.05;
    const pulse = pulseBase + Math.sin(this.tendrilPhase * pulseSpeed) * 0.1;
    renderer.drawFilledCircle(px, py, 22,
      [this.color[0] * pulse, this.color[1] * pulse * 0.3, this.color[2] * pulse * 0.3], 20, 0.6);

    // Crack lines (accumulate from hits)
    for (let i = 0; i < this.crackAngles.length; i++) {
      const angle = this.crackAngles[i];
      const len = 20 + (i % 3) * 10;
      const cx = px + Math.cos(angle) * 10;
      const cy = py + Math.sin(angle) * 10;
      const ex = px + Math.cos(angle) * len;
      const ey = py + Math.sin(angle) * len;
      renderer.drawLine(cx, cy, ex, ey, 1, 0.4, 0.1, 0.5);
    }

    // Stage transition aura
    if (this.stageTransitionFlash > 0) {
      const t = this.stageTransitionFlash / 0.5;
      const auraR = this.collisionRadius + 30 * (1 - t);
      renderer.drawCircle(px, py, auraR, [1, 0.5, 0.2], 32, t * 0.6);
    }
  }

  renderGlow(renderer: Renderer, time: number): void {
    if (!this.active) return;
    this.render(renderer);
    const pulse = 0.2 + Math.sin(time * 1.5) * 0.1;
    renderer.drawCircle(this.position.x, this.position.y, this.collisionRadius + 15,
      [this.color[0] * pulse, this.color[1] * pulse, this.color[2] * pulse], 28);
  }

  onDeath(): EnemyDeathResult {
    return {};
  }
}
