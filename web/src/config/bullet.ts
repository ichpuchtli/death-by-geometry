// --- Bullets ---
export const BULLET_SPEED = 1.0; // px/ms
export const BULLET_COLLISION_RADIUS_ENEMY = 38;
export const BULLET_SCALE = 5;
export const BULLET_COLOR: [number, number, number] = [1.0, 0.0, 0.0];
export const BULLET_COLOR2: [number, number, number] = [1.0, 0.78, 0.78];
export const BULLET_POOL_SIZE = 200;
export const BULLET_GRAVITY_STRENGTH = 0.45; // bullet bending near BlackHoles — strong enough that bullets visibly curve/get captured

// --- Bullet ↔ spacetime-fabric wake (Geometry Wars bow wave, picked in the Player Design Lab v2) ---
// A LEADING wake: a bow-wave push impulse ahead of the bullet parts the fabric, a
// negative gravity well at the bow feeds the spacetime shader bulge, and a gentler
// inward pull behind closes the V. Strengths are per-frame velocity kicks, and are
// scaled by the current weapon stage (BULLET_WAKE_MIN_SCALE at stage 0 → full
// strength at the max stage) so the early-game fabric stays calm.
export const BULLET_WAKE_LEAD = 12;          // bow-wave push strength
export const BULLET_WAKE_LEAD_RADIUS = 130;
export const BULLET_WAKE_BOW_WELL = -2100;   // shader bulge at the bow (negative = push out)
export const BULLET_WAKE_BOW_WELL_RADIUS = 150;
export const BULLET_WAKE_TRAIL = -4.5;       // inward pull closing the wake behind
export const BULLET_WAKE_TRAIL_RADIUS = 100;
export const BULLET_WAKE_MIN_SCALE = 0.3;    // wake strength fraction at the first weapon stage
export const BULLET_WAKE_AHEAD_MS = 70;      // bow offset along the velocity vector
export const BULLET_WAKE_BEHIND_MS = 110;    // stern offset along the velocity vector
