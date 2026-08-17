# OpenPBL Academic Figure Pack Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce a publication-ready English figure pack that accurately represents OpenPBL's educational contribution, runtime architecture, learning mechanisms, and staged research agenda.

**Architecture:** A standalone Python/Matplotlib builder will encode one shared visual language and export each figure as editable SVG, print-ready PDF, and 300 dpi PNG. The builder will read no application state and will not modify the product; its content is grounded in the accepted ADRs, canonical TypeScript contracts, Prisma schema, production Compose stack, and the current education-journal manuscript.

**Tech Stack:** Python 3, Matplotlib, Pillow, SVG/PDF vector export.

---

### Task 1: Freeze the figure specification

**Files:**
- Create: `docs/paper/figure_pack_2026/README.md`
- Create: `docs/paper/figure_pack_2026/captions_en.md`

1. Define ten figures and the manuscript section each supports.
2. Record the implementation evidence behind every mechanism shown.
3. Mark hypothesised educational outcomes separately from implemented mechanisms.
4. Use only English text inside figures.

### Task 2: Implement the shared vector renderer

**Files:**
- Create: `docs/paper/figure_pack_2026/src/build_figures.py`

1. Configure Arial typography, a colour-blind-friendly palette, editable SVG text, and journal-sized canvases.
2. Implement reusable box, arrow, badge, lane, node, and export helpers.
3. Add deterministic output naming for SVG, PDF, and 300 dpi PNG.
4. Add overlap/bounds checks for all text and drawing objects.

### Task 3: Draw conceptual and governance figures

**Files:**
- Modify: `docs/paper/figure_pack_2026/src/build_figures.py`

1. Draw the educational conjecture map.
2. Draw the five-domain authority topology.
3. Draw the hypothesised mechanism model with explicit current/future evidence boundaries.

### Task 4: Draw system and process figures

**Files:**
- Modify: `docs/paper/figure_pack_2026/src/build_figures.py`

1. Draw the layered system architecture.
2. Draw the role-aware prerequisite adaptation path.
3. Draw the six-stage evidence-gated PjBL lifecycle.
4. Draw the reversible delegation sequence.
5. Draw the learning-analytics and teacher-orchestration loop.
6. Draw the durable course-generation pipeline.

### Task 5: Draw the empirical programme and package outputs

**Files:**
- Modify: `docs/paper/figure_pack_2026/src/build_figures.py`
- Create: `docs/paper/figure_pack_2026/figure_design_research.md`

1. Draw the three-stage research programme.
2. Export SVG, PDF, and PNG for all ten figures.
3. Generate a labelled contact sheet.
4. Document literature-informed figure choices and citation links.

### Task 6: Verify publication readiness

**Files:**
- Create: `docs/paper/figure_pack_2026/qa_report.md`

1. Run the builder twice and confirm deterministic filenames and successful exports.
2. Verify ten files exist in each output format and each PNG is at least 2000 px wide.
3. Parse all SVGs as XML and confirm text remains editable.
4. Render and visually inspect the contact sheet and any dense figures.
5. Record known limitations and recommended journal placement.

