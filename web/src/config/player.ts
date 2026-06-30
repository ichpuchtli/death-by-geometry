// --- Player ---
export const PLAYER_SPEED = 0.35; // px/ms
export const PLAYER_COLLISION_RADIUS = 24;
export const PLAYER_STARTING_LIVES = 5;
export const PLAYER_INVULN_DURATION = 2000; // ms of invulnerability after respawn
export const PLAYER_SHIP_SCALE = 18;
export const PLAYER_ROTATION_LERP = 0.012; // per-ms lerp factor for facing angle
export const PLAYER_SHIP_COLOR: [number, number, number] = [0.1, 1.0, 0.1];
export const PLAYER_SHIP_COLOR2: [number, number, number] = [0.05, 0.6, 0.05];
export const PLAYER_SHIP_FILL_COLOR: [number, number, number] = [0.15, 0.8, 0.15];
export const PLAYER_SHIP_FILL_ALPHA = 0.7;

// --- Crosshair (desktop: at cursor, touch: near player) ---
export const CROSSHAIR_SIZE = 14;           // distance from center to each chevron
export const CROSSHAIR_CHEVRON_SIZE = 6;    // size of each individual chevron V
export const CROSSHAIR_GAP = 4;             // inner gap (negative space diamond radius)
export const CROSSHAIR_COLOR: [number, number, number] = [0.5, 1.0, 0.5];
export const CROSSHAIR_ALPHA = 0.85;
export const CROSSHAIR_ROTATION_SPEED = 0.0008; // radians per ms (slow spin)

// --- Weapon progression (score thresholds) ---
export const WEAPON_STAGES = [
  { score: 0,      shotDelay: 150, bulletCount: 1, angleOffsets: [0] },
  { score: 10000,  shotDelay: 120, bulletCount: 1, angleOffsets: [0] },
  { score: 25000,  shotDelay: 120, bulletCount: 2, angleOffsets: [-3, 3] },
  { score: 50000,  shotDelay: 90,  bulletCount: 2, angleOffsets: [-3, 3] },
  { score: 150000, shotDelay: 90,  bulletCount: 3, angleOffsets: [-3, 0, 3] },
];
