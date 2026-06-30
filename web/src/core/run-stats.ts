import { MedalDef, MEDALS } from '../config';

export interface RunStats {
  score: number;
  kills: number;
  timeSurvived: number;
  phaseReached: string;
  peakHeat: number;
  elitesKilled: number;
  blackholesKilled: number;
  minibossDefeated: boolean;
  livesUsed: number;
  recoveriesUsed: number;
  weaponStage: number;
}

export function computeMedals(stats: RunStats): MedalDef[] {
  const earned: MedalDef[] = [];
  for (const m of MEDALS) {
    let qualifies = false;
    switch (m.id) {
      case 'untouchable': qualifies = stats.livesUsed === 0; break;
      case 'chaos_walker': qualifies = stats.phaseReached === 'chaos'; break;
      case 'survivor': qualifies = stats.phaseReached === 'intense' || stats.phaseReached === 'chaos'; break;
      case 'boss_slayer': qualifies = stats.minibossDefeated; break;
      case 'elite_hunter': qualifies = stats.elitesKilled >= 5; break;
      case 'gravity_master': qualifies = stats.blackholesKilled >= 3; break;
      case 'inferno': qualifies = stats.peakHeat >= 0.85; break;
      case 'comeback_kid': qualifies = stats.recoveriesUsed >= 2; break;
      case 'centurion': qualifies = stats.kills >= 100; break;
      case 'thousand': qualifies = stats.kills >= 1000; break;
    }
    if (qualifies) earned.push(m);
  }
  return earned;
}
