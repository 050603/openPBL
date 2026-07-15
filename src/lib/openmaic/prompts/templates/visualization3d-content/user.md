Create a 3D visualization widget for: {{title}}

## Visualization Type

{{visualizationType}}

## Description

{{description}}

## Key Points

{{keyPoints}}

## Objects to Visualize

{{objects}}

## Interactions

{{interactions}}

## Language

{{pblContext}}

{{languageDirective}}

---

Generate a complete, interactive 3D visualization using Three.js with these MANDATORY features:

### Knowledge Teaching (CRITICAL — students must LEARN, not just look)
1. **Objective Alignment**: Map every supplied Key Point to a specific object, spatial relation, viewpoint, comparison, or explanation task. Use accurate scale/shape conventions and disclose purposeful distortions; do not add impressive but irrelevant objects.
2. **No Decorative Interaction**: Orbiting, zooming, and animation count only when they help the learner predict, inspect, compare, explain, or revise a target spatial idea. Free camera movement alone is not a learning activity.
3. **Teaching Loop**: Begin from an orientation view; ask the learner to predict a hidden relation or appearance; move to a purposeful viewpoint or let the learner manipulate one parameter; highlight the evidence; then ask for an explanation before showing the model explanation.
4. **Explanatory Feedback**: Every instructional object needs a readable label and explanation of its role. Use the selected object, camera view, and learner choice to explain what is visible and why; diagnose common scale, orientation, or structure misconceptions.
5. **Guided Attention**: A guided tour must stop only at instructionally necessary viewpoints, state what to inspect and why it matters, and visually isolate the current evidence. Keep labels legible and prevent occlusion on desktop and mobile.
6. **Mastery Evidence**: End with a transfer task using a new viewpoint, object, or comparison. Record the learner's prediction/selection and explanation, check them against visible success criteria, and report which Key Points were demonstrated; completing the tour is not mastery.

### Scene Setup
1. **Three.js from CDN** using importmap for ES modules
2. **Proper lighting** (ambient + directional/point lights)
3. **OrbitControls** for camera manipulation
4. **Responsive canvas** that fills the container

### Objects
1. Create 3D objects based on the visualization type
2. Use appropriate materials (Phong, Standard, Emissive)
3. Add meaningful colors and textures
4. Store objects in an `objects` dictionary for widget actions
5. **Each object must have an associated explanation** stored in its data

### Interactions
1. **Sliders** for controlling parameters (speed, scale, etc.)
2. **Buttons** for presets, guided tour, and reset
3. **Info panel** showing current state and knowledge points
4. **Touch-friendly** controls (44px minimum)

### Animation
1. Use `requestAnimationFrame` for smooth animations
2. Support pause/play controls
3. Respect `animationSpeed` variable

### Teacher Actions Support
1. Include the postMessage listener
2. Support SET_WIDGET_STATE for camera and object control
3. Support HIGHLIGHT_ELEMENT for 3D objects
4. Support ANNOTATE_ELEMENT for 3D objects

### Widget Config
Embed a complete widget configuration in the HTML:
```json
{
  "type": "visualization3d",
  "visualizationType": "{{visualizationType}}",
  "description": "...",
  "objects": [...],
  "interactions": [...],
  "presets": [...]
}
```

### Mobile Considerations
1. Touch-enabled OrbitControls
2. Lower polygon count for mobile
3. Control panel at bottom for thumb access
4. Readable text sizes

Return ONLY the HTML document.
