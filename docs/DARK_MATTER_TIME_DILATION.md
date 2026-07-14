# Dark Matter Time Dilation

## Pitch

The player can steal Dark Matter by flying dangerously close to a Black Hole, then hold the time-dilation action to slow the entire universe. The mechanic turns the Black Hole's gravitational time dilation into a repeatable risk/reward loop:

> Approach danger -> harvest Dark Matter -> bend time -> escape or fight with more thinking time -> return to danger.

The ability is not an enemies-only debuff. The player, enemies, bullets, gravity, effects, spawning, and music all slow together. The advantage is that the human player retains real-world reaction and aiming time while the simulation advances slowly.

## Controls

- Desktop: hold **Space** while playing.
- Mobile: hold a dedicated **TIME** touch target positioned above the right virtual joystick. It must be at least 44x44 CSS pixels, provide pressed feedback, and coexist with both joystick touches.
- Releasing the action exits slow motion early.
- The ability may activate only while the game is actively playing, the player has at least the minimum charge, and the game is not paused, in hitstop, or in the death-slow-motion sequence.
- Space retains its existing lab-specific functions outside normal gameplay.

The input layer should expose an action such as `isTimeDilationHeld()` rather than making gameplay code depend directly on `Space` or a particular touch region.

## Resource Model

Dark Matter is scoped to the current run and resets to zero when a new run begins.

Initial tuning values:

| Parameter | Initial value |
|---|---:|
| Capacity | 100 |
| Minimum activation charge | 10 |
| Full-meter duration | 5 seconds of real time |
| Drain | 20 units per real second |
| Active time scale | 0.28x |
| Entry ramp | 180ms real time |
| Exit ramp | 400ms real time |

Drain and transition ramps use unscaled real delta time. This prevents slow motion from extending its own duration.

Dark Matter does not recharge while time dilation is active. Releasing and re-engaging is allowed once the meter remains above the minimum activation threshold. Reaching zero automatically begins the exit ramp and prevents reactivation until the minimum charge has been earned again.

## Harvesting Dark Matter

Dark Matter is harvested only from active, fully spawned Black Holes. Spawn telegraphs, inactive holes, and overloaded holes that have already detonated do not provide charge.

Harvest range uses the Black Hole's existing attraction radius, so the mechanic's visible and mechanical danger zones agree:

- Outside the attraction radius: no charge.
- At the outer edge: a faint trickle.
- Inside the inescapable core: rapid charge.
- Close to the event horizon: maximum charge.

Recommended initial curve for the nearest eligible Black Hole:

```text
proximity = clamp(1 - distance / attractRadius, 0, 1)
chargePerSecond = lerp(2, 28, proximity ^ 1.75)
```

Use real delta time for harvesting. If multiple Black Holes overlap, select the strongest individual contribution and add no more than a 1.5x multi-hole bonus. This keeps spectacular multi-hole encounters rewarding without allowing linear stacking.

The HUD and ship should receive subtle inward-flowing particles while harvesting. Entering the strong gravity core should produce a brighter pulse so players learn where the best return—and greatest danger—begins.

## Time-Dilation Simulation

Time dilation is implemented as a smoothly changing gameplay time scale within the normal `playing` state. It must not reuse the `death_slowmo` state, because that state intentionally bypasses most of the live game loop.

The scaled delta drives:

- Player movement, recoil, weapon cadence, and bullets
- Wingman movement and firing
- Enemy AI, movement, spawn animations, and separation
- Black Hole gravity, absorption, destabilization, and supernova timing
- Wave scheduling, formations, bosses, and phase progression
- Collisions and combat-system timers
- Explosions, debris, trails, dust, grid springs, starfield movement, and camera motion
- Screen shake and other world-space feedback

The following stay on unscaled real time:

- Keyboard, mouse, and touch sampling
- Mouse/touch aim position
- Dark Matter harvesting and drain
- Entry/exit interpolation
- HUD rendering and its resource feedback
- Entry and exit transition sounds
- Pause and visibility handling

Game time and survival/phase timers advance by scaled time. Hitstop remains a discrete freeze and takes precedence over time dilation.

## Audio Direction

Time dilation must audibly affect the whole world, not merely lower the music volume.

