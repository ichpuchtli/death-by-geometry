import { Enemy } from '../entities/enemies/enemy';
import { ENEMY_SEPARATION_BUFFER } from '../config';
import { gameSettings } from '../settings';

/**
 * Per-frame pairwise separation: push overlapping enemies apart (Grid Wars style).
 *
 * Extracted from `Game` so the headless training sim (`sim/headless-game.ts`) and the
 * live game run the exact same separation dynamics — critical for sim-to-real transfer
 * of the trained AI policy.
 *
 * @param enemies         the shared, in-place enemies array
 * @param inGravityWell   enemies currently pulled by a BlackHole (skip separation — gravity wins)
 */
export function separateEnemies(enemies: Enemy[], inGravityWell: Set<Enemy>): void {
  const hw = gameSettings.arenaWidth / 2 - 10;
  const hh = gameSettings.arenaHeight / 2 - 10;
  const len = enemies.length;

  for (let i = 0; i < len; i++) {
    const a = enemies[i];
    if (!a.active) continue;
    if (a.isSpawning && a.spawnTimer > a.spawnDuration * 0.3) continue;

    for (let j = i + 1; j < len; j++) {
      const b = enemies[j];
      if (!b.active) continue;
      if (b.isSpawning && b.spawnTimer > b.spawnDuration * 0.3) continue;

      // Don't fight gravity — if either enemy is being pulled into a BlackHole, skip
      if (inGravityWell.has(a) || inGravityWell.has(b)) continue;

      const dx = a.position.x - b.position.x;
      const dy = a.position.y - b.position.y;
      const distSq = dx * dx + dy * dy;
      const minDist = a.collisionRadius + b.collisionRadius + ENEMY_SEPARATION_BUFFER;

      if (distSq >= minDist * minDist) continue;

      const dist = Math.sqrt(distSq);
      let nx: number, ny: number;
      if (dist < 0.5) {
        // Near-zero distance — deterministic direction from indices so it's consistent across frames
        const angle = ((i * 7919 + j * 104729) % 6283) * 0.001;
        nx = Math.cos(angle);
        ny = Math.sin(angle);
      } else {
        nx = dx / dist;
        ny = dy / dist;
      }

      const overlap = minDist - dist;
      // Push harder when heavily overlapping (>50% of minDist) to resolve clusters faster
      const pushStrength = overlap > minDist * 0.5 ? overlap * 1.5 : overlap;

      // Weight: BlackHoles immovable (0), minibosses resist (0.25), others equal (1)
      const wA = a.separationWeight;
      const wB = b.separationWeight;
      const totalW = wA + wB;
      if (totalW < 0.001) continue; // both immovable

      const pushA = pushStrength * (wA / totalW);
      const pushB = pushStrength * (wB / totalW);

      // Push A along +normal, B along -normal
      a.position.x = Math.max(-hw, Math.min(hw, a.position.x + nx * pushA));
      a.position.y = Math.max(-hh, Math.min(hh, a.position.y + ny * pushA));
      b.position.x = Math.max(-hw, Math.min(hw, b.position.x - nx * pushB));
      b.position.y = Math.max(-hh, Math.min(hh, b.position.y - ny * pushB));

      // Bouncers (Pinwheel): deflect velocity off collision normal
      const aIsBouncer = a.isBouncer;
      const bIsBouncer = b.isBouncer;
      if (aIsBouncer || bIsBouncer) {
        if (aIsBouncer) {
          // Reflect A's velocity off normal (n points from B→A)
          const dot = a.velocity.x * nx + a.velocity.y * ny;
          if (dot < 0) { // only if moving toward B
            a.velocity.x -= 2 * dot * nx;
            a.velocity.y -= 2 * dot * ny;
          }
        }
        if (bIsBouncer) {
          // Reflect B's velocity off -normal (points from A→B)
          const dot = b.velocity.x * (-nx) + b.velocity.y * (-ny);
          if (dot < 0) { // only if moving toward A
            b.velocity.x -= 2 * dot * (-nx);
            b.velocity.y -= 2 * dot * (-ny);
          }
        }
      }
    }
  }
}
