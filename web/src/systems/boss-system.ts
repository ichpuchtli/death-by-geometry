import { SpringMassGrid } from '../renderer/grid';
import { Camera } from '../core/camera';
import { AudioManager } from '../core/audio';
import { Player } from '../entities/player';
import { Enemy } from '../entities/enemies/enemy';
import { Mandelbrot } from '../entities/enemies/mandelbrot';
import { MiniMandel } from '../entities/enemies/minimandel';
import { LifecycleSystem } from './lifecycle-system';
import { WaveManager } from '../spawner/wave-manager';
import { createEnemy } from '../spawner/enemy-factory';
import { EnemyType } from '../spawner/spawn-patterns';
import { Vec2 } from '../core/vector';
import { HUD } from '../ui/hud';
import { gameSettings } from '../settings';
import {
  SCREEN_SHAKE_LARGE,
  MINIBOSS_HITSTOP_STAGE,
  MINIBOSS_SPAWN_TIME,
  MINIBOSS_WARNING_DURATION,
  MINIBOSS_RESPAWN_DELAY,
  MINIBOSS_DEFEATED_BANNER_DURATION,
  MINIBOSS_SPAWN_SUPPRESS_MULT,
  SIERPINSKI_BOSS_SPAWN_TIME,
  SIERPINSKI_BOSS_WARNING_DURATION,
  SIERPINSKI_BOSS_RESPAWN_DELAY,
  SIERPINSKI_BOSS_DEFEATED_BANNER_DURATION,
  SIERPINSKI_BOSS_SPAWN_SUPPRESS_MULT,
} from '../config';

export interface BossSystemDeps {
  player: Player;
  enemies: Enemy[];
  lifecycle: LifecycleSystem;
  grid: SpringMassGrid;
  camera: Camera;
  audio: AudioManager;
  waveManager: WaveManager;
  hud: HUD;
  /** Trigger the warning border pulse for `durationMs`. */
  onWarning: (durationMs: number) => void;
  /** Request `ms` of hitstop (e.g. on a stage break). */
  requestHitstop: (ms: number) => void;
}

interface BossEncounterConfig {
  enemyType: EnemyType;
  hpLabel: string;
  spawnTime: number;             // seconds (waveManager.elapsedTime)
  warningDuration: number;       // ms
  respawnDelay: number;          // ms after player death
  defeatedBannerDuration: number;// ms
  spawnSuppressMult: number;     // wave spawn-rate multiplier during fight
  spawnImpulse: { force: number; radius: number };
  /** HP-bar stage indicator. */
  getStage: (boss: Enemy) => number;
  /** Optional per-frame active-phase behavior (minions, stage transitions). */
  onActiveUpdate?: (boss: Enemy) => void;
}

/** Shared interface the encounter uses to suppress/restore the wave spawn rate. */
interface SpawnRateControl {
  suppress: (mult: number) => void;
  restore: () => void;
}

/**
 * Generic boss-encounter state machine: idle → (time trigger) → warning →
 * spawn → active → defeated (or shockwave-killed → respawn timer → warning).
 * Configured per-boss; Mandelbrot supplies an active-phase hook for minions
 * and stage transitions, Sierpinski has none.
 */
class BossEncounter {
  active = false;
  defeated = false;
  warningTimer = 0;
  defeatedBannerTimer = 0;
  respawnTimer = 0;
  ref: Enemy | null = null;

  constructor(
    private cfg: BossEncounterConfig,
    private deps: BossSystemDeps,
    private spawnRate: SpawnRateControl,
  ) {}

  update(dt: number): void {
    if (this.defeatedBannerTimer > 0) this.defeatedBannerTimer -= dt;

    // Re-spawn timer (player died during boss fight)
    if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.startWarning();
    }

    // Time-based trigger
    if (!this.defeated && !this.active && this.warningTimer <= 0
        && this.respawnTimer <= 0
        && this.deps.waveManager.elapsedTime >= this.cfg.spawnTime) {
      this.startWarning();
    }

    // Warning countdown → spawn
    if (this.warningTimer > 0) {
      this.warningTimer -= dt;
      if (this.warningTimer <= 0) this.spawn();
      return;
    }

    // Active phase (boss-specific behavior)
    if (this.active && this.ref && this.ref.active) {
      this.cfg.onActiveUpdate?.(this.ref);
    }

