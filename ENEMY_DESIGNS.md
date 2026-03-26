# New Enemy Type Designs — Fractals, Topology & Non-Euclidean Geometry

10 new enemy types for Death by Geometry. Each leverages exotic mathematical
geometry as both visual identity and gameplay mechanic.

---

## 1. Sierpinski — Fractal Triangle

**Shape:** Sierpinski triangle (equilateral triangle with recursive cutouts).
Starts at recursion depth 3 (1 large triangle made of 9 visible sub-triangles).

| Property | Value |
|---|---|
| Color | Gold (#FFD700) / Dark gold (#B8860B) |
| HP | 3 (one per fractal depth) |
| Speed | 0.08 px/ms (slow, heavy) |
| Score | 2,400 |
| Collision Radius | 45 px |
| Behavior | Drifts toward player; rotates slowly |

**Spawn Animation:**
Triangles materialize one recursion level at a time over 0.6s. First the outer
triangle wireframe flickers in, then the inner triangles "fill in" depth by
depth with a cascade of white flashes at each subdivision point.

**Living Shader Effect:**
Inner sub-triangles pulse in a ripple pattern outward from center — each depth
level lights up slightly brighter in sequence (think breathing bioluminescence).
The color shifts subtly between gold and white at the vertices.

**On Hit (Novel Mechanic):**
Each hit removes one recursion depth. The triangle shatters along its fractal
seams — the outermost ring of sub-triangles break off as debris particles (pure
visual, non-colliding) while the remaining structure snaps to a smaller
Sierpinski at depth N-1. Brief screen-shake. Size and collision radius shrink
with each hit.

**On Death (HP 0):**
The final depth-1 triangle splits into **4 small "Shard" enemies** — fast,
tiny equilateral triangles that scatter outward and bounce off walls. Each Shard
is worth 100 points and has 1 HP.

**Death Animation:**
Recursive implosion — sub-triangles fold inward toward the centroid in reverse
order of how they spawned, then a sharp white flash and gold particle burst.

---

## 2. Mobius — Twisted Strip

**Shape:** A Mobius strip rendered as a figure-eight ribbon in 2D. Two
overlapping elongated elliptical loops drawn with a twist crossover at center,
giving the illusion of a single-surface strip.

| Property | Value |
|---|---|
| Color | Teal (#00FFC8) / Dark teal (#008866) |
| HP | 2 |
| Speed | 0.18 px/ms |
| Score | 900 |
| Collision Radius | 30 px |
| Behavior | Orbits player at ~200px radius; never directly approaches |

**Spawn Animation:**
A flat line appears and "twists" — the ribbon form animates from a straight
horizontal line that curls into the figure-eight over 0.4s, with a ripple of
teal light traveling along its length.

**Living Shader Effect:**
A bright dot continuously travels along the ribbon path, tracing the Mobius
surface. Because it's a Mobius strip, the dot appears to travel the "outside"
on one loop and the "inside" on the other before reconnecting — rendered as the
dot changing from bright teal to dim teal halfway through each cycle. Faint
afterglow trail follows the dot.

**Novel Mechanic — Phase Shift:**
Every full orbit around the player, the Mobius "flips" — it becomes
semi-transparent and **immune to bullets** for 1.5s. During the immune phase
its color inverts (teal becomes coral #FF6347) and bullets pass through it.
The traveling dot speeds up during this phase. The player must time their shots
to the vulnerable window.

**On Death:**
The strip unravels — the figure-eight untwists back into a straight line that
then shatters into ribbon-segment particles that curl and fade.

**Death Animation:**
Untwist over 0.3s (reverse of spawn), then the line fragments into 8-10 short
curling segments that drift apart with rotational spin and alpha fade.

---

## 3. Koch — Snowflake Fractal

**Shape:** Koch snowflake at iteration 3 — a hexagonal star with increasingly
jagged fractal edges. Rendered as a single complex line loop.

| Property | Value |
|---|---|
| Color | Ice blue (#88DDFF) / White (#FFFFFF) |
| HP | 2 |
| Speed | 0.12 px/ms |
| Score | 1,200 |
| Collision Radius | 38 px |
| Behavior | Drifts randomly; periodically dashes toward player |

**Spawn Animation:**
Starts as a simple equilateral triangle. Over 0.5s, each edge subdivides in
real-time — you watch the Koch iteration happen live. Edge midpoints push
outward, triangular bumps appear, and the shape grows more complex with each
frame until the full snowflake is formed. Each iteration accompanied by a
crystalline sparkle at new vertices.

**Living Shader Effect:**
"Frost shimmer" — vertices twinkle randomly (brief white flash on individual
points). The entire shape has a slow counter-rotation while individual fractal
bumps oscillate slightly in and out, as if breathing. Faint ice-crystal
particles drift off edges.

**Novel Mechanic — Ice Trail:**
Leaves a fading trail of ice-blue line segments behind it as it moves. These
trail segments persist for 3s and act as **hazard zones** — if the player
touches one, they are slowed by 40% for 1s. Trail segments are purely visual
line segments (no separate entity), checked via distance in collision pass.

**On Death:**
Reverse Koch iteration — the shape simplifies back through each recursion level
over 0.4s, jagged edges smoothing into the base triangle, which then shatters
into 6 ice-shard particles that spin outward and melt (shrink + fade).

**Death Animation:**
De-fractalize (smooth edges step by step) then crystalline shatter burst —
sharp angular particles that glint white before fading.

---

## 4. Penrose — Impossible Triangle

**Shape:** Penrose impossible triangle — three bars arranged to create an
optical illusion of a physically impossible 3D object, rendered with
overlapping line segments and strategic alpha layering to sell the illusion.

| Property | Value |
|---|---|
| Color | Hot pink (#FF1493) / Violet (#9400D3) |
| HP | 2 |
| Speed | 0.14 px/ms |
| Score | 1,500 |
| Collision Radius | 32 px |
| Behavior | Follows player; teleports short distances |

**Spawn Animation:**
Three disconnected line segments appear at random positions near spawn point,
then slide and rotate into place to form the impossible triangle over 0.4s.
Each bar has a different delay (0s, 0.1s, 0.2s) creating a staggered assembly.
Connection points flash pink on joining.

**Living Shader Effect:**
The "impossible" overlap regions cycle their draw order — the bar that appears
to be "in front" shifts every 0.8s, creating a looping impossible rotation
effect. The overlapping junction zones glow brighter violet. The whole shape
wobbles subtly as if the geometry is unstable.

**Novel Mechanic — Spatial Skip:**
Every 4-5 seconds, the Penrose emits a brief violet flash and **teleports**
10-80px in a random direction (with a preference toward the player). A ghost
afterimage lingers at the old position for 0.3s. This makes it unpredictable
and hard to track. The teleport is telegraphed by the shape vibrating
intensely for 0.5s beforehand.

**On Death:**
The three bars disconnect and fly apart in different directions, each tumbling
with rotation. Violet energy crackles between the separating pieces (lightning-
bolt line segments) before all three bars dissolve into particles.

**Death Animation:**
Disassembly (0.2s bars separate) then electrical discharge (0.15s crackling
lines) then particle dissolve (0.3s).

---

## 5. MengerDust — Menger Sponge Cross-Section

**Shape:** 2D cross-section of a Menger sponge — a square with a recursive
grid of square holes cut out of it (like a square Sierpinski carpet). Rendered
at depth 2: a large square with 8 smaller filled squares arranged in a ring
(center removed), each of those with the same pattern.

| Property | Value |
|---|---|
| Color | Burnt orange (#FF6600) / Brown (#993300) |
| HP | 5 |
| Speed | 0.06 px/ms (very slow) |
| Score | 3,200 |
| Collision Radius | 50 px |
| Behavior | Slow march toward player; absorbs bullets |

**Spawn Animation:**
A solid square appears, then square holes "punch out" from center outward over
0.6s — each hole removal accompanied by a small orange flash and outward
particle puff. The recursive pattern carves itself into existence level by
level.

**Living Shader Effect:**
The square holes flicker with inner darkness — negative-space "anti-glow" where
the holes appear darker than the background. The filled regions pulse with a
brick-like heat pattern, shifting from orange to cherry red in slow waves.
Occasionally a tiny ember particle drifts up from the shape.

**Novel Mechanic — Bullet Sponge:**
First 3 bullets that hit are "absorbed" (no damage). Each absorbed bullet
causes one of the outer square cells to glow white-hot. After absorbing 3
bullets, the MengerDust becomes **overloaded** — it glows bright white for 1s
and is vulnerable (normal damage applies). If not destroyed during the
overload window, it resets and can absorb 3 more. Visual: absorbed bullets
sink into the holes with a particle suction effect.

**On Death:**
Each sub-square separates and drifts apart with individual rotation, then each
sub-square itself breaks into its own sub-squares (one level of recursive
separation), then all fragments disintegrate into ember particles.

**Death Animation:**
Two-stage fractal breakup (0.3s large squares separate, 0.3s sub-squares
separate) then ember dissolve (0.4s).

---

## 6. HyperbolicDisc — Poincare Disk

**Shape:** A circle filled with a hyperbolic tiling pattern — triangles or
quadrilaterals that shrink toward the boundary, rendered as increasingly dense
concentric line patterns near the edge (approximating the Poincare disk model
of hyperbolic geometry).

| Property | Value |
|---|---|
| Color | Deep blue (#0044FF) / Indigo (#1A0066) |
| HP | 3 |
| Speed | 0.10 px/ms |
| Score | 2,000 |
| Collision Radius | 40 px |
| Behavior | Follows player; warps space around it |

**Spawn Animation:**
A point expands into a circle. As it grows, the internal hyperbolic tiling
"generates" from the center outward — lines branch and subdivide toward the
boundary. Takes 0.5s. The boundary snaps into place last with a blue flash.

**Living Shader Effect:**
The internal tiling pattern slowly rotates (hyperbolic rotation — inner tiles
move faster than outer ones, opposite of normal rotation). Tiles near the
boundary shimmer with indigo light. A soft glow emanates from the disk edge
that warps nearby grid lines more strongly than other enemies.

**Novel Mechanic — Space Warp:**
Within 150px of the HyperbolicDisc, bullet trajectories **curve** toward its
center (gravitational lensing). Bullets aren't destroyed but their velocity
vectors are bent. This creates a "dead zone" where shooting straight at it
won't work — the player must aim offset to compensate, or get close enough that
the curve is negligible. Grid warp effect is 3x stronger than normal enemies
within its influence radius.

**On Death:**
The disk boundary cracks (fracture lines appear), then the hyperbolic tiling
collapses inward — all the internal lines rush toward center as if falling
into a singularity. Brief implosion pause, then a burst of indigo particles
explodes outward.

**Death Animation:**
Boundary fracture (0.15s) then implosion (0.25s) then burst (0.2s). The grid
snaps back violently when the warp field collapses.

---

## 7. FibSpiral — Golden Ratio Spiral

**Shape:** A Fibonacci/golden spiral rendered as a continuous curved line that
spirals outward from a central point through ~3 full rotations. Small golden
circles mark the Fibonacci number positions along the curve (1, 1, 2, 3, 5, 8
pixels from center).

| Property | Value |
|---|---|
| Color | Gold-green (#AAFF00) / Dark lime (#558800) |
| HP | 1 |
| Speed | 0.22 px/ms (fast) |
| Score | 600 |
| Collision Radius | 28 px |
| Behavior | Spirals toward player in golden-ratio curves |

**Spawn Animation:**
The spiral draws itself from center outward like a pen stroke — the line
extends rapidly through each rotation with golden dots popping into place at
Fibonacci positions. Takes 0.3s. Final dot placement triggers a small radial
pulse.

**Living Shader Effect:**
The spiral slowly rotates while the Fibonacci dots pulse in sequence (1 dot
lights up, then the next, cascading outward along the spiral). The spiral line
itself has a traveling glow — a bright segment that flows from center to tip
continuously. The overall shape leaves a faint spiral afterimage trail as it
moves.

**Novel Mechanic — Spiral Movement:**
Instead of moving in a straight line toward the player, the FibSpiral follows
a logarithmic spiral path — it orbits around the player in tightening circles.
Each orbit is ~61.8% the radius of the last (golden ratio). This makes it
hard to hit as it corkscrews inward. If it completes 3 full orbits without
being killed, it dashes straight at the player.

**On Death:**
The spiral unwinds — the line retracts from tip back to center rapidly, each
Fibonacci dot popping with a green flash as the line passes through it. Then
the center point bursts into a sunflower pattern of particles (arranged in
Fibonacci spiral arms).

**Death Animation:**
Rapid spiral retraction (0.2s) then Fibonacci sunflower burst (0.3s) —
particles arranged in two counter-rotating spiral arms.

---

## 8. Tesseract — 4D Hypercube Projection

**Shape:** A 2D wireframe projection of a tesseract (4D hypercube) — two
nested squares connected at their vertices by diagonal lines, creating the
classic "cube within a cube" wireframe. The inner and outer squares slowly
counter-rotate to simulate 4D rotation projected into 2D.

| Property | Value |
|---|---|
| Color | Electric purple (#AA00FF) / Neon magenta (#FF00AA) |
| HP | 4 |
| Speed | 0.09 px/ms |
| Score | 2,800 |
| Collision Radius | 42 px |
| Behavior | Slow pursuit; phases between dimensions |

**Spawn Animation:**
The inner square appears first (small, bright), then the outer square expands
outward from it over 0.4s. The connecting diagonal lines snap into place one
at a time (4 lines, 0.1s apart) with purple electrical arcs along each new
connection. Final connection triggers a shockwave ring.

**Living Shader Effect:**
The inner and outer squares continuously counter-rotate (inner clockwise,
outer counter-clockwise), and the connecting lines stretch and skew to follow.
The rotation speed oscillates — sometimes fast, sometimes slow — simulating
different "viewing angles" of a 4D rotation. The connecting lines shimmer
between purple and magenta. Vertices glow with small halos.

**Novel Mechanic — Dimensional Phase:**
Every 6 seconds, the Tesseract "rotates through the 4th dimension": the inner
square smoothly expands to become the outer square while the outer shrinks to
become the inner (a smooth swap animation over 0.8s). During this transition,
the Tesseract's collision box is **halved** (harder to hit), and it moves at
2x speed. After the transition, it returns to normal. Visual: the shape
becomes translucent during the phase, with the connecting lines flickering
rapidly.

**On Death:**
The 4D projection collapses — both squares try to occupy the same space,
vibrating violently. The connecting lines snap one by one (each snap sprays
particles along the line direction). Then both overlapping squares explode
outward as 8 individual line segments tumbling in different directions.

**Death Animation:**
Convergence (0.2s squares merge) then line snaps (0.2s four snaps) then
segment scatter (0.3s).

---

## 9. Mandelbrot — Fractal Cardioid

**Shape:** The main cardioid bulb of the Mandelbrot set — a heart/kidney
shape rendered as a smooth curved line loop, with a smaller circular bulb
attached (the period-2 bulb). Tiny fractal bumps decorate the boundary
(approximated with extra vertices on the perimeter).

| Property | Value |
|---|---|
| Color | Deep red (#CC0000) / Black-red (#440000) |
| HP | 6 |
| Speed | 0.04 px/ms (very slow, boss-tier) |
| Score | 4,000 |
| Collision Radius | 55 px |
| Behavior | Stationary; periodically spawns minions |

**Spawn Animation:**
A single bright red point appears, then the cardioid boundary "computes"
itself — vertices appear one at a time in rapid succession as if being plotted
by an algorithm, tracing the Mandelbrot boundary. Small fractal offshoots grow
from the main cardioid. Takes 0.8s. Each new vertex pulses red briefly.

**Living Shader Effect:**
The boundary continuously "iterates" — small fractal tendrils grow and retract
along the perimeter in waves, as if the set is being computed at increasing
depth in real time. The interior pulses with a deep red-to-black gradient.
The small period-2 bulb orbits slowly around the main cardioid. Faint red
mist particles emanate from the boundary.

**Novel Mechanic — Fractal Spawner:**
Every 5 seconds, a small fractal bud on the boundary "pinches off" and becomes
a **MiniMandel** minion — a tiny simplified cardioid (1 HP, fast, follows
player, worth 150 points). The Mandelbrot can have at most 4 active MiniMandels
at a time. Each spawn reduces a visible bud from the parent shape. When all
buds are spent, the Mandelbrot stops spawning until a MiniMandel is killed
(which regrows a bud over 3s).

**On Death:**
The cardioid boundary destabilizes — fractal tendrils grow wildly and
uncontrollably from all edges (rapid vertex addition), the shape becomes
increasingly complex and jagged over 0.4s, then the entire over-iterated
shape shatters into hundreds of tiny red point-particles that scatter in all
directions. Any living MiniMandels also explode.

**Death Animation:**
Fractal overload (0.4s — shape grows increasingly complex) then point-scatter
(0.3s — all vertices become individual particles).

---

## 10. Klein — Klein Bottle Cross-Section

**Shape:** 2D representation of a Klein bottle — rendered as two overlapping
circles that share an "inside-out" passage: one circle drawn normally and the
other drawn with a dashed line where it "passes through" the first, creating
the illusion of a non-orientable surface. Small arrows along the curves
indicate the paradoxical surface direction.

| Property | Value |
|---|---|
| Color | Seafoam (#00FFAA) / Dark cyan (#006644) |
| HP | 3 |
| Speed | 0.13 px/ms |
| Score | 1,800 |
| Collision Radius | 36 px |
| Behavior | Follows player; reverses bullet direction |

**Spawn Animation:**
A single circle draws itself, then a second circle "pushes through" the first
(animating the intersection with a self-intersection flash). The dashed
passage section draws last. Arrow indicators fade in along the curves. Takes
0.5s.

**Living Shader Effect:**
The arrows continuously animate along the curves (flowing around both loops),
showing the non-orientable surface flow. Where the two circles intersect, a
bright seafoam glow pulses. The dashed "through" section alternates: sometimes
the dash pattern is on circle A and solid on B, then they swap — creating an
ambiguous depth illusion that oscillates. A faint particle stream follows the
arrow flow path.

**Novel Mechanic — Topology Reflect:**
Bullets that enter the Klein's collision radius from certain angles don't
damage it — instead they are **redirected 180 degrees** and sent back toward
the player (becoming hostile projectiles colored seafoam). The "safe" angles to
shoot rotate with the Klein's arrow-flow animation. A visual indicator shows
the current safe firing arc: a subtle bright wedge (90 degrees wide) on the
Klein's perimeter that represents the vulnerable angle. The player must
position themselves within this arc to deal damage.

**On Death:**
The two circles separate and try to "un-intersect" — they slide apart but
remain connected by stretching tendrils. The tendrils snap one by one (each
snap releases particles), then both circles collapse into points and vanish
with a green flash.

**Death Animation:**
Circle separation (0.2s) then tendril stretch and snap (0.3s) then twin
point-collapse (0.15s).

---

## Summary Table

| # | Enemy | Shape Source | HP | Speed | Score | Key Mechanic |
|---|---|---|---|---|---|---|
| 1 | **Sierpinski** | Sierpinski triangle | 3 | 0.08 | 2,400 | Fractal breakup on hit; spawns Shards |
| 2 | **Mobius** | Mobius strip | 2 | 0.18 | 900 | Phase-shifts immune every orbit |
| 3 | **Koch** | Koch snowflake | 2 | 0.12 | 1,200 | Leaves slowing ice trails |
| 4 | **Penrose** | Impossible triangle | 2 | 0.14 | 1,500 | Teleports short distances |
| 5 | **MengerDust** | Menger sponge slice | 5 | 0.06 | 3,200 | Absorbs first 3 bullets; overload window |
| 6 | **HyperbolicDisc** | Poincare disk | 3 | 0.10 | 2,000 | Curves nearby bullet paths |
| 7 | **FibSpiral** | Fibonacci spiral | 1 | 0.22 | 600 | Spirals inward in golden-ratio orbits |
| 8 | **Tesseract** | 4D hypercube | 4 | 0.09 | 2,800 | Phases dimensions; shrinks hitbox |
| 9 | **Mandelbrot** | Mandelbrot cardioid | 6 | 0.04 | 4,000 | Spawns MiniMandel minions |
| 10 | **Klein** | Klein bottle | 3 | 0.13 | 1,800 | Reflects bullets from wrong angles |

## Suggested Wave Integration

| Phase | New Enemies Added |
|---|---|
| Tutorial (0-30s) | — (no change) |
| Ramp-up (30-120s) | FibSpiral, Mobius |
| Midgame (120-240s) | Koch, Penrose, Sierpinski |
| Intense (240-420s) | Tesseract, Klein, HyperbolicDisc |
| Chaos (420s+) | MengerDust, Mandelbrot (boss-tier) |
