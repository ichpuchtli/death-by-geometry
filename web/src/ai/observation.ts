import { PLAYER_SPEED } from '../config';
import type { Vec2 } from '../core/vector';

/**
 * Egocentric observation encoding for the AI agent.
 *
 * The exact same encoder runs in the Node training sim and in the browser bot, so a
 * policy trained against the digital twin transfers directly to the live game.
 *
 * Design: an order-invariant angular "radar" around the player rather than a fixed
 * list of the K nearest enemies. This scales to any enemy count and is robust to the
 * chaotic swarms of late-game phases.
 */

// A minimal structural view of the entities the encoder reads (satisfied by Player/Enemy).
export interface Mover {
  position: Vec2;
  velocity: Vec2;
}
export interface EnemyView extends Mover {
  active: boolean;
  isSpawning: boolean;
}

export const SECTORS = 16;                 // angular radar resolution
const RADAR_RANGE = 700;                   // px; enemies beyond this are invisible to a sector
const WALL_CLEAR_SCALE = 500;              // px of clearance that maps to "1.0 = plenty of room"
const CLOSE_SCALE = PLAYER_SPEED * 3;      // normalizes an enemy's closing speed to ~[-1, 1]

// Layout: [px, py, pvx, pvy, wallR, wallL, wallU, wallD, prox[S], closing[S], nearDirX, nearDirY, nearProx]
export const OBS_SIZE = 8 + 2 * SECTORS + 3;

/**
 * Encode the world into a fixed-size feature vector. Pass a reusable `out` buffer to
 * avoid per-frame allocation in the training loop.
 */
export function encodeObservation(
  player: Mover,
  enemies: EnemyView[],
  arenaW: number,
  arenaH: number,
  out: Float32Array = new Float32Array(OBS_SIZE),
): Float32Array {
  out.fill(0);

  const hw = arenaW / 2;
  const hh = arenaH / 2;
  const px = player.position.x;
  const py = player.position.y;

  // Player position (normalized to [-1, 1]) and velocity (normalized by max speed)
  out[0] = clamp(px / hw, -1, 1);
  out[1] = clamp(py / hh, -1, 1);
  out[2] = clamp(player.velocity.x / PLAYER_SPEED, -1, 1);
  out[3] = clamp(player.velocity.y / PLAYER_SPEED, -1, 1);

  // Wall clearance in each cardinal direction (1 = lots of room, 0 = against the wall)
  out[4] = clamp((hw - px) / WALL_CLEAR_SCALE, 0, 1); // right
  out[5] = clamp((px + hw) / WALL_CLEAR_SCALE, 0, 1); // left
  out[6] = clamp((hh - py) / WALL_CLEAR_SCALE, 0, 1); // up
  out[7] = clamp((py + hh) / WALL_CLEAR_SCALE, 0, 1); // down

  const proxBase = 8;
  const closeBase = 8 + SECTORS;

  // Per-sector nearest-enemy distance², so we keep the closest threat per sector
  const nearestDistSq = new Float32Array(SECTORS).fill(Infinity);

  let overallNearDistSq = Infinity;
  let overallNearDx = 0;
  let overallNearDy = 0;

  const range2 = RADAR_RANGE * RADAR_RANGE;

  for (const e of enemies) {
    if (!e.active || e.isSpawning) continue;
    const dx = e.position.x - px;
    const dy = e.position.y - py;
    const distSq = dx * dx + dy * dy;
    if (distSq > range2) continue;

    let sector = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * SECTORS);
    if (sector < 0) sector = 0;
    if (sector >= SECTORS) sector = SECTORS - 1;

    if (distSq < nearestDistSq[sector]) {
      nearestDistSq[sector] = distSq;
      const dist = Math.sqrt(distSq) || 1;
      const prox = clamp(1 - dist / RADAR_RANGE, 0, 1);
      out[proxBase + sector] = prox;
      // Closing speed: component of enemy velocity along the enemy→player direction.
      // Positive means it is moving toward the player.
      const toPlayerX = -dx / dist;
      const toPlayerY = -dy / dist;
      const closing = e.velocity.x * toPlayerX + e.velocity.y * toPlayerY;
      out[closeBase + sector] = clamp(closing / CLOSE_SCALE, -1, 1);
    }

    if (distSq < overallNearDistSq) {
      overallNearDistSq = distSq;
      overallNearDx = dx;
      overallNearDy = dy;
    }
  }

  // Nearest enemy overall: unit direction + proximity (helps aiming)
  if (overallNearDistSq < Infinity) {
    const d = Math.sqrt(overallNearDistSq) || 1;
    out[OBS_SIZE - 3] = overallNearDx / d;
    out[OBS_SIZE - 2] = overallNearDy / d;
    out[OBS_SIZE - 1] = clamp(1 - d / RADAR_RANGE, 0, 1);
  }

  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
