Questions: {{questions}}
Title: {{title}}
Key Points: {{keyPoints}}
Description: {{description}}
{{courseContext}}
{{agents}}
{{pblContext}}
{{timingBudget}}

**Language Directive**: {{languageDirective}}

Output exactly two short text segments as a JSON array. The runtime inserts the quiz activity gate between them. Segment 1 must not reveal or hint at answers; segment 2 is post-submission concept-level feedback and transition. No discussion or action objects:
[{"type":"text","content":"Try the questions independently, then submit."},{"type":"text","content":"Now compare your reasoning with the explanation and note the step to review before we continue."}]
