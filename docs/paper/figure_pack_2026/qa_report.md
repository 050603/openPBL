# Figure pack quality-assurance report

## Build result

- Build command: `python docs/paper/figure_pack_2026/src/build_figures.py`
- Figures produced: 10 SVG, 10 PDF, and 10 PNG files
- Raster export: 300 dpi
- PNG width: 2160 px for every figure
- Smallest PNG height: 1305 px
- Editable vector text: present in every SVG
- SVG structural validation: all files parsed successfully
- Naming: stable, ordered slugs from `fig01` through `fig10`
- Build metadata: recorded in `build_manifest.json`, including dimensions, byte sizes, SHA-256 hashes, and validation status
- Research memo: passed the deep-research structure validator and citation verifier; DOI metadata warnings were manually reviewed for online-first versus issue-year differences

## Visual inspection

The contact sheet and individual high-density panels were reviewed after iterative correction. The final pass checked:

- title and subtitle separation;
- text contained within boxes and callouts;
- non-overlapping connectors and labels;
- consistent semantic colour use;
- legibility of dashed versus solid paths;
- balanced whitespace and panel alignment;
- absence of efficacy language in diagrams of implemented mechanisms;
- clear marking of hypothesised or future causal paths.

No blocking layout defect was observed in the final contact sheet. Because journal templates rescale figures differently, the SVG masters should be used for final typesetting and checked again at the target column width.

## Claim-boundary check

Figures 1, 9, and 10 explicitly separate the current artifact-fidelity contribution from future classroom and causal evidence. Figures 2-8 describe architecture, intended policy, or executable workflow. They do not establish improved learning, preserved agency, reduced workload, or classroom feasibility.

## Recommended submission checks

1. Choose a target venue and test figures at its one-column and two-column widths.
2. Use the English captions in `captions_en.md` and number figures according to final manuscript order.
3. Freeze and cite the repository revision before submission.
4. Re-run the builder after any change to schemas, state transitions, role boundaries, or study design.
5. Ask the publisher whether embedded fonts or outlined text are required; the provided SVG files intentionally keep text editable.

## Known limitations

- Colour semantics were visually reviewed but not certified against a venue-specific accessibility tool.
- The diagrams summarize the system; they are not exhaustive API or database documentation.
- Font substitution may occur outside Windows. Re-export from the supplied builder or convert fonts only after editorial text is final.
- The pack has not yet been placed into a specific journal template; final line weight and type size should be tuned after the venue is selected.