### Entry: gravitational fall

Play once when the entry ramp begins:

- A large sub-bass plunge
- A descending metallic or spectral whoosh
- A short low impact synchronized with reaching the target time scale
- A subtle high-frequency roll-off as the world becomes heavy and submerged

### Sustained slow motion

- Procedural music tempo and oscillator pitch follow the current time scale.
- Rhythm, arpeggio, and lead scheduling slow without resetting their musical position.
- World SFX created during slow motion inherit the current time/pitch treatment where practical.
- Player-critical transition feedback remains clear above the slowed mix.

### Exit: reality wind-up

Play once when release or depletion begins:

- A reversed rising whoosh
- A tape-spool or turbine-like acceleration layer
- Pitch and tempo rise with the time-scale ramp
- A crisp snap lands when the simulation returns to 1x

Entry and exit stingers run on the audio context's real clock and are not themselves slowed. Rapid presses must not stack transition sounds; a transition can reverse cleanly but each direction fires at most once per crossing.

The implementation may synthesize these sounds with Web Audio. If rendered assets are later generated, preserve these envelope and mix roles.

## HUD and Visual Language

Draw a compact bottom-center meter on the existing HUD canvas:

```text
DARK MATTER  [SPACE]
[==============      ]
```

- Near-black interior with violet, cyan, and white gravitational highlights
- Clear fill level at all viewport sizes
- Keyboard label on desktop; **HOLD TIME** or a touch icon on mobile
- Inward-moving fill pulse while harvesting
- Drain from both ends toward the center during time dilation
- Brief insufficient-charge flash when activation is attempted below the threshold
- Collapse to a thin central point at depletion as the exit sound begins

During time dilation, add restrained full-screen feedback that survives gameplay chaos:

- Darkened edge vignette
- Subtle chromatic separation or spectral rim
- Slower bloom breathing and visibly stretched particles/trails
- A short contraction pulse on entry and expansion pulse on exit

Effects must not hide enemies, bullets, the player, or Black Hole danger telegraphs.

## Edge Cases

- New run, respawn, game over, and return to menu cancel time dilation and restore audio to 1x.
- Pausing freezes the scaled simulation but must not silently drain the meter.
- Muting during time dilation remains muted; unmuting restores the correct current time treatment.
- Losing focus/visibility must not drain the meter or leave music permanently slowed.
- Death while the ability is held transitions cleanly into the existing death slow motion without playing an inappropriate wind-up stinger.
- Bot control must never accidentally activate the ability until the observation/action model explicitly supports it.
- The headless simulation should default the action to false and remain compatible.

## Architecture Guidance

- Put every tuning value in the appropriate `web/src/config/` domain and re-export through `config.ts`.
- Prefer a focused `TimeDilationSystem` that owns charge, harvesting, transition state, and time-scale calculation. `Game` should orchestrate it and provide nearby Black Holes, input state, audio callbacks, and HUD data.
- Keep resource mutation out of the HUD.
- Extend `AudioManager`/`ProceduralMusic` with an explicit time-scale API rather than reaching into audio nodes from `Game`.
- Expose read-only feature state through the existing `window.game` test surface, such as current charge, current time scale, harvesting state, and active state.

## Acceptance Criteria

1. A new run starts with zero Dark Matter.
2. Approaching an active Black Hole fills the meter faster as distance decreases.
3. Holding Space below the minimum charge does not activate and produces readable HUD feedback.
4. Holding Space with sufficient charge ramps the full simulation to approximately 0.28x.
5. The meter drains by real time and cannot recharge while active.
6. Releasing Space ramps smoothly back to 1x; depletion does the same automatically.
7. Music audibly slows in tempo and pitch, with one falling entry sound and one winding exit sound.
8. HUD, raw aiming, pause handling, and transition sounds remain responsive in real time.
9. Desktop and mobile controls both activate and release the ability reliably.
10. Death, restart, pause, mute, and visibility transitions cannot leave gameplay or music stuck at a non-1x scale.
11. Existing death slow motion still behaves correctly.
12. TypeScript checking and production build succeed.
13. A Playwright flow verifies harvesting, activation, real-time drain, release/depletion, and reset behavior through deterministic test hooks.
