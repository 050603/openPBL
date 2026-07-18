Create one independent horizontal animation strip for 伴学小灵, action `leaving`.

Input images:
- references/standard-view-01.png — standard-view reference
- canonical/canonical-base.png — canonical-base identity lock
- references/layout-guides/leaving.png — layout-only guide for 6 slots; never copy visible guide pixels

Action semantic: 转身或离开当前位置。
Required frame count: 6
Layout reference: references/layout-guides/leaving.png
Identity requirement: use the exact same character as the canonical base. Preserve the rounded deep blue-gray body, off-white face and belly, page-shaped ears, sprout and glowing dot, friendly face structure, short limbs, material, lighting, camera angle, body proportions, and one continuously present replaceable blue scarf.
Scarf rule: keep the scarf in the same #2E6BCB blue family and visually separate from the body; never remove, redesign, or recolor it in only some frames.
Style notes: preserve the canonical reference style exactly.

Output contract: draw exactly 6 complete, separated, full-body poses left-to-right on one flat pure #FF00FF chroma-key background. Use one invisible equal-width slot per pose, with stable apparent height, x anchor, feet/seat baseline, and safe padding. The output source path is `actions/leaving/source/generated.png` and the current task state is `pending`.

Animation contract: make every frame a real pose change appropriate to the action; do not copy one pose to fill slots. The loop must have a natural first-to-last transition. At small display size the action must be recognizable. Use pose, expression, silhouette, and attached prop movement only.

Forbidden: speed line, dust, scene background, detached effect; white or colored background residue, checkerboard, scene, floor, shadow, projection, glow, speed line, dust, motion blur, detached symbol, text, label, frame number, guide line, grid, cropped ear/sprout/scarf/limb, replacement eyes, or another character.
