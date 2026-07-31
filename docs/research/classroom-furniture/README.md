# Classroom furniture generation notes

The production assets in `public/assets/img/classroom/` were generated with the built-in image generator and then converted from a flat `#FF00FF` chroma background to alpha PNGs.

- `student-computer-desk.png`: front-facing computer-lab student desk with a larger right-offset monitor whose display faces the seated companion; the viewer sees the clean rear casing and stand. Warm white desktop, pale gray adjustable legs, no chair or people.
- `student-chair.png`: front-facing compact low-back classroom chair placed behind the seated companion, warm light gray, no armrests or executive-office styling.

Both assets intentionally omit baked floor shadows. Pixi draws one shared low-contrast contact shadow so the furniture remains grounded on the cool-white classroom canvas without creating a card-like visual block.

The current desk source is `student-computer-desk-rear-monitor-source.png`. It was produced in built-in image generation edit mode from the earlier desk asset, on a flat magenta chroma background, then converted to alpha with the installed imagegen helper.

The scene layers each station as chair, seated companion, then desk. This keeps the companion visually central while making the pose read as sitting inside the workstation instead of standing beside separately positioned furniture.
