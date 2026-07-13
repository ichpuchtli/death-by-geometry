// --- Explosion particles ---
export const EXPLOSION_PARTICLE_COUNT_SMALL = 50;
export const EXPLOSION_PARTICLE_COUNT_LARGE = 180;
export const EXPLOSION_PARTICLE_COUNT_DEATH = 350;
export const EXPLOSION_DURATION_DEFAULT = 1.2; // seconds
export const EXPLOSION_DURATION_LARGE = 2.5;
export const EXPLOSION_DURATION_DEATH = 5.0;
export const EXPLOSION_POOL_SIZE = 60;

// --- Directional death shatter (bullet momentum transfer) ---
// When a bullet kills a unit, fragments fan FORWARD along the bullet's travel direction —
// nothing flies back toward the shooter. Cone is the half-angle of the fan; side damping
// is the fragment speed at the cone edge relative to dead-ahead.
export const DEATH_FRAGMENT_CONE = 1.35;         // rad (±77°) — back hemisphere stays empty
export const DEATH_FRAGMENT_SIDE_DAMPING = 0.45; // edge fragments move at 45% of forward speed
export const DEATH_FRAGMENT_FORWARD_BOOST = 1.4; // overall speed-up vs radial (momentum carried in)

// --- Ambient particle field (cosmic dust) ---
// A field of additive motes drifting through world space, pulled + swirled around
// attractors (BlackHoles) into glowing accretion disks. Tunables are live-editable
// in the Particle Lab (?particles=1); these are the defaults / starting points.
export const PARTICLE_FIELD_DENSITY = 520;       // ambient motes across the view
export const PARTICLE_FIELD_DRAG = 0.985;        // per-frame velocity retention (frame-normalized)
export const PARTICLE_FIELD_MAX_SPEED = 9.5;     // px/frame speed cap
export const PARTICLE_FIELD_SWIRL = 0.55;        // tangential force as a fraction of radial pull (the "orbit" knob)
export const PARTICLE_FIELD_STREAK = 2.4;        // velocity-stretch multiplier for the streak tail
export const PARTICLE_FIELD_SOFTENING = 850;     // distance² softening so the core pull stays finite
export const PARTICLE_FIELD_MAX_TRANSIENT = 700; // cap on live burst motes (thruster wake + impact sparks + BH life-stage emission); raised so supernova bursts aren't starved

// --- Geometry shatter (solid-object death) ---
// When a unit is destroyed by a bullet/contact (not absorbed, not a boss), it breaks
// along its OWN edges: each edge becomes a rigid line fragment that tumbles outward
// carrying the impact momentum, instead of dissolving into a generic particle cloud.
export const SHATTER_EDGE_SUBDIV = 1;        // 1 = each shard is a literal edge of the shape (most recognizable breakup)
export const SHATTER_EJECT_SPEED = 0.13;     // px/ms base outward speed from the shape centroid
export const SHATTER_IMPACT_SHARE = 0.55;    // how much of the impact direction each shard inherits
export const SHATTER_SPIN = 0.010;           // rad/ms max tumble rate
export const SHATTER_DRAG = 0.94;            // per-frame velocity retention (frame-normalized)
export const SHATTER_LIFE = 0.5;             // seconds a shard lives before it fades out
export const SHATTER_THICKNESS = 1.4;        // px half-offset for the parallel lines that give each shard body
export const SHATTER_POOL_SIZE = 900;        // shard pool cap (edges * subdiv * concurrent deaths)

// --- Tidal death warp (spaghettification) ---
// A unit caught in a BlackHole's core has its geometry stretched + twisted toward the
// hole in its final moments before it's swallowed. Driven per-vertex by Renderer.setWarp.
export const DEATH_WARP_STRETCH = 0.55;      // radial inward tidal displacement at full intensity
export const DEATH_WARP_TWIST = 2.2;         // radians of frame-drag swirl at full intensity, at the core
export const DEATH_WARP_REACH_MIN = 150;     // px — minimum influence radius around a hole
export const DEATH_WARP_REACH_MULT = 3.5;    // influence radius = max(min, hole.collisionRadius * this)

