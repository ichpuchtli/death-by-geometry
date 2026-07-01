import type { Renderer } from '../renderer/sprite-batch';
import type { SpringMassGrid } from '../renderer/grid';
import type { AudioManager } from '../core/audio';
import { Player } from '../entities/player';
import { Enemy } from '../entities/enemies/enemy';
import { BlackHole } from '../entities/enemies/blackhole';
import { LifecycleSystem } from './lifecycle-system';
import { WaveManager } from '../spawner/wave-manager';
import { createEnemy } from '../spawner/enemy-factory';
import { EnemyType, FormationMeta } from '../spawner/spawn-patterns';
import { Vec2 } from '../core/vector';
import { gameSettings } from '../settings';
import {
  MIN_SPAWN_DISTANCE,
  SPAWN_DURATION_AMBUSH,
  MAX_CONCURRENT_ELITES,
  TELEGRAPH_DURATION,
  TELEGRAPH_COLOR,
  FORMATION_SOUND_MIN_COUNT,
  FORMATION_LEAKTHROUGH_COUNT,
  FORMATION_LEAKTHROUGH_VOLUME,
} from '../config';

interface Telegraph {
  formation: string;
  side?: number;      // 0=top, 1=bottom, 2=left, 3=right
  center?: Vec2;
  elapsed: number;
  duration: number;
}

const MAX_BLACKHOLES = 4;

export interface SpawnSystemDeps {
  player: Player;
  enemies: Enemy[];
  lifecycle: LifecycleSystem;
  audio: AudioManager;
  grid: SpringMassGrid;
  waveManager: WaveManager;
}

/**
 * Executes WaveManager spawn requests: cap enforcement, elite caps, edge-push for
 * player-proximity spawns, trail registration, grid ripples, spawn SFX, and the
 * formation telegraph lifecycle (create / update / render).
 */
export class SpawnSystem {
  private deps: SpawnSystemDeps;

  // Spawn telegraphs (border arcs / warning rings for upcoming formations)
  private telegraphs: Telegraph[] = [];

  // Tracks how many enemies have spawned per formation (for group-sound suppression)
  private formationSpawnCounts = new Map<number, number>();

  constructor(deps: SpawnSystemDeps) {
    this.deps = deps;
  }

  /** Pull spawn requests from the WaveManager and instantiate enemies. */
  update(dt: number): void {
    const { enemies, player, lifecycle, grid, waveManager } = this.deps;

    const spawns = waveManager.update(dt, player.position);
    for (const req of spawns) {
      if (enemies.length >= gameSettings.maxEnemies) continue;
      // Hard cap: max BlackHoles active at once
      if (req.type === 'blackhole') {
        const bhCount = enemies.filter(e => e.active && e instanceof BlackHole).length;
        if (bhCount >= MAX_BLACKHOLES) continue;
      }
      // Enforce elite concurrent cap
      let elite = req.isElite ?? false;
      if (elite) {
        const eliteCount = enemies.filter(e => e.active && e.isElite).length;
        if (eliteCount >= MAX_CONCURRENT_ELITES) elite = false;
      }
      const enemy = createEnemy(req.type, req.position, elite);
      // If ambush spawn, use longer spawn animation
      if (req.isAmbush) { enemy.spawnDuration = enemy.spawnTimer = SPAWN_DURATION_AMBUSH; }
      // Push enemies that spawn too close to the player to the edge
      const dx = enemy.position.x - player.position.x;
      const dy = enemy.position.y - player.position.y;
      if (dx * dx + dy * dy < MIN_SPAWN_DISTANCE * MIN_SPAWN_DISTANCE) {
        enemy.spawnAtEdge();
      }
      // Register trail for enemy
      lifecycle.spawnEnemy(enemy);
      enemies.push(enemy);
      // Grid ripple on spawn
      grid.applyImpulse(enemy.position.x, enemy.position.y, 80, 120);
      // Play spawn SFX — suppress individual sounds for large formations
      if (req.formationId != null) {
        const cnt = (this.formationSpawnCounts.get(req.formationId) ?? 0) + 1;
        this.formationSpawnCounts.set(req.formationId, cnt);
        if (cnt <= FORMATION_LEAKTHROUGH_COUNT) {
          this.playSFXAtVolume(req.type, FORMATION_LEAKTHROUGH_VOLUME);
        }
        // rest suppressed — group sound plays from telegraph
      } else {
        this.playEnemySpawnSFX(req.type);
      }
      if (elite) this.deps.audio.playEliteArrive();
    }

    // Create telegraphs from formation events + play group spawn sounds
    for (const fm of waveManager.formationEvents) {
      this.createTelegraph(fm);
      if (fm.count >= FORMATION_SOUND_MIN_COUNT) {
        this.deps.audio.playFormationSpawn(fm.formation, fm.count);
      }
    }
  }

  /** Advance telegraph timers (runs every frame, even during hitstop). */
  updateTelegraphs(dt: number): void {
    const dtSec = dt / 1000;
    for (const tg of this.telegraphs) {
      tg.elapsed += dtSec;
    }
    this.telegraphs = this.telegraphs.filter(tg => tg.elapsed < tg.duration);
  }

  clear(): void {
    this.telegraphs = [];
    this.formationSpawnCounts.clear();
  }

