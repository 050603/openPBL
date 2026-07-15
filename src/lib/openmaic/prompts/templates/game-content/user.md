Create an educational GAME widget for: {{title}}

## Game Type

{{gameType}}

## Description

{{description}}

## Key Points

{{keyPoints}}

## Scoring Configuration

{{scoring}}

## Language

{{pblContext}}

{{languageDirective}}

---

Generate a FUN, INTERACTIVE HTML game with these MANDATORY features:

### Knowledge Teaching (CRITICAL — students must LEARN, not just play)
1. **Objective Alignment**: Map every supplied Key Point to a decision, rule, variable, or strategy that the player must use. State the learning objective and success evidence before play; never add unrelated trivia for variety.
2. **No Decorative Interaction**: The winning strategy must require the student to predict, apply, observe, explain, or revise the target knowledge. Speed, random rewards, points, and animations may increase engagement but must not allow success without understanding.
3. **Teaching Loop**: Use a brief worked round, ask for a prediction or plan, let the learner act, make the consequence visible, then pause for a concise explanation and a chance to revise. Increase difficulty by requiring deeper application, not faster clicking.
4. **Explanatory Feedback**: After meaningful actions and all success/failure states, explain what happened and why using the player's actual choice and the relevant Key Point. Diagnose likely misconceptions and give a targeted hint instead of only adding or subtracting score.
5. **Fair Assessment**: Separate knowledge errors from motor/timing errors. If dexterity is not itself an objective, provide forgiving controls and do not let reaction speed determine the learning result.
6. **Mastery Evidence**: End with a transfer challenge that changes the context or parameters. Record the player's strategy and explanation, evaluate them against visible success criteria, and show which Key Points were demonstrated; game completion alone is not mastery.

### Activity Completion Protocol (MANDATORY)
1. Call `window.__maicActivity.complete()` exactly when the learner has produced the required mastery evidence and the feedback is visible. Also add `data-activity-complete` to the final completion control when one exists.
2. Call `window.__maicActivity.reset()` whenever a replay/restart invalidates that evidence; add `data-activity-reset` to the reset control.
3. Do not signal completion for starting the game, winning by score alone, finishing an animation, or any decorative interaction. Completion must mean the transfer challenge and explanation meet the visible success criteria.

### Game Design (CRITICAL - NOT A QUIZ!)
1. **Interactive gameplay**: Player MUST control something meaningful (NOT just click answers)
2. **Real game mechanics**: Timing, aiming, dragging, balancing, catching, or building
3. **Skill-based success**: Outcome depends on player action, not just correct answer
4. **Engaging feedback**: Animations, sounds, visual effects for actions

### Preferred Game Types (in order of preference)
1. **Physics/Action**: Control parameters to achieve a goal (land safely, hit target, balance)
2. **Timing/Aim**: Click at right moment or adjust aim to succeed
3. **Drag-and-drop**: Sort, arrange, or build by dragging elements
4. **Simulation game**: Let player experiment with variables to find solution
5. **Card/Match**: Memory or matching games
6. **Quiz**: ONLY as last resort - make it visually interesting

### Simulation Integration (if game has visual simulation)
- Simulation MUST be interactive (player controls something)
- Simulation physics MUST match what player is learning
- Visual feedback MUST show player's progress toward goal
- Example: Don't ask "What thrust?" → LET PLAYER ADJUST thrust and see result!

### Game Elements
1. **Clear objective**: "Land safely", "Hit the target", "Sort correctly"
2. **Player controls**: Sliders, buttons, drag areas, or click targets
3. **Real-time feedback**: Score, progress bar, visual indicators
4. **Levels or challenges**: Progressive difficulty
5. **Achievement system**: Unlockable badges for accomplishments
6. **Replay value**: Random elements or multiple solutions

### Visual Design
1. Attractive theme matching the subject
2. Clear UI for controls and feedback
3. Animations for success/failure
4. Responsive layout (mobile + desktop)

### Technical (MANDATORY)
1. **Inline onclick for start button**: `<button onclick="startGame()">开始</button>` - NOT addEventListener
2. **Custom CSS preferred**: Avoid Tailwind `@layer utilities` blocks; use plain CSS
3. **DOMContentLoaded wrapper**: Wrap game code in `document.addEventListener('DOMContentLoaded', ...)`
4. **Global start function**: `function startGame()` must be callable from onclick
5. Embedded `<script type="application/json" id="widget-config">`
6. `requestAnimationFrame` for smooth animations
7. Touch-friendly controls (min 44px touch targets)
8. localStorage for progress/high scores
9. Pause functionality

### Output
Return ONLY the HTML document. Make the game FUN enough that students want to play again — but ensure they LEARN the key concepts while playing!
