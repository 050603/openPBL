# Figure design research and rationale

## Executive summary

This figure pack translates the current OpenPBL implementation into a coherent visual argument for an English-language education or computing paper. The design problem is not to make the system appear more capable than the evidence permits. It is to show, with minimal visual ambiguity, how educational responsibility is distributed, how AI assistance is bounded, which traces make that assistance inspectable, and which outcomes remain hypotheses. The pack therefore uses three linked visual grammars: a conjecture map for the theory-to-design argument, system and sequence diagrams for executable mechanisms, and a staged research programme for claim discipline.

The educational rationale is grounded in design-based research, project-based learning, computer-supported scaffolding, classroom orchestration, student agency, and human-AI interaction research [1-8]. Recent studies make a particularly important distinction between assisted task performance and later independent learning: generative assistance can help under some instructional designs, but unconstrained assistance can also reduce subsequent unaided performance [9,10]. This evidence motivated the pack's repeated emphasis on curriculum anchoring, graduated support, explicit delegation, verification, undo, teacher judgment, and delayed unaided transfer.

The technical content is grounded in the repository rather than in a generic AI-platform template. The figures reflect the implemented authority domains, role-aware curriculum graph, prerequisite remediation route, six-stage project lifecycle, evidence gates, reversible structured edits, event-to-intervention loop, durable generation jobs, and deployment services. Solid connectors denote implemented control or data paths; dashed connectors denote hypothesised educational effects or future empirical transitions. The result is a modular set of ten figures that can support both an education-facing design argument and a computer-science-facing systems account without conflating software fidelity with learning efficacy.

## Introduction

### Scope, method, and assumptions

The review combined two evidence streams. First, the current repository was inspected across the English manuscript, research roadmap, architecture decision records, database schema, production deployment configuration, application routes, and targeted tests. Second, research was selected to cover five conceptual needs: design-based research representation, PjBL and scaffolding, human-AI authority and agency, teacher orchestration, and generative-AI learning effects. Priority was given to peer-reviewed work, systematic reviews, primary empirical studies, and authoritative guidance.

The pack assumes that the present paper is a formative artifact-fidelity study. It does not assume classroom efficacy, improved learning, reduced teacher workload, or preserved student agency. These remain testable outcomes. This boundary directly governs the line styles, captions, and wording.

## Main Analysis

### Design findings

#### 1. The paper needs a conjecture map, not only a software architecture diagram

Design-based research requires an account of why a feature should produce a learning-relevant process, not merely where the feature runs. Conjecture mapping is useful because it connects high-level theoretical conjectures to embodied design features, mediating processes, and outcomes [1]. Design-based research also treats the intervention and its context as jointly informative, while calling for iterative and theoretically grounded inquiry [2]. Figure 1 adopts this grammar: the educational tension leads to a bounded co-agency conjecture; implementation mechanisms lead to mediating activity; and only then do dashed paths reach future outcomes. Figure 10 decomposes the same argument into testable feature-mechanism-indicator-outcome pathways.

#### 2. PjBL should be represented as an evidence-producing learning process

PjBL can improve achievement and higher-order outcomes, but effects depend on design and implementation conditions [3,4]. Research on inquiry and problem-based learning likewise argues for scaffolding rather than a false choice between minimal guidance and direct instruction [5]. Computer-based scaffolding in STEM problem-based learning has shown positive effects while also highlighting variation in scaffolding design [6]. These findings support Figures 4 and 5. The diagrams do not present a file upload or elapsed time as evidence of readiness. They represent knowledge preparation, project action, testing, revision, defence, reflection, and transfer as distinct evidence-bearing events.

#### 3. Human-AI collaboration must make authority visible

Generic labels such as "human in the loop" are too coarse for an educational system in which teachers, students, and AI may each plan, explain, produce, monitor, and evaluate. Teacher perspectives on student-AI collaboration emphasize learning designs that preserve student participation and teacher responsibility [7]. Work on AI assistance and student agency shows that support can shift how much students rely on their own judgment [8]. Broader guidance also stresses human agency, age-appropriate use, transparency, privacy, and accountability [11]. Figure 3 therefore separates curricular, instructional, adaptive, productive, and evaluative authority. Figure 6 shows productive authority as a bounded transaction: the student supplies a seed and explicit scope, the system validates a structured patch, changes remain attributable and reversible, and final submission and evaluation stay human-controlled.

#### 4. Guardrails should shape the learning process, not only filter outputs

Recent empirical results warn against treating immediate assisted performance as learning. In a large mathematics field experiment, access to an unconstrained generative assistant improved supported practice performance but reduced later unaided performance, while a more carefully designed tutor mitigated that harm [9]. A separate randomized study found benefits from a structured, research-based AI tutor in an authentic course [10]. These results are not contradictory: together they imply that interaction design, task structure, and what students do after assistance matter. Figures 4, 6, and 10 visualize this process view through prerequisite diagnosis, ungraded practice, one terminal mastery judgment, explicit delegation, verification, and delayed unaided transfer.

