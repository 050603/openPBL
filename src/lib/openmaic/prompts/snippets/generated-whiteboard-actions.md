## Whiteboard Actions for Pre-generated Teaching

Whiteboard actions are available on slide scenes. Use them only when the Instructional Presentation Policy identifies a genuinely process-oriented visual explanation.

All whiteboard actions use `{"type":"action","name":"wb_...","params":{...}}` inside the same output array. The canvas is 1000 x 563; keep content inside x=20..980 and y=20..543 without overlap.

- Open before drawing: `{"type":"action","name":"wb_open","params":{}}`
- Text or annotation: `{"type":"action","name":"wb_draw_text","params":{"content":"...","x":60,"y":60,"width":500,"height":50,"fontSize":20,"color":"#333333","elementId":"optional_id"}}`
- Formula: `{"type":"action","name":"wb_draw_latex","params":{"latex":"E=mc^2","x":80,"y":100,"width":500,"height":80,"elementId":"optional_id"}}`
- Shape: `{"type":"action","name":"wb_draw_shape","params":{"shape":"rectangle","x":60,"y":180,"width":220,"height":100,"fillColor":"#5b9bd5","elementId":"optional_id"}}`
- Line or arrow: `{"type":"action","name":"wb_draw_line","params":{"startX":280,"startY":230,"endX":500,"endY":230,"width":2,"points":["","arrow"],"elementId":"optional_id"}}`
- Table: `{"type":"action","name":"wb_draw_table","params":{"x":60,"y":100,"width":700,"height":240,"data":[["Item","Meaning"],["A","..."]]}}`
- Chart: `{"type":"action","name":"wb_draw_chart","params":{"chartType":"bar","x":80,"y":100,"width":600,"height":320,"data":{"labels":["A","B"],"legends":["Value"],"series":[[1,2]]}}}`
- Code: `{"type":"action","name":"wb_draw_code","params":{"language":"python","code":"...","x":60,"y":80,"width":700,"height":300,"elementId":"code_1"}}`
- Edit a visible code block: `{"type":"action","name":"wb_edit_code","params":{"elementId":"code_1","operation":"replace_lines","lineIds":["L2"],"content":"..."}}`
- Delete one constructed item: `{"type":"action","name":"wb_delete","params":{"elementId":"..."}}`
- Clear the board: `{"type":"action","name":"wb_clear","params":{}}`
- Close and return to PPT: `{"type":"action","name":"wb_close","params":{}}`

Interleave narration with construction: open, draw/reveal one meaningful step, explain it with a text object, then add the next step. Do not draw the whole solution before explaining it. Close the whiteboard before the next spotlight, laser, video, discussion, or page-ending recap on the PPT.

For `wb_draw_latex`, JSON must escape every LaTeX backslash as `\\`. Use text for ordinary language and LaTeX only for mathematical notation. Use `wb_edit_code` only with line IDs produced by the visible code block; never invent line IDs before a code block exists.
