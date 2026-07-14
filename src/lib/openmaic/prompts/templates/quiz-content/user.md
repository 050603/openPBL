Title: {{title}}
Description: {{description}}
Test Points: {{keyPoints}}
Question Count: {{questionCount}}, Difficulty: {{difficulty}}, Question Types: {{questionTypes}}
{{pblContext}}

## Language Directive
{{languageDirective}}

Treat requested question types as supported semantic formats. Select each format because it matches the current knowledge point and objective. Keep an intentional progression from a basic check to explanation or application. Do not generate matching, ordering, dragging, or line-connection structures.

Output JSON array directly (no explanation, no code blocks, no LaTeX):
[{"id":"q1","type":"single","format":"single_choice","question":"Question text","options":[{"label":"Option A","value":"A"},{"label":"Option B","value":"B"}],"answer":["A"],"analysis":"Explain the correct reasoning and the misconception behind the distractor.","points":10}]
