import { Player } from '../entities/player';
import { BulletPool } from '../entities/bullet';
import { Enemy } from '../entities/enemies/enemy';
import { checkCollisions } from '../core/collision';
import { WaveManager } from '../spawner/wave-manager';
import { LifecycleSystem } from '../systems/lifecycle-system';
import { CombatSystem } from '../systems/combat-system';
import { SpawnSystem } from '../systems/spawn-system';
import { GravitySystem } from '../systems/gravity-system';
import { BossSystem } from '../systems/boss-system';
import { separateEnemies } from '../systems/separation';
import { RunStats } from '../core/run-stats';
import { DIFFICULTY_PHASES } from '../config';
import { gameSettings } from '../settings';
import { stubGrid, stubCamera, stubAudio, stubExplosions, stubHud } from './stubs';
import { ScriptedInput } from './scripted-input';
import type { Action } from '../ai/action';

/**
 * Headless "digital twin" of the game — the exact gameplay update loop from `game.ts`
 * with every renderer/audio/camera side effect stubbed out. Reuses the real Player,
 * enemy classes, bullet pool, collision, WaveManager, and all five gameplay systems, so
 * the dynamics match the live game closely enough for a trained policy to transfer.
 *
 * Designed for fast, allocation-light stepping so the CEM trainer can run millions of
 * ticks. Episodes default to a single life for a crisp survival signal.
 */
export class HeadlessGame {
  readonly input = new ScriptedInput();
  readonly player = new Player(this.input);
  readonly bullets = new BulletPool();
  readonly enemies: Enemy[] = [];

  private lifecycle = new LifecycleSystem(false);
  private waveManager = new WaveManager();
  private combat: CombatSystem;
  private spawn: SpawnSystem;
  private gravity: GravitySystem;
  private boss: BossSystem;

  private runStats: RunStats = freshStats();
  private hitstop = 0;
  gameTime = 0;
  alive = true;

  constructor() {
    const grid = stubGrid();
    const camera = stubCamera();
    const audio = stubAudio();
    const explosions = stubExplosions();
    const hud = stubHud();

    this.combat = new CombatSystem(false, {
      player: this.player, runStats: this.runStats, enemies: this.enemies,
      lifecycle: this.lifecycle, audio, explosions, grid, camera,
      onMinibossDefeated: () => this.boss.onMandelbrotDefeated(),
      onSierpinskiBossDefeated: () => this.boss.onSierpinskiDefeated(),
    });
    this.spawn = new SpawnSystem({
      player: this.player, enemies: this.enemies, lifecycle: this.lifecycle,
      audio, grid, waveManager: this.waveManager,
    });
    this.gravity = new GravitySystem(false, {
      player: this.player, enemies: this.enemies, bullets: this.bullets,
      lifecycle: this.lifecycle, explosions, grid, camera, audio,
      onSupernovaWarning: () => {},
      onSupernovaDetonate: () => {},
    });
    this.boss = new BossSystem({
      player: this.player, enemies: this.enemies, lifecycle: this.lifecycle,
      grid, camera, audio, waveManager: this.waveManager, hud,
      onWarning: () => {},
      requestHitstop: (ms: number) => { this.hitstop = Math.max(this.hitstop, ms); },
    });
  }

  /** Begin a fresh episode. Single life by default for a clean survival reward. */
  reset(startingPhase = 'tutorial', lives = 1): void {
    this.player.reset();
    this.player.lives = lives;
    this.bullets.clear();
    this.enemies.length = 0;
    this.gravity.clear();
    this.combat.clear();
    this.lifecycle.clear();
    this.spawn.clear();
    this.waveManager.reset();
    this.boss.reset();
    Object.assign(this.runStats, freshStats());
    this.hitstop = 0;
    this.alive = true;

    if (startingPhase !== 'tutorial') {
      this.waveManager.jumpToPhase(startingPhase);
      const p = (DIFFICULTY_PHASES as Record<string, { start: number; end: number }>)[startingPhase];
      this.gameTime = p?.start ?? 0;
    } else {
      this.gameTime = 0;
    }
  }

  setAction(a: Action): void {
    this.input.setAction(a);
  }

  get score(): number { return this.player.score; }
  get enemyCount(): number { return this.enemies.length; }

  /** Advance one simulation tick (dt in ms). Mirrors the `playing` branch of Game.update(). */
  step(dt: number): void {
    if (!this.alive) return;

    // Hitstop freezes the simulation (matches the live game)
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }

    this.gameTime += dt / 1000;

    this.player.update(dt);
    this.gravity.applyPlayerPull(dt);

    const shots = this.player.tryShoot();
    if (shots) {
      for (const angle of shots) {
        const b = this.bullets.spawn(this.player.position.x, this.player.position.y, angle);
        if (b) this.lifecycle.spawnBullet(b);
      }
    }

    this.bullets.update(dt);
    this.lifecycle.updateBulletTrails(this.bullets);

    this.gravity.applyAttraction(dt);
    this.gravity.updateFlocks();

    for (const e of this.enemies) {
      if (!e.active) continue;
      if (e.isSpawning) {
        e.spawnTimer = Math.max(0, e.spawnTimer - dt / 1000);
        continue;
      }
      (e as { update(dt: number, playerPos?: import('../core/vector').Vec2): void })
        .update(dt, this.player.position);
    }

    separateEnemies(this.enemies, this.gravity.getEnemiesInGravityWell());

    this.spawn.update(dt);

    const result = checkCollisions(this.player, this.bullets.bullets, this.enemies);
    this.combat.processKills(result);
    const hs = this.combat.consumeHitstop();
    if (hs > 0) this.hitstop = hs;

    if (result.playerHit) {
      this.player.lives--;
      this.runStats.livesUsed++;
      if (this.player.lives <= 0) {
        this.alive = false;
        return;
      }
      this.player.respawn();
    }

    this.combat.update(dt, this.gameTime);
    this.lifecycle.cleanupEnemies(this.enemies);
    this.boss.update(dt);
  }

  get arenaW(): number { return gameSettings.arenaWidth; }
  get arenaH(): number { return gameSettings.arenaHeight; }
}

function freshStats(): RunStats {
  return {
    score: 0, kills: 0, timeSurvived: 0, phaseReached: 'tutorial',
    peakHeat: 0, elitesKilled: 0, blackholesKilled: 0,
    minibossDefeated: false, livesUsed: 0, recoveriesUsed: 0, weaponStage: 0,
  };
}
