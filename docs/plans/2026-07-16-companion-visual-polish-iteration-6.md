# Companion Classroom Visual Polish Iteration 6

## Goal

Make the classroom feel like a shared table-top learning scene rather than a background image with floating avatars. The six PBL companions should read as classmates seated at distinct workstations, with their responsibility communicated through a restrained prop, posture, and low-frequency motion.

## Selected visual direction

Use a warm editorial classroom diorama: daylight, wood, paper, chalk dust, translucent paint-like surfaces, and small physical desk objects. The composition should preserve the classroom as the dominant surface. The brief, notes rail, and composer remain lightweight overlays; they should frame the scene without becoming the scene.

The character system remains project-owned inline SVG because it is the most controllable option for truthful state-driven animation and avoids mixing unrelated open-source styles. This iteration adds depth and role cues to the existing illustrations instead of importing a third-party roster.

## Presentation contract

- Every companion receives one station treatment tied to its role activity: book, idea cards, magnifier, checklist, review screen, or notebook.
- Station surfaces must sit behind the figure and align with the existing classroom perspective; they must not become opaque cards.
- `idle`, `preparing`, `speaking`, `waiting`, and `completed` remain the only runtime inputs. New DOM attributes are presentation-only.
- Motion remains low frequency and pauses under reduced-motion preferences and waiting state.
- Focus, selection, and speaking continue to use contrast and halo changes rather than layout jumps.

## Implementation tasks

1. Add a reusable workstation layer to `CompanionFigure` with a desk plane, edge, legs, and one role-specific physical prop.
2. Refine `CompanionIllustration` with face depth, collar/seam details, hand cuffs, and role-specific accessories while preserving the six existing identities.
3. Add station-specific motion choreography: page lift, idea-card drift, scanning lens, checklist stroke, screen glow, and note-taking sway.
4. Add a subtle scene grain and desk-light treatment so the agents feel lit by the classroom instead of pasted over it.
5. Verify desktop and mobile spacing, selected/speaking states, reduced-motion selectors, and no semantic/runtime changes.

## Acceptance checks

- At 1280px, each visible companion is visually grounded by a workstation and the classroom remains dominant.
- At 390px, station details reduce without horizontal overflow or obscuring the rail/composer.
- The six role labels and actual runtime state mapping remain unchanged.
- Targeted tests, TypeScript, lint, and production build pass.
