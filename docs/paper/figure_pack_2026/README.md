# OpenPBL academic figure pack (2026)

This pack contains ten English, publication-oriented figures grounded in the current OpenPBL implementation and education-journal manuscript. The pack deliberately separates implemented mechanisms from hypothesised educational outcomes.

## Output formats

- `svg/`: editable vector masters with live text; preferred for final layout.
- `pdf/`: vector figures for LaTeX and publisher workflows.
- `png/`: 300 dpi raster exports for Word and review systems.
- `openpbl_figure_contact_sheet.png`: visual index for selecting figures.
- `captions_en.md`: manuscript-ready English captions.
- `figure_design_research.md`: literature and repository grounding.
- `build_manifest.json`: dimensions, file sizes, hashes, and SVG text checks.

## Figure index

1. `fig01_openpbl_conjecture_map` — educational problem, design conjecture, embodied mechanisms, mediators, and outcomes.
2. `fig02_openpbl_system_architecture` — modular-monolith architecture from user workspaces to infrastructure and model providers.
3. `fig03_openpbl_authority_topology` — allocation of curricular, instructional, adaptive, productive, and evaluative authority.
4. `fig04_openpbl_adaptive_path` — role-aware prerequisite diagnosis, one-to-one remediation, full instruction, terminal mastery, and optional enrichment.
5. `fig05_openpbl_evidence_lifecycle` — six PjBL stages and the evidence required at each readiness gate.
6. `fig06_openpbl_reversible_delegation` — explicit, whitelisted, attributable, conflict-protected, and reversible AI editing.
7. `fig07_openpbl_orchestration_loop` — event capture, scoped analysis, AI scaffolding, escalation, and teacher judgment.
8. `fig08_openpbl_generation_pipeline` — durable course design and generation with semantic review, checkpoints, and managed recovery.
9. `fig09_openpbl_research_programme` — progression from artifact fidelity to classroom feasibility and comparative effects.
10. `fig10_openpbl_mechanism_model` — testable feature–mechanism–process–outcome pathways and moderators.

## Recommended selection

- Education/AIED design paper: Figures 1, 3, 4, 5, 6, 9, and 10.
- Computer-science/system paper: Figures 2, 6, 7, and 8.
- Short conference paper: Figures 1, 3, 6, and 9.
- Main text plus supplement: keep Figures 1, 3, 6, and 10 in the article; move Figures 2, 4, 5, 7, 8, and 9 to appendices or supplementary material.

## Rebuild

Run from the repository root:

```powershell
python docs/paper/figure_pack_2026/src/build_figures.py
```

The script overwrites only the generated files inside this figure pack.