#### 5. Teacher-AI complementarity needs an orchestration loop

Classroom analytics are useful when they help teachers notice and act, not when they silently replace teacher interpretation. Co-design work on real-time orchestration emphasizes complementarity between teacher expertise and AI capabilities [12], while classroom orchestration research foregrounds the practical coordination of people, activities, and resources [13]. Figure 7 therefore avoids portraying analytics as diagnosis of a student's latent traits. Events are deduplicated and interpreted only within the active learner-stage scope; AI scaffolding is policy-bounded; unresolved or consequential cases are escalated; and teacher directives or offline actions create new evidence for the next cycle.

#### 6. The computing contribution is durability plus policy enforcement

For a systems audience, novelty cannot be communicated by an undifferentiated box labelled "AI platform." Figures 2 and 8 separate user workspaces, application orchestration, pedagogical policy, evidence and domain state, platform services, and external model providers. The course-generation diagram also exposes deterministic and semantic review, durable job state, page checkpoints, fingerprints, bounded recovery, and persistent outputs. This makes the technical claim inspectable: pedagogical boundaries are partly encoded in schemas, validators, state transitions, and audit records rather than residing only in prompts.

## 3. Synthesis and visual system

The ten figures form one argument at three scales:

1. **Theory scale:** Figures 1 and 10 state the design conjecture and measurable mechanisms.
2. **Learning-design scale:** Figures 3-7 show authority, adaptation, evidence progression, delegation, and orchestration.
3. **Engineering and evidence scale:** Figures 2, 8, and 9 show implementation architecture, generation reliability, and the progression from artifact claims to classroom and comparative evidence.

The visual system uses navy for the stable system frame, blue for curriculum and information structures, violet for AI-mediated functions, teal for process and evidence, green for accepted or human-confirmed states, amber for checkpoints or conditional routing, and red only for consequential boundaries or risks. Pale fills keep the figures legible in print and preserve a professional journal aesthetic. Repeated shapes have stable meanings across figures. Solid arrows represent implemented sequences or flows. Dashed arrows represent hypotheses, optional branches, or empirical transitions whose effects have not yet been established.

## Claims-Evidence Table

| Figure claim | Evidence basis | Permitted interpretation |
|---|---|---|
| OpenPBL encodes a bounded co-agency conjecture | Repository mechanisms plus conjecture-mapping literature [1,2] | A design proposition whose mediators and outcomes require study |
| PjBL progression is evidence-gated | Current stage policies, evidence types, and PjBL/scaffolding research [3-6] | An inspectable workflow, not proof of better achievement |
| Productive AI delegation is reversible and attributable | Structured patch, version, provenance, and undo mechanisms in the artifact | An implemented safeguard, not proof of perceived ownership |
| Teacher judgment remains consequential | Authority policies and orchestration workflow, supported by [7,11-13] | Intended and partly enforced authority allocation |
| Delayed unaided transfer is a necessary outcome | Guardrail and tutoring evidence [9,10] | A proposed primary outcome for future comparative work |

## Counterevidence Register

- Unguarded generative assistance can improve supported practice while reducing later unaided performance [9]; the pack therefore rejects practice performance as a sufficient efficacy signal.
- AI assistance can shift students toward reliance rather than independent uptake [8]; reversible editing is consequently presented as a hypothesis about agency preservation, not as evidence that agency is preserved.
- Structured AI tutoring can improve learning in a bounded setting [10]; the pack therefore does not take an anti-AI position, but treats instructional design and subsequent independent performance as moderators.
- PjBL effects vary with implementation and context [3,4]; stage completion is therefore separated from educational effectiveness.
- Teacher-facing signals can create workload or alert fatigue; Figure 7 treats orchestration benefit as an outcome to measure rather than an architectural consequence.

## 4. Limitations and caveats

These figures are analytic models, not exhaustive interface maps. They intentionally omit minor routes, administrative functions, and low-level infrastructure details that do not advance the paper's central argument. The authority topology describes the intended and partly enforced policy architecture; classroom enactment may diverge. Similarly, event capture, evidence gates, provenance, and undo can support inspectability but do not by themselves prove meaningful consent, reflection, ownership, equity, or learning.

The literature base spans different populations, subjects, intervention durations, and AI systems. Findings should not be generalized mechanically to OpenPBL. The figures also encode the current repository snapshot; changes to prompts, schemas, providers, routes, or state machines should trigger a figure review before submission.

## 5. Recommendations for manuscript use