    // Boss died outside the normal kill flow (e.g. player-death shockwave)
    if (this.active && this.ref && !this.ref.active && !this.defeated) {
      this.active = false;
      this.ref = null;
      this.spawnRate.restore();
      this.respawnTimer = this.cfg.respawnDelay;
    }
  }

  private startWarning(): void {
    this.warningTimer = this.cfg.warningDuration;
    this.deps.audio.playMinibossWarning();
    this.deps.onWarning(this.cfg.warningDuration);
  }

  private spawn(): void {
    this.active = true;
    const hw = gameSettings.arenaWidth / 2;
    const hh = gameSettings.arenaHeight / 2;
    const px = this.deps.player.position.x;
    const py = this.deps.player.position.y;
    // Spawn on the far side of the arena from the player
    const spawnX = px > 0 ? -hw * 0.4 : hw * 0.4;
    const spawnY = py > 0 ? -hh * 0.4 : hh * 0.4;

    const boss = createEnemy(this.cfg.enemyType, new Vec2(spawnX, spawnY));
    this.deps.lifecycle.spawnEnemy(boss);
    this.deps.enemies.push(boss);
    this.ref = boss;

    // Suppress normal spawning during fight
    this.spawnRate.suppress(this.cfg.spawnSuppressMult);

    this.deps.audio.playMinibossArrive();
    this.deps.grid.applyImpulse(spawnX, spawnY, this.cfg.spawnImpulse.force, this.cfg.spawnImpulse.radius);
    this.deps.camera.shake(SCREEN_SHAKE_LARGE);
  }

  /** Called from the normal kill flow (CombatSystem) when this boss is defeated. */
  onDefeated(): void {
    this.active = false;
    this.defeated = true;
    this.defeatedBannerTimer = this.cfg.defeatedBannerDuration;
    this.ref = null;
    this.spawnRate.restore();
  }

  renderHud(hud: HUD): void {
    if (this.warningTimer > 0) {
      hud.drawMinibossWarning(1 - this.warningTimer / this.cfg.warningDuration);
    }
    if (this.active && this.ref && this.ref.active) {
      hud.drawMinibossHP(this.cfg.hpLabel, this.ref.hp, this.ref.maxHp, this.cfg.getStage(this.ref));
    }
    if (this.defeatedBannerTimer > 0) {
      hud.drawMinibossDefeatedBanner(1 - this.defeatedBannerTimer / this.cfg.defeatedBannerDuration);
    }
  }

  reset(): void {
    this.active = false;
    this.defeated = false;
    this.warningTimer = 0;
    this.defeatedBannerTimer = 0;
    this.respawnTimer = 0;
    this.ref = null;
  }
}

/**
 * Owns both boss encounters (Sierpinski + Mandelbrot) built from the shared
 * generic template, plus the single saved spawn-rate multiplier they share.
 */
export class BossSystem {
  private deps: BossSystemDeps;
  private savedSpawnRateMultiplier = 1.0;
  private sierpinski: BossEncounter;
  private mandelbrot: BossEncounter;

  constructor(deps: BossSystemDeps) {
    this.deps = deps;

    const spawnRate: SpawnRateControl = {
      suppress: (mult: number) => {
        this.savedSpawnRateMultiplier = deps.waveManager.spawnRateMultiplier;
        deps.waveManager.spawnRateMultiplier = mult;
      },
      restore: () => {
        deps.waveManager.spawnRateMultiplier = this.savedSpawnRateMultiplier;
      },
    };

    this.sierpinski = new BossEncounter({
      enemyType: 'sierpinski',
      hpLabel: 'SIERPINSKI',
      spawnTime: SIERPINSKI_BOSS_SPAWN_TIME,
      warningDuration: SIERPINSKI_BOSS_WARNING_DURATION,
      respawnDelay: SIERPINSKI_BOSS_RESPAWN_DELAY,
      defeatedBannerDuration: SIERPINSKI_BOSS_DEFEATED_BANNER_DURATION,
      spawnSuppressMult: SIERPINSKI_BOSS_SPAWN_SUPPRESS_MULT,
      spawnImpulse: { force: 600, radius: 300 },
      getStage: () => 1,
    }, deps, spawnRate);

    this.mandelbrot = new BossEncounter({
      enemyType: 'mandelbrot',
      hpLabel: 'MANDELBROT',
      spawnTime: MINIBOSS_SPAWN_TIME,
      warningDuration: MINIBOSS_WARNING_DURATION,
      respawnDelay: MINIBOSS_RESPAWN_DELAY,
      defeatedBannerDuration: MINIBOSS_DEFEATED_BANNER_DURATION,
      spawnSuppressMult: MINIBOSS_SPAWN_SUPPRESS_MULT,
      spawnImpulse: { force: 800, radius: 400 },
      getStage: (boss) => (boss as Mandelbrot).stage,
      onActiveUpdate: (boss) => this.updateMandelbrotActive(boss as Mandelbrot),
    }, deps, spawnRate);
  }

  /** Mandelbrot active-phase: spawn pending minions + handle stage transitions. */
  private updateMandelbrotActive(boss: Mandelbrot): void {
    while (boss.pendingMinions.length > 0) {
      const minionPos = boss.pendingMinions.shift()!;
      const mm = new MiniMandel(minionPos);
      mm.parent = boss;
      mm.speed *= gameSettings.enemySpeedMultiplier;
      this.deps.lifecycle.spawnEnemy(mm);
      this.deps.enemies.push(mm);
      this.deps.grid.applyImpulse(minionPos.x, minionPos.y, 60, 80);
    }

    if (boss.checkStageTransition()) {
      this.deps.audio.playMinibossStageBreak();
      this.deps.requestHitstop(MINIBOSS_HITSTOP_STAGE);
      this.deps.camera.shake(SCREEN_SHAKE_LARGE);
      this.deps.grid.applyImpulse(boss.position.x, boss.position.y, 600, 300);
    }
  }

  update(dt: number): void {
    this.sierpinski.update(dt);
    this.mandelbrot.update(dt);
  }

  renderHud(hud: HUD): void {
    this.sierpinski.renderHud(hud);
    this.mandelbrot.renderHud(hud);
  }

  reset(): void {
    this.savedSpawnRateMultiplier = 1.0;
    this.sierpinski.reset();
    this.mandelbrot.reset();
  }

  /** Called by CombatSystem when the Sierpinski boss (tier 0) is killed. */
  onSierpinskiDefeated(): void { this.sierpinski.onDefeated(); }

  /** Called by CombatSystem when the Mandelbrot miniboss is killed. */
  onMandelbrotDefeated(): void { this.mandelbrot.onDefeated(); }
}
