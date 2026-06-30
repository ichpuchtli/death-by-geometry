import { Enemy } from '../entities/enemies/enemy';
import { Rhombus } from '../entities/enemies/rhombus';
import { Pinwheel } from '../entities/enemies/pinwheel';
import { CircleEnemy } from '../entities/enemies/circle';
import { BlackHole } from '../entities/enemies/blackhole';
import { Shard } from '../entities/enemies/shard';
import { Sierpinski } from '../entities/enemies/sierpinski';
import { Mandelbrot } from '../entities/enemies/mandelbrot';
import { MiniMandel } from '../entities/enemies/minimandel';
import { ELITE_MODIFIERS } from '../config';
import { gameSettings } from '../settings';
import { EnemyType } from './spawn-patterns';
import { Vec2 } from '../core/vector';

export function createEnemy(type: EnemyType, pos?: Vec2, isElite = false, tier?: number): Enemy {
  let e: Enemy;
  switch (type) {
    case 'rhombus': e = new Rhombus(); break;
    case 'pinwheel': e = new Pinwheel(); break;
    case 'circle': e = new CircleEnemy(pos); e.speed *= gameSettings.enemySpeedMultiplier; return e;
    case 'blackhole': e = new BlackHole(); break;
    case 'shard': e = new Shard(pos); e.speed *= gameSettings.enemySpeedMultiplier; return e;
    case 'sierpinski': e = new Sierpinski(tier ?? 0, pos); break;
    case 'mandelbrot': e = new Mandelbrot(); break;
    case 'minimandel': { const mm = new MiniMandel(pos); mm.speed *= gameSettings.enemySpeedMultiplier; return mm; }
    default: e = new Rhombus(); break;
  }
  e.baseType = type;
  if (!pos) {
    if (type === 'blackhole') {
      e.spawnAnywhere();
    } else {
      e.spawnAtEdge();
    }
  } else {
    e.position.copyFrom(pos);
  }
  e.speed *= gameSettings.enemySpeedMultiplier;

  // Apply elite modifiers
  if (isElite) {
    const mod = ELITE_MODIFIERS[type];
    if (mod) {
      e.isElite = true;
      e.speed *= mod.speedMult;
      e.scoreValue = Math.floor(e.scoreValue * mod.scoreMult);
      e.hp += mod.hpAdd;
      e.maxHp += mod.hpAdd;
      e.color = [
        Math.min(1, e.color[0] + mod.colorBright),
        Math.min(1, e.color[1] + mod.colorBright),
        Math.min(1, e.color[2] + mod.colorBright),
      ];
    }
  }
  return e;
}