- Use Figures 1, 3, 6, and 10 in the main education paper. Together they communicate the theoretical contribution, the authority framework, the distinctive interaction protocol, and the testable mechanism model.
- Add Figure 4 or 5 when the venue prioritizes learning design or PjBL implementation.
- Use Figures 2 and 8 for a computing, learning-engineering, or system-demonstration venue.
- Keep Figure 9 near the limitations or future-work section to prevent an artifact audit from being read as an efficacy trial.
- Retain the captions' explicit distinction between implemented mechanisms and hypothesised effects.
- Before final submission, freeze a repository revision and update the artifact availability statement, figure references, and appendix traceability table to that revision.

## Bibliography

[1] Sandoval, W. A. (2014). Conjecture mapping: An approach to systematic educational design research. *Journal of the Learning Sciences, 23*(1), 18-36. https://doi.org/10.1080/10508406.2013.778204

[2] Wang, F., & Hannafin, M. J. (2005). Design-based research and technology-enhanced learning environments. *Educational Technology Research and Development, 53*, 5-23. https://doi.org/10.1007/BF02504682

[3] Chen, C.-H., & Yang, Y.-C. (2019). Revisiting the effects of project-based learning on students' academic achievement: A meta-analysis investigating moderators. *Educational Research Review, 26*, 71-81. https://doi.org/10.1016/j.edurev.2018.11.001

[4] Farshad, S., & Fortin, C. (2026). An umbrella review of meta-analyses on project-based learning: Effects on academic achievement, higher-order thinking, and 21st-century skills. *Educational Research Review, 52*, 100809. https://doi.org/10.1016/j.edurev.2026.100809

[5] Hmelo-Silver, C. E., Duncan, R. G., & Chinn, C. A. (2007). Scaffolding and achievement in problem-based and inquiry learning. *Educational Psychologist, 42*(2), 99-107. https://doi.org/10.1080/00461520701263368

[6] Kim, N. J., Belland, B. R., & Walker, A. E. (2018). Effectiveness of computer-based scaffolding in the context of problem-based learning for STEM education: Bayesian meta-analysis. *Educational Psychology Review, 30*, 397-429. https://doi.org/10.1007/s10648-017-9419-1

[7] Kim, J., Lee, H., & Cho, Y. H. (2022). Learning design to support student-AI collaboration: Perspectives of leading teachers for AI in education. *Education and Information Technologies, 27*, 6069-6104. https://doi.org/10.1007/s10639-021-10831-6

[8] Darvishi, A., Khosravi, H., Sadiq, S., Gasevic, D., & Siemens, G. (2024). Impact of AI assistance on student agency. *Computers & Education, 210*, 104967. https://doi.org/10.1016/j.compedu.2023.104967

[9] Bastani, H., Bastani, O., Sungu, A., Ge, H., Kabakci, O., & Mariman, R. (2025). Generative AI without guardrails can harm learning: Evidence from high school mathematics. *Proceedings of the National Academy of Sciences, 122*(26), e2422633122. https://doi.org/10.1073/pnas.2422633122

[10] Kestin, G., Miller, K., Klales, A., Milbourne, T., & Ponti, G. (2025). AI tutoring outperforms in-class active learning: An RCT introducing a novel research-based design in an authentic educational setting. *Scientific Reports, 15*, 17458. https://doi.org/10.1038/s41598-025-97652-6

[11] Miao, F., & Holmes, W. (2023). *Guidance for generative AI in education and research*. UNESCO. https://unesdoc.unesco.org/ark:/48223/pf0000386693

[12] Holstein, K., McLaren, B. M., & Aleven, V. (2019). Co-designing a real-time classroom orchestration tool to support teacher-AI complementarity. *Journal of Learning Analytics, 6*(2), 27-52. https://doi.org/10.18608/jla.2019.62.3

[13] Dillenbourg, P. (2013). Design for classroom orchestration. *Computers & Education, 69*, 485-492. https://doi.org/10.1016/j.compedu.2013.04.013

[14] Amershi, S., et al. (2019). Guidelines for human-AI interaction. In *Proceedings of CHI 2019*. https://doi.org/10.1145/3290605.3300233

## Methodology appendix

Repository evidence was triangulated across `docs/paper/openpbl_education_manuscript_en_v2.md`, `docs/paper/openpbl_engineering_to_education_research_roadmap_2026.md`, architecture decision records, Prisma models, production orchestration configuration, application routes, and tests. The existing evidence ledger at `docs/paper/research_evidence_2026-08-13/` was used to avoid detaching figure claims from the manuscript's source audit. Each candidate figure was screened against three questions: (1) Is the content supported by the current artifact or cited theory? (2) Does it make a relationship easier to understand than prose? (3) Could its notation imply an educational effect that has not been measured? Figures were then exported as editable SVG, vector PDF, and 300 dpi PNG, followed by automated structural checks and contact-sheet visual review.
