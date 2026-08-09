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
3. **Teaching Loop**: Reveal prerequisites before dependent ideas; before each important connection, invite the student to predict and observe the relationship; after reveal, show the visual evidence and a concise why-explanation; then let the learner inspect a related path or comparison.
4. **Explanatory Feedback**: Each node needs an educational `details` field, and each edge needs a precise relation plus its reason or condition. Explain the currently selected path from visual evidence without labeling the learner right or wrong.
5. **Cognitive Load**: Keep the current focus visually dominant, group related nodes, and progressively disclose secondary detail. A visible Key Points panel may support orientation but must not replace the guided reasoning task.
6. **Exploration Evidence**: Let the learner open and compare at least two meaningful paths, then show a compact relationship summary based on what they inspected. Do not require reconstruction against a hidden canonical arrangement.
7. **Assessment Boundary**: This is not a quiz: use no score, answer key, matching, sorting, ordering, drag-to-answer, correctness verdict, or pass/fail gate.

### Activity Completion Protocol (MANDATORY)
1. Call `window.__maicActivity.complete()` after meaningful exploration: the learner has inspected the required relationships and the comparison summary is visible. Also add `data-activity-complete` to the final continue control when one exists.
2. Call `window.__maicActivity.reset()` when a restart clears the inspected-path state; add `data-activity-reset` to the reset control.
3. Do not signal completion for opening the page, revealing one node, or decorative interaction. Completion is a playback milestone, not a grade or mastery claim.

### Visual Structure
1. **SVG nodes** with icons, labels, and click-to-show details
2. **Edges with arrows** connecting nodes (calculate endpoints from node dimensions)
3. **Step-by-step reveal** (下一步/上一步)
4. **High contrast**: White nodes on dark background, light edge labels
5. **Mobile-friendly**: Collapsible sidebar, doesn't block diagram
6. **First node visible** on load

Embed config in `<script type="application/json" id="widget-config">`.
