# Death by Geometry Audio and Game Feel Review

## Method Note

This review uses the `game-audio` and `game-designer` lenses together. It is grounded in the current implementation, asset inventory, and timing/feedback wiring across [web/src/core/audio.ts](/Users/sam/src/geometry-genocide/web/src/core/audio.ts), [web/src/game.ts](/Users/sam/src/geometry-genocide/web/src/game.ts), [web/src/core/haptics.ts](/Users/sam/src/geometry-genocide/web/src/core/haptics.ts), and `sounds/`. I can verify system design, event coverage, asset presence, and timing relationships from the repo. I cannot directly audition playback here, so comments about timbre and mix are based on implementation and file inventory rather than human ear-checking.

## Overall Verdict

The game’s **feedback architecture is stronger than its current audio content pass**. The code already treats combat as a layered event made of hitstop, shake, explosions, trails, haptics, kill-signature VFX, and matching audio triggers, which is the right foundation for satisfying arcade feel. The main issue is that the audio layer is still incomplete and somewhat under-authored relative to the visual/game-feel layer: there is adaptive music, but not a full state-based score; there are family kill signatures, but only for a subset of enemies; and the configured SFX set implies a richer audio taxonomy than the shipped assets actually provide.

## Key Findings

### 1. The game-feel stack is well structured and already understands “juice”