  private playEnemySpawnSFX(type: EnemyType): void {
    switch (type) {
      case 'rhombus': this.deps.audio.playSFX('rhombus'); break;
      case 'pinwheel': this.deps.audio.playSFX('pinwheel'); break;
      case 'blackhole': this.deps.audio.playSFX('deathstar'); break;
      case 'sierpinski': this.deps.audio.playSFX('octagon'); break;
    }
  }

  /** Play spawn SFX at reduced volume (for formation leakthrough) */
  private playSFXAtVolume(type: EnemyType, volume: number): void {
    switch (type) {
      case 'rhombus': this.deps.audio.playSFXAtVolume('rhombus', volume); break;
      case 'pinwheel': this.deps.audio.playSFXAtVolume('pinwheel', volume); break;
      case 'blackhole': this.deps.audio.playSFXAtVolume('deathstar', volume); break;
      case 'sierpinski': this.deps.audio.playSFXAtVolume('octagon', volume); break;
    }
  }

  /** Create a spawn telegraph from a formation event */
  private createTelegraph(fm: FormationMeta): void {
    this.telegraphs.push({
      formation: fm.formation,
      side: fm.side,
      center: fm.center,
      elapsed: 0,
      duration: TELEGRAPH_DURATION / 1000,
    });
    this.deps.audio.playTelegraphWarning();
  }

  /** Render spawn telegraph arcs on arena border */
  renderTelegraphs(renderer: Renderer): void {
    const hw = gameSettings.arenaWidth / 2;
    const hh = gameSettings.arenaHeight / 2;
    const [tr, tg, tb] = TELEGRAPH_COLOR;

    for (const tel of this.telegraphs) {
      const t = tel.elapsed / tel.duration;
      const pulse = 0.5 + 0.5 * Math.sin(tel.elapsed * 12); // fast pulse
      const alpha = (1 - t) * 0.6 * pulse;

      if (tel.side !== undefined) {
        // Edge-based telegraph: glowing arc on the relevant border
        const segments = 20;
        let x1: number, y1: number, x2: number, y2: number;

        switch (tel.side) {
          case 0: // top
            for (let i = 0; i < segments; i++) {
              x1 = -hw + (i / segments) * hw * 2;
              x2 = -hw + ((i + 1) / segments) * hw * 2;
              y1 = y2 = hh;
              renderer.drawLine(x1, y1, x2, y2, tr, tg, tb, alpha);
              // Inner glow
              renderer.drawLine(x1, y1 - 6, x2, y2 - 6, tr, tg, tb, alpha * 0.4);
            }
            break;
          case 1: // bottom
            for (let i = 0; i < segments; i++) {
              x1 = -hw + (i / segments) * hw * 2;
              x2 = -hw + ((i + 1) / segments) * hw * 2;
              y1 = y2 = -hh;
              renderer.drawLine(x1, y1, x2, y2, tr, tg, tb, alpha);
              renderer.drawLine(x1, y1 + 6, x2, y2 + 6, tr, tg, tb, alpha * 0.4);
            }
            break;
          case 2: // left
            for (let i = 0; i < segments; i++) {
              y1 = -hh + (i / segments) * hh * 2;
              y2 = -hh + ((i + 1) / segments) * hh * 2;
              x1 = x2 = -hw;
              renderer.drawLine(x1, y1, x2, y2, tr, tg, tb, alpha);
              renderer.drawLine(x1 + 6, y1, x2 + 6, y2, tr, tg, tb, alpha * 0.4);
            }
            break;
          case 3: // right
            for (let i = 0; i < segments; i++) {
              y1 = -hh + (i / segments) * hh * 2;
              y2 = -hh + ((i + 1) / segments) * hh * 2;
              x1 = x2 = hw;
              renderer.drawLine(x1, y1, x2, y2, tr, tg, tb, alpha);
              renderer.drawLine(x1 - 6, y1, x2 - 6, y2, tr, tg, tb, alpha * 0.4);
            }
            break;
        }

        // Pincer: also show opposite side
        if (tel.formation === 'pincer' && tel.side !== undefined) {
          const oppSide = tel.side < 2 ? (tel.side === 0 ? 1 : 0) : (tel.side === 2 ? 3 : 2);
          switch (oppSide) {
            case 0:
              renderer.drawLine(-hw, hh, hw, hh, tr, tg, tb, alpha * 0.7);
              break;
            case 1:
              renderer.drawLine(-hw, -hh, hw, -hh, tr, tg, tb, alpha * 0.7);
              break;
            case 2:
              renderer.drawLine(-hw, -hh, -hw, hh, tr, tg, tb, alpha * 0.7);
              break;
            case 3:
              renderer.drawLine(hw, -hh, hw, hh, tr, tg, tb, alpha * 0.7);
              break;
          }
        }
      }

      if (tel.center) {
        // Position-based telegraph: warning ring (surround/ambush)
        const radius = tel.formation === 'ambush' ? 300 + t * 50 : 280 + t * 40;
        const ringSegments = 24;
        for (let i = 0; i < ringSegments; i++) {
          const a1 = (i / ringSegments) * Math.PI * 2;
          const a2 = ((i + 1) / ringSegments) * Math.PI * 2;
          // Dashed effect: skip every other segment
          if (i % 2 === 0) continue;
          renderer.drawLine(
            tel.center.x + Math.cos(a1) * radius,
            tel.center.y + Math.sin(a1) * radius,
            tel.center.x + Math.cos(a2) * radius,
            tel.center.y + Math.sin(a2) * radius,
            tr, tg, tb, alpha,
          );
        }
      }
    }
  }
}