// --- Live-game particle wiring (ported from the Particle Lab) ---
export const PARTICLE_FIELD_GAME_DENSITY = 420;        // ambient dust motes (desktop)
export const PARTICLE_FIELD_GAME_DENSITY_MOBILE = 120; // fewer on mobile for perf
export const PARTICLE_FIELD_DUST_PULL = 2000;          // BlackHole strength as seen by the dust field
// Blue circles carry the BlackHole's dust DNA: each is a small attractor so ambient dust
// swirls into a tight accretion halo around it (instead of decorative satellite dots).
export const PARTICLE_FIELD_CIRCLE_PULL = 380;         // circle attractor strength as seen by the dust field (tuned for a visible tight halo)
export const PARTICLE_FIELD_CIRCLE_RADIUS = 110;       // px — influence radius (tight halo, not a wide well)
export const PARTICLE_FIELD_CIRCLE_SWIRL = 1.5;        // high tangential → dust orbits into a halo rather than collapsing in
export const PARTICLE_FIELD_CIRCLE_SHED = 0.5;         // per-frame chance a moving circle actively sheds a blue dust mote (desktop; the attractor then swirls it into a visible halo)
// BlackHole life-stage dust EMISSION: the hole actively sheds dust that rides its life cycle —
// a trickle scaling with swallowed mass, a hot inrushing storm as it nears supernova, then a
// radial eruption on detonation. (Separate from the passive pull/heat coupling.)
export const PARTICLE_FIELD_BH_EMIT_RATE = 0.7;        // per-frame emit chance at full mass (scales with fill fraction)
export const PARTICLE_FIELD_BH_EMIT_CRITICAL = 4;      // motes/frame streaming inward while destabilizing (desktop)
export const PARTICLE_FIELD_BH_DETONATE_BURST = 160;   // motes erupted outward on supernova detonation (desktop)
export const GRAVITY_ENEMY_SWIRL = 0.35;               // baseline tangential swirl (now randomised per-hole via BlackHole.enemySwirl 0.1–0.7)
export const SHATTER_IMPACT_SPEED = 0.3;               // px/ms momentum handed to geometry shards on a kill

// --- Camera ---
export const CAMERA_LERP_SPEED = 0.08;
export const SCREEN_SHAKE_SMALL = 5;
export const SCREEN_SHAKE_LARGE = 10;
export const SCREEN_SHAKE_DEATH = 20;

// --- Bloom ---
export const BLOOM_THRESHOLD = 0.06;
export const BLOOM_INTENSITY = 2.2;
export const BLOOM_BLUR_PASSES = 6;
export const BLOOM_BLUR_RADIUS = 2.5;

// --- Spring-mass grid ---
export const GRID_SPACING = 40;
export const GRID_SPRING_STIFFNESS = 800;
export const GRID_SPRING_DAMPING = 8;
export const GRID_ANCHOR_STIFFNESS = 15;
export const GRID_MAX_DISPLACEMENT = 160;
export const GRID_SUBSTEPS = 3;
export const GRID_MOBILE_SUBSTEPS = 2;
// Static baseline opacity of the spacetime-fabric grid lines (runtime-tunable via
// gameSettings.gridOpacity). Lowered from the old hard-coded 0.75 so the calm grid recedes
// and enemy units read clearly; velocity/well-depth boosts still make the reactive parts pop.
export const GRID_LINE_ALPHA = 0.4;
export const GRID_COLOR_BASE: [number, number, number] = [0.38, 0.14, 0.72];
export const GRID_COLOR_STRETCH: [number, number, number] = [0.0, 0.8, 1.0];
export const GRID_COLOR_COMPRESS: [number, number, number] = [1.0, 0.2, 0.8];

// --- Trails ---
export const TRAIL_LENGTH_ENEMY = 18;
export const TRAIL_LENGTH_BULLET = 10;

// --- Mobile ---
export const MOBILE_BLOOM_SCALE = 0.25; // bloom FBO at quarter-res on mobile
export const MOBILE_MAX_ENEMIES = 100;
export const MOBILE_TRAIL_LENGTH_ENEMY = 8;
export const MOBILE_TRAIL_LENGTH_BULLET = 5;

// --- Death slowmo ---
export const DEATH_SLOWMO_DURATION = 4800; // ms of real time
export const DEATH_SLOWMO_TIME_SCALE = 0.12; // how slow game runs during slowmo
export const DEATH_SLOWMO_SHOCKWAVE_SPEED = 0.8; // px/ms expansion speed of kill shockwave
