// --- Run Stats & Medals ---
export interface MedalDef {
  id: string;
  name: string;
  description: string;
  color: [number, number, number]; // RGB 0-1 for HUD rendering
}
export const MEDALS: MedalDef[] = [
  { id: 'untouchable', name: 'UNTOUCHABLE', description: 'No deaths', color: [0.3, 1.0, 1.0] },
  { id: 'chaos_walker', name: 'CHAOS WALKER', description: 'Reached CHAOS phase', color: [1.0, 0.3, 0.1] },
  { id: 'survivor', name: 'SURVIVOR', description: 'Reached DANGER phase', color: [1.0, 0.6, 0.1] },
  { id: 'boss_slayer', name: 'BOSS SLAYER', description: 'Defeated Mandelbrot', color: [1.0, 0.2, 0.2] },
  { id: 'elite_hunter', name: 'ELITE HUNTER', description: 'Killed 5+ elites', color: [1.0, 0.85, 0.2] },
  { id: 'gravity_master', name: 'GRAVITY MASTER', description: 'Killed 3+ black holes', color: [0.4, 0.6, 1.0] },
  { id: 'inferno', name: 'INFERNO', description: 'Peak heat above 85%', color: [1.0, 0.5, 0.0] },
  { id: 'comeback_kid', name: 'COMEBACK KID', description: 'Used 2+ recovery windows', color: [0.3, 0.9, 0.9] },
  { id: 'centurion', name: 'CENTURION', description: '100+ kills', color: [0.6, 1.0, 0.3] },
  { id: 'thousand', name: 'THOUSAND', description: '1000+ kills', color: [1.0, 1.0, 0.5] },
];
