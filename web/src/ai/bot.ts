import { Policy } from './policy';
import { encodeObservation, OBS_SIZE } from './observation';
import { decodeAction, Action } from './action';
import type { Mover, EnemyView } from './observation';
import policyData from './trained-policy.json';

/**
 * Browser-side AI agent. Loads the policy trained offline against the digital twin and,
 * given the live game state, produces a twin-stick action each frame. The same
 * observation encoder + policy forward pass runs here as in training, so behaviour matches.
 */
export class Bot {
  private policy = Policy.fromJSON(policyData as { arch: number[]; params: number[] });
  private obs = new Float32Array(OBS_SIZE);

  computeAction(player: Mover, enemies: EnemyView[], arenaW: number, arenaH: number): Action {
    encodeObservation(player, enemies, arenaW, arenaH, this.obs);
    return decodeAction(this.policy.forward(this.obs));
  }
}
