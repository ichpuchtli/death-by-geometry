// --- Spawner / difficulty ---
// Phase boundaries in seconds
export const DIFFICULTY_PHASES = {
  tutorial:  { start: 0,   end: 30 },
  rampUp:    { start: 30,  end: 120 },
  midGame:   { start: 120, end: 240 },
  intense:   { start: 240, end: 400 },
  chaos:     { start: 400, end: Infinity },
};

export const SPAWN_DELAY_BETWEEN = 35; // ms between each enemy in a cluster (~1s for 30 enemies)
export const SPAWN_DURATION_DEFAULT = 1.5;   // seconds (was 0.3)
export const SPAWN_DURATION_CHILD = 0.5;     // for Shard, MiniMandel, Circle
export const SPAWN_DURATION_AMBUSH = 2.0;    // ambush spawns get extra warning time
export const MIN_SPAWN_DISTANCE = 200;       // px — enemies closer than this get pushed to edge
export const ENEMY_SEPARATION_BUFFER = 2;    // px extra clearance beyond combined collision radii (per-frame push)

// --- Formation Group Spawn Sound ---
export const FORMATION_SOUND_MIN_COUNT = 6;
export const FORMATION_LEAKTHROUGH_COUNT = 2;
export const FORMATION_LEAKTHROUGH_VOLUME = 0.15;
