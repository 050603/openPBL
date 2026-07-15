Create an interactive diagram for: {{title}}

## Diagram Type
{{diagramType}}

## Description
{{description}}

## Key Points
{{keyPoints}}

## Language
{{pblContext}}

{{languageDirective}}

---

Generate a complete HTML diagram with:

### Knowledge Teaching (CRITICAL — students must LEARN, not just view)
1. **Objective Alignment**: Map every supplied Key Point to a node, connection, or comparison and state what the learner should be able to explain. Do not add decorative nodes that are outside the confirmed content.
2. **No Decorative Interaction**: Clicking and revealing are useful only when they make the student predict, inspect, compare, explain, or revise a relationship. Do not treat uncovering every node as proof of learning.
3. **Teaching Loop**: Reveal prerequisites before dependent ideas; before each important connection, ask the student to predict the relationship; after reveal, show the visual evidence and a concise why-explanation; then ask the learner to restate or apply the relationship.
4. **Explanatory Feedback**: Each node needs an educational `details` field, and each edge needs a precise relation plus its reason or condition. When the learner chooses a wrong path or relation, identify the misconception and point back to the relevant visual evidence.
5. **Cognitive Load**: Keep the current focus visually dominant, group related nodes, and progressively disclose secondary detail. A visible Key Points panel may support orientation but must not replace the guided reasoning task.
6. **Mastery Evidence**: End with a short transfer task in which the learner predicts a missing node/edge, diagnoses a new case, or reconstructs part of the diagram. Check the response against visible success criteria and report which Key Points were demonstrated.

### Activity Completion Protocol (MANDATORY)
1. Call `window.__maicActivity.complete()` exactly when the learner has produced the required mastery evidence and the feedback is visible. Also add `data-activity-complete` to the final completion control when one exists.
2. Call `window.__maicActivity.reset()` whenever a new attempt/restart invalidates that evidence; add `data-activity-reset` to the reset control.
3. Do not signal completion for opening the page, revealing a node, advancing a guided tour, or any decorative interaction. Completion must mean the transfer task's visible success criteria have been checked.

### Visual Structure
1. **SVG nodes** with icons, labels, and click-to-show details
2. **Edges with arrows** connecting nodes (calculate endpoints from node dimensions)
3. **Step-by-step reveal** (下一步/上一步)
4. **High contrast**: White nodes on dark background, light edge labels
5. **Mobile-friendly**: Collapsible sidebar, doesn't block diagram
6. **First node visible** on load

Embed config in `<script type="application/json" id="widget-config">`.