From a `game-designer` perspective, the most important thing is that the game does not treat a kill as a single event. Kills trigger a compound response in [web/src/game.ts](/Users/sam/src/geometry-genocide/web/src/game.ts#L677): family-specific kill signature VFX, family-specific kill audio, explosion tuning, grid impulse, screen shake, haptics, and optional hitstop. That is exactly the right architecture for repetition-heavy arcade action because it creates layered reinforcement instead of relying on one flashy effect. The same principle is visible in death/respawn handling, where explosions, slow motion, shockwave expansion, shake, sound, and haptics are bundled into one authored beat in [web/src/game.ts](/Users/sam/src/geometry-genocide/web/src/game.ts#L1184).

### 2. The procedural music system is directionally right but dramatically narrow

The procedural score is a solid foundation: four layers, intensity ramping, and dynamic tempo from combat pressure in [web/src/core/audio.ts](/Users/sam/src/geometry-genocide/web/src/core/audio.ts#L396) and [web/src/game.ts](/Users/sam/src/geometry-genocide/web/src/game.ts#L364). That aligns well with `game-audio` guidance for vertical layering. The problem is that the state response is still mostly **one continuous combat-minded synth bed**. Music starts when the run starts and stops on death in [web/src/game.ts](/Users/sam/src/geometry-genocide/web/src/game.ts#L359) and [web/src/game.ts](/Users/sam/src/geometry-genocide/web/src/game.ts#L1224), but there is no distinct menu theme, game-over cue, recovery state, or low-health behavior. The system has intensity, but not enough **dramatic contrast**.

### 3. Enemy-family audio identity exists, but only partially

The custom kill signatures are one of the most promising parts of the current audio direction. Rhombus, square, pinwheel, and Sierpinski each get a bespoke procedural identity in [web/src/core/audio.ts](/Users/sam/src/geometry-genocide/web/src/core/audio.ts#L116), and the intended direction is reinforced by the review-only preview assets documented in [sounds/kill-signature-previews/README.md](/Users/sam/src/geometry-genocide/sounds/kill-signature-previews/README.md). That is good art direction: the sounds are meant to express enemy material and behavior, not just mark damage. The weakness is scope. Large portions of the enemy roster still fall back to generic handling, so the system currently communicates “some enemies are authored” rather than “the whole ecosystem has sonic personality.”

### 4. There is a real content gap between configured SFX and shipped SFX

The audio config declares a richer set of spawn/variant sounds in [web/src/config.ts](/Users/sam/src/geometry-genocide/web/src/config.ts#L281), including `_high`, `_low`, `_swarm`, and `gameover` variants, but those files are not present in `sounds/`. That means `loadAllSFX()` in [web/src/core/audio.ts](/Users/sam/src/geometry-genocide/web/src/core/audio.ts#L67) will attempt to fetch assets that do not exist and warn for them. This is not just cleanup debt; it affects the credibility of the audio system. Right now the code advertises a fuller taxonomy than the content supports.

### 5. The mix hierarchy is simple and workable, but not yet production-safe

The gain structure is clear and sane: `master -> sfx/music` with separate levels in [web/src/core/audio.ts](/Users/sam/src/geometry-genocide/web/src/core/audio.ts#L34), and the base volumes in [web/src/config.ts](/Users/sam/src/geometry-genocide/web/src/config.ts#L293) are conservative enough to avoid obvious overdesign. But there is no ducking, no event prioritization, no concurrency limiting, and no variation system for repeated one-shots. In an arcade shooter, that matters. The `game-audio` anti-pattern here is repetition fatigue: the same spawn and crash sounds will stack frequently, and nothing in the current system shapes the mix when many events collide.

### 6. The feedback loop is strongest on major events, weaker on basic player actions

The game invests heavily in big beats: elite arrivals, black-hole deaths, player death, phase transitions, and kill families all get authored support. That is good. But from a moment-to-moment `game-designer` lens, the most repeated verbs also need to feel excellent at the thousandth repetition. Shooting itself is visually satisfying, but the repo pass here is more focused on enemy spawn/kill/death than on a fully sculpted **player attack loop**. The result is that the game probably spikes hardest on major events, while the “every second” feel may rely more on visuals than on audio.

### 7. Audio and haptics are aligned better than audio and UI state

The haptics layer in [web/src/core/haptics.ts](/Users/sam/src/geometry-genocide/web/src/core/haptics.ts#L19) mirrors the major impact tiers well: light, medium, heavy, death, warning, absorb, respawn. That supports feel. By contrast, the UI/meta layer has very little sonic presence. There is mute handling, but not much evidence of button, menu, settings, or state-confirmation feedback. The game sounds like a combat system, not yet like a full product.

## What To Preserve

- Keep the current philosophy of **multi-channel feedback per event**: VFX, shake, hitstop, haptics, and sound should remain linked.
- Keep adaptive music intensity as the backbone; it is the right fit for an endless-wave arcade game.
- Keep family-specific kill signatures and expand them rather than collapsing back to generic explosions.
- Keep the black-hole death treatment as the benchmark for audiovisual payoff. It has the right scale and event drama.

## Recommended Changes

### 1. Complete the audio content map before adding more systems

The highest-priority fix is to align code and assets. Either ship the missing configured sounds or remove dead references from [web/src/config.ts](/Users/sam/src/geometry-genocide/web/src/config.ts#L281). Right now the audio layer looks broader than it is.

### 2. Add horizontal music states, not just vertical intensity

Keep the layered synthwave core, but add distinct states:
- Menu: calmer, more spacious, identity-setting loop
- Early run: restrained version of combat bed
- High threat: current fuller intensity behavior
- Death/game over: short stinger plus aftermath state

This would give the run an authored emotional arc instead of one long intensity slope.

### 3. Expand the “most repeated verb” audio set

Prioritize the sounds players hear constantly:
- shooting
- bullet impact confirmation
- near-miss or danger signaling
- enemy pressure cues

If these are already present in-browser and not obvious from repo structure, they still need ear-level review. If they are not present, they should come before more exotic event content.

### 4. Introduce mix control for crowded moments

Add at least lightweight protections:
- SFX cooldown or voice limiting for spammy events
- brief music ducking on major explosions/death
- slight pitch or filter variation on repeated one-shots

Without this, late-game chaos risks becoming a flat wall of triggers instead of readable escalation.

### 5. Promote UI and state audio from “minimal” to “authored”

The visual build now has enough identity that menu open, start, settings interaction, phase arrival, low-life warning, and game-over presentation should all feel intentional. The combat layer is already on that path; the meta layer is not.

## Bottom Line

The game already understands how to build satisfying arcade feedback. The biggest win now is not inventing a new audio system; it is **finishing and curating the existing one** so the soundscape matches the strength of the visuals and the underlying game-feel design.
