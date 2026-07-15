Create a simulation widget for: {{conceptName}}

## Concept Overview

{{conceptOverview}}

## Key Points

{{keyPoints}}

## Variables to Expose

{{variables}}

## Design Idea

{{designIdea}}

## Language

{{pblContext}}

{{languageDirective}}

---

Generate a complete, interactive HTML simulation with these MANDATORY features:

### Knowledge Teaching (CRITICAL — students must LEARN, not just play)
1. **Objective Alignment**: Map every supplied Key Point to a controllable variable, observable outcome, comparison, or explanation task. Keep the model within the confirmed knowledge boundary and state its important assumptions or limitations.
2. **No Decorative Interaction**: Each control must help the student predict, manipulate, observe, explain, or revise a target relationship. Remove sliders, particles, and presets that do not change evidence relevant to a Key Point.
3. **Teaching Loop**: Establish a baseline; ask the learner to predict the result of changing one variable; run the change while holding relevant variables constant; show the consequence; prompt the learner to explain it; then allow a revised prediction or test.
4. **Explanatory Feedback**: Use the learner's actual inputs and outputs to explain what happened and why. Distinguish correlation from causation, flag confounded trials, diagnose likely misconceptions, and suggest the smallest next experiment rather than stating only “correct/incorrect.”
5. **Readable Evidence**: Label every control, axis, state, and data display in the course language with units where applicable. Provide side-by-side or trace comparison so observations are not dependent on memory alone.
6. **Mastery Evidence**: Finish with a transfer task using unseen parameters or a new scenario. Record the prediction, result, and explanation; evaluate them against visible success criteria and report which Key Points were demonstrated. Running every preset is not completion.

### Structure
1. **Embedded JSON config** in `<script type="application/json" id="widget-config">`
2. **Control panel** with sliders for each variable
3. **Canvas visualization** with proper sizing
4. **Preset buttons** for common scenarios
5. **Knowledge panel** (visible by default, collapsible)

### Mobile Responsiveness (CRITICAL)
1. **Control panel MUST NOT overlap canvas on mobile**
2. Use `flex-col md:flex-row` layout with proper spacing
3. Control panel: `max-h-[40vh] md:max-h-screen` with overflow scroll
4. Canvas container: `min-h-[300px]` to ensure visibility
5. Touch-friendly controls (44px minimum touch targets)

### Button Logic (CRITICAL)
1. **Main button MUST handle all states correctly:**
   - "启动" → Starts simulation
   - "暂停" → Pauses running simulation
   - "重新开始" → Resets to initial state, then starts fresh
2. **Reset function MUST reset ALL state variables** (position, velocity, time, etc.)
3. Use clear state tracking: `{ running: boolean, ended: boolean, paused: boolean }`

### Canvas
1. Auto-resize on window resize
2. Clear visualization with grid or guides
3. Real-time data display overlay
4. Proper scaling for different screen sizes

### Interactivity
1. Real-time updates when sliders change
2. Presets apply and reset simulation
3. Keyboard shortcuts (Space = toggle, R = reset)
4. Touch gestures for mobile

### Visual Polish
1. Show current simulation state (running/paused/ended)
2. Animate transitions
3. Clear feedback when simulation ends
4. High contrast colors for visibility
