# OpenPBL: Compiling Pedagogical Authority into Evidence-Gated Human-AI Project Learning

**Manuscript type:** Regular-paper draft; system design and formative evaluation

**Format note:** JCST-inspired section hierarchy and numeric citations; apply the official publisher template after venue confirmation

**Author information:** Anonymous for peer review

**Development snapshot:** 13 August 2026

**Research-status notice:** Sections 1-6 report system design and real engineering tests. Section 7 uses seeded synthetic placeholders solely to debug the study protocol and analysis pipeline; approved empirical data must replace them before submission.

## Abstract

Generative AI can tutor and co-produce, but those capabilities obscure a more basic question: who controls curriculum, adaptation, artifact changes, and consequential judgments? We present OpenPBL, a project-based learning environment that treats **pedagogical authority as a typed control plane**. Five authority domains—curricular, instructional, adaptive, productive, and evaluative—are allocated across teachers, students, and AI and compiled into executable mechanisms. A role-aware curriculum graph distinguishes authentic prerequisites from lesson targets; instruction follows explanation, example, practice, and feedback before one terminal mastery assessment; diagnostics target only approved prerequisites, route one-to-one remediation, and return every learner to the full lesson; AI may edit whitelisted draft fields only under explicit student delegation with before/after values, provenance, conflict protection, and undo; and progression requires typed test-interpret-revise evidence while students retain submission and teachers retain adjudication. We evaluate implementation fidelity through architecture-decision records, source-level theory-to-mechanism traceability, and 14 targeted test files; all 111 tests passed. To prepare rather than imitate classroom evidence, we also specify a four-condition comparative study and dry-run its pipeline on a seeded synthetic dataset, prominently labelled non-empirical. The synthetic output is not evidence of learning effects. Contributions are an authority topology, a compilation pattern from pedagogical principles to software permissions, an end-to-end auditable implementation, and a falsifiable empirical protocol.

**Keywords:** artificial intelligence in education; project-based learning; pedagogical authority; human-AI collaboration; learner agency; evidence gates; reversible delegation; educational design research

## 1. Introduction

Generative AI has made high-quality-seeming explanation, feedback, planning, and production support available at unprecedented scale. Well-designed AI tutoring can improve learning and engagement in bounded contexts [1], and AI can augment teachers' capacity to provide timely guidance [2]. However, helpfulness is not equivalent to learning. In a large high-school mathematics field experiment, unguarded generative AI improved assisted practice performance but reduced subsequent unaided performance, whereas pedagogical guardrails mitigated the harm [3]. In peer feedback, students tended to rely on rather than learn from AI assistance when the support was removed [4]. These findings shift the design question from whether AI should assist students to **which work AI may perform, under whose authority, with what evidence, and with what path back to independent performance**.

The problem is acute in PjBL. PjBL organizes learning around sustained inquiry into authentic problems and the creation, testing, and revision of public or inspectable products. Meta-analytic evidence generally supports positive effects, but the magnitude varies by design and context [5], and a recent umbrella review cautions that the methodological quality of available meta-analyses remains low despite a consistently positive direction [6]. PjBL is therefore not a self-executing intervention. Students need calibrated scaffolding for problem framing, knowledge building, inquiry, collaboration, iteration, and reflection [7, 8]. Generative AI can provide such scaffolding, but it can also collapse an inquiry into an answer, a design process into a generated artifact, or reflection into plausible prose.

Existing AIED research provides important but fragmented responses. Intelligent tutoring research structures hints and feedback around domain models. Learning analytics supports teacher orchestration. Self-regulated learning (SRL) research emphasizes planning, monitoring, and reflection. Human-centred AI calls for meaningful human control. Student-AI collaboration research frames AI as a learning mate rather than a passive tool [9]. Yet educational systems increasingly combine all these functions: they map curriculum, generate courses, diagnose prior knowledge, tutor, collaborate on artifacts, monitor activity, and recommend interventions. When those functions are designed independently, authority can drift. A prerequisite diagnostic may test new lesson content; an adaptive engine may skip core instruction; a collaborator may silently overwrite a student's idea; a dashboard may turn probabilistic inference into a consequential judgment; or multiple agents may optimize local helpfulness while eroding coherence.

OpenPBL was redesigned in response to this integration problem. Its earlier architecture treated AI mainly as role-delimited companions that could explain, question, critique, and review but not directly modify a learner's project artifact. The current design adopts a more demanding position: protecting agency does not require prohibiting all AI contribution. Instead, agency can be supported through **constrained, inspectable, attributable, and reversible delegation**, provided that students retain consequential authority and that progress depends on evidence of learning rather than artifact presence alone.

This paper asks:

**RQ1.** How can an AIED system operationalize curricular boundaries so that personalization diagnoses genuine prerequisites without pretesting or replacing lesson targets?

**RQ2.** How can generative AI participate as both tutor and project teammate while preserving learner epistemic agency and teacher authority across PjBL?

**RQ3.** To what extent does the implemented OpenPBL artifact faithfully instantiate these principles?

**RQ4.** What comparative design can falsify the claim that executable authority boundaries better preserve independent transfer, agency, and teacher judgment than role-based or unrestricted AI?

The paper makes four contributions. First, it proposes a five-domain topology of curricular, instructional, adaptive, productive, and evaluative authority. Second, it formalizes that topology as a control plane with actors, state preconditions, permitted operations, immutable evidence, reversal paths, and terminal human decisions. Third, it shows how the control plane compiles into a role-aware curriculum graph, prerequisite loop, single terminal assessment, reversible workspace operations, and evidence-gated state transitions. Fourth, it separates implementation fidelity from educational effect and specifies a falsifiable four-condition comparison.

## 2. Theoretical and Empirical Background

### 2.1 PjBL requires scaffolding without appropriation

PjBL places students in uncertain problem spaces where goals, evidence, methods, and quality criteria must be progressively clarified. This uncertainty is educationally productive but can overwhelm novices. Scaffolding therefore reduces nonproductive complexity while preserving the central intellectual work of the task [7]. Computer-based scaffolding has a small-to-moderate positive effect in problem-based STEM contexts, with effectiveness varying by function and context [8]. The design challenge is not merely to provide more help, but to calibrate help so that it supports participation and then makes learner competence visible.

Generative AI complicates this calibration because the same interface can explain a concept, generate an answer, propose a design, write an artifact, and evaluate the result. Traditional distinctions between a tutor, tool, peer, and assessor become porous. In PjBL, an AI-generated product may be superficially excellent while concealing weak conceptual understanding, limited verification, or minimal student decision-making. Accordingly, the unit of educational design must include not only the product but the sequence of inquiry, evidence, decisions, and revisions that produced it.

### 2.2 From student-AI interaction to co-agency

Teachers envision productive student-AI collaboration as evolving from learning about AI, to learning from AI, to learning together with AI. They also emphasize authentic tasks, process-oriented assessment, disciplinary knowledge, error analysis, and a safe-to-fail culture [9]. This view treats AI as a participant in activity rather than a neutral delivery channel. Recent work on epistemic co-agency similarly argues that learners must reason with, through, and against AI while retaining responsibility for knowledge claims [11].

Co-agency is not automatically empowering. Student teachers exhibit distinct agency profiles in AI-supported learning environments, including balanced engagement and uncritical reliance [12]. In collaborative learning, students can imagine AI supporting planning, monitoring, and reflection, but lower domain knowledge may increase the likelihood of adopting AI suggestions without sufficient trial, evaluation, or ownership [13]. Darvishi et al. [4] further show that frequent AI support may produce dependence rather than transferable regulation. These findings imply that agency should be treated as a dynamic relation among people, technologies, tasks, and institutional rules, not as a stable learner trait or a binary “AI/no-AI” property [14].

We define **human-AI co-agency for learning** as the negotiated distribution of initiative and action among learners, teachers, and AI in pursuit of educational goals, where the distribution remains visible, contestable, and accountable. **Epistemic agency** concerns responsibility for framing questions, judging evidence, and endorsing knowledge claims. **Productive agency** concerns control over creating and revising artifacts. **Evaluative authority** concerns consequential judgments about mastery, progression, and quality. The three should not be conflated: a student may delegate a productive action while retaining epistemic and evaluative responsibility.

### 2.3 Relation to agent-centric online learning environments

Multi-agent course environments such as OpenMAIC [10] show that coordinated LLM roles can connect course authoring with online classroom activity. OpenPBL takes a different unit of design: not the number or coverage of agent roles, but the executable allocation of consequential authority across curriculum, adaptation, artifact production, evidence, and evaluation. Multi-agent organization is therefore an implementation option in this paper; authority boundaries are the object to be designed and tested.

### 2.4 Guardrails must be pedagogical, not merely safety filters

The strongest current evidence suggests that the educational consequences of generative AI depend on interaction design. Broader analyses likewise identify both substantial educational opportunities and risks rather than an inherently beneficial technology [15]. Kestin et al. [1] reported stronger learning in a structured AI-tutoring condition than in an active-learning comparison, while Bastani et al. [3] found that unguarded assistance harmed later unaided performance and that teacher-designed hints mitigated the effect. These studies differ in population, subject, duration, and comparison, but together they reject a capability-only view. An educational guardrail must shape the learning process: it should manage when explanations, prompts, examples, solutions, checks, and production help appear, and what independent performance follows.

OpenPBL therefore treats guardrails as an instructional and governance architecture. Content safety remains necessary, but it is insufficient. A pedagogical guardrail must preserve curricular validity, productive struggle, verification, revision, and human authority. It must also produce records that allow teachers and researchers to inspect whether the intended design was enacted.

### 2.5 Prior knowledge, adaptation, and curricular validity

Adaptive learning often begins with learner modelling, but personalization can become educationally invalid when a system confuses prerequisite knowledge with the new content that instruction is intended to teach. Prerequisite-aware recommendation demonstrates the value of modelling conceptual dependencies rather than matching only learner preferences or metadata [16]. However, a dependency is not automatically a legitimate pretest target. A construct is a prerequisite only if it is expected prior knowledge, necessary for access to the lesson, and observable through a diagnostic task.

This distinction matters for fairness and interpretation. Testing new lesson targets before teaching can disadvantage novices and turn personalization into premature tracking. Conversely, omitting genuine prerequisites can cause students to fail core instruction for reasons unrelated to the intended learning goal. OpenPBL addresses this problem through role-labelled curriculum nodes, typed dependency edges, one-to-one diagnostic-remediation mappings, and independent semantic review.

### 2.6 Regulation, evidence, and teacher orchestration

SRL comprises cyclical processes of forethought, performance, and reflection; collaborative learning also involves co-regulation and socially shared regulation [17]. A recent mapping review found that AI-SRL research concentrates on cognition and metacognition, underexamines motivation, overrepresents higher education, and often lacks explicit SRL theory [18]. Multimodal and trace data may make regulation more visible, but observed activity is not equivalent to a psychological state or learning [19].

Teachers therefore remain essential interpreters. Classroom orchestration involves managing multiple activities, time constraints, social configurations, and learning goals [20]. Teacher-facing analytics can improve awareness, but effective designs complement rather than replace professional judgment [2, 21]. OpenPBL uses evidence to prioritize attention and gate progression, but does not grant AI final authority over consequential assessment or stage transitions.

## 3. Conceptual Framework: Pedagogical Authority as an Executable Control Plane

An authority topology becomes useful only when it changes what software permits. We therefore model pedagogical authority as a typed control plane: it does not itself generate lessons or artifacts; it specifies which actor may perform which operation under which state, what evidence must be preserved, how a decision can be reversed or contested, and who retains the terminal judgment. An authority rule is compileable only when it declares an actor, state precondition, permitted operation, immutable record, reversal path, and final human decision. Table 1 applies this grammar to five domains.

### Table 1. Distribution of authority in OpenPBL

| Authority | Core question | Primary human authority | Permitted AI/system role | Non-delegable boundary |
|---|---|---|---|---|
| Curricular | What knowledge is prior, core, or optional? | Teacher inspects and may revise goals, roles, and dependencies | Generate and semantically review a draft graph; compile typed relations | AI cannot silently redefine teacher-approved learning goals |
| Instructional | What sequence constitutes teaching and assessment? | Teacher sets course intent and may edit the plan | Produce explanation, example, guided practice, feedback, and a bounded terminal assessment | Practice cannot be relabelled as mastery; enrichment cannot replace core instruction |
| Adaptive | What support follows learner evidence? | Student engages; teacher can inspect or intervene | Diagnose specified prerequisite gaps, route remediation, select time-contingent enrichment | AI cannot use global ability labels to skip the full main lesson |
| Productive | Who changes the project artifact? | Student frames tasks, requests edits, accepts or undoes changes | Apply whitelisted append/replace operations under explicit delegation | AI cannot submit work, complete a stage, or conceal its contribution |
| Evaluative | Who decides readiness, quality, or progression? | Student submits; teacher makes consequential judgments | Validate structural evidence, surface risks, and recommend attention | AI cannot confirm teacher decisions or become the final assessor |

{{FIGURE_COAGENCY}}

This topology reframes “human in the loop.” A human click is not meaningful control if the system has already collapsed the decision space or obscured the basis of an action. Conversely, direct AI contribution is not necessarily a loss of agency if the learner initiated a bounded task, can inspect the change, understands its source, can reject or undo it, and must still provide evidence of understanding and revision. Meaningful control depends on **scope, visibility, reversibility, and retained consequence**.

Five design principles follow.

**DP1: Curriculum before personalization.** Personalization must operate inside an explicit curriculum model that distinguishes expected prior knowledge, lesson targets, and optional extension.

**DP2: Teach before judging.** Core instruction should move through explanation, worked or visible reasoning, ungraded practice, and feedback before a single graded terminal mastery assessment.

**DP3: Remediate evidence-specific gaps, not global learner labels.** Adaptive support should respond to identified prerequisite evidence and then return every learner to the full lesson.

**DP4: Delegate productively, retain agency consequentially.** AI changes to learner artifacts must be explicitly requested, narrowly scoped, attributable, conflict-aware, and reversible; students retain submission authority.

**DP5: Progress through evidence and human adjudication.** Stage completion should depend on evidence of inquiry, testing, interpretation, and revision, with teacher authority over consequential evaluation and intervention.

These principles form a conjecture map: if curricular boundaries are explicit, support is sequenced around learning, delegation is reversible, and progression requires evidence, then AI may increase useful assistance without necessarily displacing the learner's epistemic work. The conjecture remains empirical; the present study evaluates only whether the artifact faithfully embodies the hypothesized mechanisms.

## 4. Research Design

### 4.1 Educational design research orientation

The study follows an educational design research orientation in which theory, design, implementation, and analysis inform one another in iterative cycles [22]. The object of analysis is not a generic software platform but a set of educational conjectures embodied in an executable artifact. The current paper documents the artifact and conducts a formative fidelity evaluation. It does not constitute an effectiveness trial.

Five redesign cycles were consolidated in the August 2026 snapshot:

1. foundation-first deep-interactive teaching;
2. managed recovery for course generation while preserving quality checkpoints;
3. a strict prerequisite diagnostic-remediation loop;
4. a role-aware curriculum knowledge graph; and
5. direct but reversible AI collaboration in the student workspace.

The cycles were documented in architecture-decision records and implemented across course generation, instructional sequencing, adaptation, project workspaces, evidence models, stage gates, and teacher-facing support.

### 4.2 Artifact and audit corpus

The audit corpus comprised five accepted architecture-decision records, their linked implementation modules, the curriculum and learning-evidence data models, and 14 targeted test files selected because they directly exercised the new educational mechanisms. The implementation snapshot contained 58 server API routes and 47 persistent data models. These counts describe artifact scope, not educational quality.

The fidelity audit used a theory-to-mechanism traceability procedure:

1. Each design principle was decomposed into observable system obligations.
2. Each obligation was mapped to data structures, validation rules, runtime policies, user actions, and tests.
3. Contradictory permissions were searched for, particularly routes by which AI could bypass teaching, evidence, submission, or teacher authority.
4. Targeted regression tests were executed on the current development snapshot.
5. Deviations were classified as missing mechanisms, implementation defects, or specification-test mismatches.

This procedure establishes whether intended constraints are executable and testable. It does not establish that teachers or students experience the constraints as intended.

### 4.3 Evaluation criteria

We assessed five dimensions: (a) **curricular fidelity**, whether prerequisite and lesson roles remain distinguishable; (b) **instructional fidelity**, whether practice precedes and remains distinct from mastery assessment; (c) **adaptive specificity**, whether remediation is tied to diagnosed prerequisite evidence; (d) **delegation accountability**, whether AI artifact changes are explicit, attributable, conflict-aware, and reversible; and (e) **human authority**, whether submission, consequential evaluation, and progression remain human-governed.

### 4.4 Ethical scope

No human participants, classroom data, demographic data, or student work were collected for this study. Tests used synthetic fixtures. Consequently, institutional-review status, consent, and participant protection are not applicable to the reported audit. Any classroom deployment must add informed consent or appropriate educational research authorization, data minimization, age-appropriate transparency, privacy review, accessibility testing, model-risk procedures, and a non-AI participation pathway consistent with local requirements and UNESCO guidance [23].

## 5. OpenPBL System Architecture and Executable Mechanisms

### 5.1 A unified, inspectable course-entry package

Course authoring begins with a unified generation package rather than disconnected prompts. The package specifies the assumed educational stage, course depth, knowledge ladder, authentic prerequisites, one diagnostic item and one remediation resource per prerequisite, main lesson targets, and optional extensions. A deterministic compiler assigns stable identifiers and constructs a role-aware graph; an independent model review returns a revised complete blueprint rather than isolated comments. Deterministic validation then checks cardinality, identifiers, typed edges, diagnostic-remediation correspondence, and terminal-assessment anchoring before an atomic save.

This architecture separates generative judgment from enforceable structure. A model may propose that concept A is required for lesson target B, but only a typed `required-prerequisite` relation with required strength may activate a diagnostic. Supportive or helpful relations remain visible without becoming gates. Teachers can inspect and revise the resulting graph and plan.

### 5.2 Role-aware curriculum knowledge graph

Each curriculum node has an instructional role: `prerequisite` or `lesson`. Lesson nodes describe intended new learning and mastery boundaries. Prerequisite nodes describe expected prior knowledge, observable evidence, and a diagnostic boundary. Edges include a type, strength, and rationale. This design guards against a common personalization error: using a broad semantic association as if it were a necessary dependency.

The graph also supports reverse dependency analysis. Teachers can inspect which later stage or knowledge rung depends on a prerequisite and why. The graph is therefore both a machine-readable control structure and a teacher-facing curriculum argument.

The current implementation requires at least one prerequisite. This conservative rule prevents an empty diagnostic plan, but it is not universally valid: some genuinely foundational lessons may have no meaningful content prerequisite beyond general participation skills. We treat this as an identified limitation rather than a settled educational principle. A future revision should permit an audited zero-prerequisite decision and test whether reviewers can distinguish legitimate absence from generation failure.

### 5.3 Foundation-first deep-interactive instruction

The main lesson follows a stable instructional grammar:

1. explain the foundational concept;
2. show a concrete example or visible reasoning process;
3. provide ungraded guided practice with feedback; and
4. administer one graded terminal mastery assessment after teaching.

Interactive tools are selected for epistemic function rather than novelty. A whiteboard may expose a worked reasoning path, compare misconceptions, or transform representations. Code, simulation, 3D, game, or diagram widgets are inserted when they support the concept and are paired with guided practice. Earlier quiz-like events are compiled into practice or merged into the terminal assessment. The terminal assessment is bounded to four to eight knowledge-point-tagged questions and a limited share of instructional time.

The key boundary is that adaptation does not fragment the core lesson. Students who receive prerequisite remediation still complete the full main course. Enrichment occurs only after the sole mastery assessment and only if time remains; it is ungraded and followed by no additional assessment. This prevents personalization from becoming curricular exclusion.

### 5.4 Strict prerequisite diagnosis and remediation

For each approved prerequisite, the system provides exactly one diagnostic question and one linked remediation resource. Diagnostic evidence is interpreted per knowledge point. A gap routes the student to the corresponding remediation and then back to the main lesson. The system does not infer a global ability label or a reduced curriculum. The one-to-one mapping also makes adaptation auditable: a teacher can ask what evidence triggered which support.

This strictness trades breadth for interpretability. One item cannot provide a reliable psychometric estimate of a complex construct. In the current design, the pretest is a low-stakes routing signal, not a mastery judgment. Classroom research should examine false positives and false negatives, and future versions may use brief adaptive probes where stakes or construct breadth require stronger evidence.

### 5.5 Reversible delegation in the collaborative workspace

The most substantial redesign concerns productive authority. Students can ask an AI companion to update approved fields in proposal and making workspaces. The operation is allowed only when an explicit task or request exists and only for a whitelist of targets. The AI returns a structured patch specifying target, mode (`append` or `replace`), and content. Each applied operation records the target, before value, after value, companion role, task, and time.

Undo is conditional. If the field still contains the AI-produced value, the student can revert it. If the field has since changed, the system blocks automatic undo to avoid erasing later student or peer work. This conflict rule turns reversibility from a cosmetic history button into protection against silent overwrite. AI cannot submit an artifact, confirm a teacher decision, or complete a stage.

The educational purpose is not to maximize automated production. It is to let students practice delegation itself: specifying a task, evaluating a contribution, deciding whether it fits their intent, revising or rejecting it, and remaining accountable for the submitted work. Provenance makes these decisions available for reflection and process assessment.

### 5.6 Evidence-gated project progression

Project stages require typed evidence rather than generic activity counts. Evidence can represent intent, plans, source checks, artifact versions, test results, revision decisions, presentation materials, reflection, and teacher confirmation. For the making stage, an uploaded artifact is insufficient. Readiness requires linked test and revision evidence for the configured number of iterations. A revision record identifies the interpretation, reason, planned change, and next goal associated with an iteration.

The support engine uses structural completeness and submitted or teacher-confirmed evidence before producing process evaluation. Missing or contradictory evidence yields an insufficient-evidence state rather than a confident score. Signals prioritize teacher attention, while consequential decisions remain with teachers. This design aligns the system's data model with PjBL's process orientation: what matters is not only that a product exists, but that students investigated, tested, interpreted, and revised.

{{FIGURE_SEQUENCE}}

## 6. Formative Artifact Evaluation

### 6.1 Traceability from principles to executable mechanisms

Table 2 summarizes the audit. Every design principle had representation at the levels of data, runtime policy, user action, and test, although strength and empirical validity vary.

### Table 2. Theory-to-mechanism traceability

| Principle | Executable mechanism | Observable record | Boundary test |
|---|---|---|---|
| DP1 Curriculum before personalization | Role-labelled nodes; typed and weighted dependency edges; independent semantic review | Compiled graph, rationale, diagnostic boundary | Lesson nodes and merely supportive edges cannot trigger prerequisite routing |
| DP2 Teach before judging | Foundation-example-practice policy; quiz consolidation; one terminal assessment | Ordered course actions and knowledge-point tags | Practice remains ungraded; enrichment appears only after terminal assessment |
| DP3 Evidence-specific remediation | One question and one resource per prerequisite; per-knowledge-point readiness | Diagnostic response and remediation selection | Remediation cannot replace or shorten the main lesson |
| DP4 Reversible delegation | Explicit request, whitelisted structured patches, provenance, conflict detection, undo | Before/after operation ledger | AI cannot submit, confirm, complete a stage, or overwrite a diverged field on undo |
| DP5 Evidence and human adjudication | Typed evidence, iteration readiness, insufficient-evidence state, teacher interventions | Test-result/revision pairs, submissions, teacher status | Artifact upload alone cannot satisfy making readiness; AI cannot finalize evaluation |

The traceability audit also found an important conceptual change from the earlier OpenPBL design. The previous prohibition on direct AI editing was simpler to explain but treated all productive assistance as equivalent. The revised design distinguishes an AI action's **scope and consequence**. Bounded editing can be delegated; epistemic endorsement, final submission, and consequential evaluation cannot.

### 6.2 Targeted regression evidence

Fourteen targeted test files covering course-entry generation, knowledge-role validation, adaptive routing, deep-interaction sequencing, terminal assessment, teaching-tool planning, workspace operations, companion guidance, learning-evidence readiness, and stage gates were executed against the development snapshot. The run on 13 August 2026 completed with 14/14 test files and 111/111 tests passing in 14.50 seconds.

The result demonstrates conformance of the tested snapshot to selected pedagogical contracts: lesson nodes cannot trigger prerequisite diagnosis; enrichment cannot precede the terminal assessment; undo cannot overwrite a diverged field; and artifact upload alone cannot satisfy making-stage readiness. It is neither a full-repository verification nor evidence of production reliability or educational effect.

### 6.3 What the fidelity results do and do not show

The audit supports three bounded claims. First, the proposed authority topology is technically realizable within a full-stack PjBL environment. Second, the new design principles are represented by enforceable constraints rather than prompt-only intentions. Third, the artifact produces records that could support later process research.

The audit does **not** show that students learn more, remain more agentic, feel greater ownership, or become less dependent on AI. It does not show that teachers interpret the graph or dashboard correctly, that one-item prerequisite routing is valid, or that the added evidence burden is acceptable. Passing tests establish conformance to specified behaviour, not the educational value of that behaviour.

## 7. Comparative Study Protocol and Synthetic Pipeline Dry Run

**SYNTHETIC PLACEHOLDER—NOT EMPIRICAL RESULTS.** No participant produced the values in this section. They are seeded simulation records used only to test whether the proposed comparisons, tables, graphics, and analysis code behave coherently. Every value must be replaced with approved human-participant data before submission; none supports a claim that OpenPBL improves learning, agency, or workload.

### 7.1 Falsifiable comparative design

The intended study is a preregistered, cluster-randomized comparison with four conditions: (C1) PjBL without generative AI; (C2) PjBL with an unrestricted general-purpose LLM; (C3) role-based AI tutoring and collaboration without OpenPBL's authority compiler, evidence gates, or reversible artifact operations; and (C4) full OpenPBL. C1 estimates the contribution and cost of AI access, C2 tests whether immediate productivity can diverge from independent learning, C3 separates social-role organization from executable authority governance, and C4 tests the complete design. Randomization should occur at class or team level to limit contamination, with baseline achievement and teacher effects handled in the allocation and model.

The primary confirmatory outcome is delayed, unaided transfer aligned with lesson targets. Secondary outcomes are immediate posttest, artifact quality scored blind to condition, epistemic agency, cognitive offloading, evidence-chain integrity, and teacher intervention minutes per team. The critical contrast is C4 versus C3: it tests whether executable authority boundaries add value beyond role-based AI. C4 versus C2 tests whether guardrails preserve transfer and evidence without erasing productive assistance. Artifact quality must never stand alone because fluent AI production can mask weak independent understanding [3, 4].

### 7.2 Analysis and reporting plan

The confirmatory model should estimate delayed transfer from condition while adjusting for pretest, class clustering, and prespecified teacher and subject factors. Secondary models should use the same contrast matrix, multiplicity control, effect sizes with confidence intervals, missing-data sensitivity analyses, and an intention-to-treat estimand. Process analysis should test preregistered mediation by verification and evidence-chain quality, but mediation would remain associational unless its assumptions are defended. Equity analysis should report heterogeneous effects by prior knowledge and accessibility needs without using small subgroups for automated decisions. Adverse outcomes—false prerequisite routing, unverified AI content, fabricated evidence, inaccessible interaction, privacy incidents, and alert fatigue—must be reported alongside benefits.

### 7.3 Seeded data-generating scenario

To debug the pipeline, we generated 240 synthetic records (60 per condition) with NumPy's PCG64 generator and fixed seed 20260813. Baseline scores were drawn from the same distribution. The scenario deliberately encodes overlapping, imperfect trends rather than deterministic superiority: unrestricted LLM access raises immediate posttest and artifact quality but increases offloading and weakens delayed transfer; role-based AI improves productive outcomes but only partly protects agency; full OpenPBL improves delayed transfer and evidence integrity while reducing teacher intervention time. These are assumptions chosen to expose whether the planned measures can distinguish productivity, learning, agency, and orchestration—not observed effects.

### Table 3. SYNTHETIC PLACEHOLDER descriptive learning outcomes, mean (SD)

| Condition | n | Pretest | Posttest | Delayed transfer | Project quality |
|---|---:|---:|---:|---:|---:|
| PjBL only | 60 | 67.7 (8.7) | 72.2 (9.8) | 68.5 (9.6) | 69.8 (7.9) |
| PjBL + unrestricted LLM | 60 | 65.5 (7.7) | 72.3 (8.9) | 65.4 (8.2) | 77.8 (7.0) |
| Role-based AI | 60 | 68.3 (9.7) | 77.3 (11.3) | 71.1 (11.1) | 79.8 (7.8) |
| Full OpenPBL | 60 | 67.7 (8.8) | 79.1 (9.0) | 76.8 (9.5) | 81.8 (7.8) |

### Table 4. SYNTHETIC PLACEHOLDER agency, evidence, and orchestration outcomes, mean (SD)

| Condition | Agency (1-5) | Offloading (1-5) | Evidence integrity (%) | Teacher minutes |
|---|---:|---:|---:|---:|
| PjBL only | 3.7 (0.5) | 2.4 (0.5) | 63.6 (8.6) | 15.3 (2.6) |
| PjBL + unrestricted LLM | 3.2 (0.4) | 3.4 (0.5) | 55.3 (9.8) | 11.1 (2.5) |
| Role-based AI | 3.7 (0.6) | 2.9 (0.5) | 63.6 (8.1) | 12.1 (2.2) |
| Full OpenPBL | 4.0 (0.4) | 2.3 (0.5) | 84.7 (8.6) | 9.1 (2.2) |

{{FIGURE_SYNTHETIC}}

### 7.4 Pipeline interpretation

In the synthetic dry run, mean delayed transfer was 68.5 (9.6) in C1, 65.4 (8.2) in C2, 71.1 (11.1) in C3, and 76.8 (9.5) in C4. The unrestricted condition produced higher artifact quality than PjBL alone while showing the lowest agency and evidence integrity. Full OpenPBL showed the highest delayed transfer, agency, and evidence integrity and the lowest teacher-intervention time. This joint pattern is useful because it makes the paper's claim falsifiable: real data could show that the controls add friction without learning benefit, that role-based AI is sufficient, or that OpenPBL's advantage is confined to documentation rather than learning.

No p-value is reported because inferential significance on invented observations would be meaningless. The dry run has three legitimate outputs only: a frozen schema and contrast plan, confirmation that the analysis distinguishes the intended constructs, and an explicit replacement checklist. Before submission, researchers must preregister the protocol, obtain ethics approval, replace the CSV, regenerate Tables 3-4 and Figure 3, archive the analytic code, and rewrite Sections 7.3-7.4 and all claims that depend on them.

## 8. Discussion

### 8.1 From AI roles to an authority topology

Many educational systems describe AI through social roles such as tutor, peer, critic, or assistant. Roles help users form expectations, but they are under-specified for governance. A “peer” may merely suggest an idea or may rewrite a student's artifact; a “tutor” may ask a question or decide mastery. The authority topology adds a more precise layer: for each consequential domain, it specifies who initiates, who may act, what evidence is required, who can reverse the action, and who decides.

This is the paper's primary theoretical contribution. It connects student-AI collaboration to curriculum design, adaptive instruction, PjBL evidence, and teacher orchestration. It also offers a unit for comparative research. Systems that use the same model and interface may create different learning conditions because they allocate productive and evaluative authority differently.

### 8.2 Reversible delegation as a middle position

Debates about generative AI in education often contrast unrestricted use with prohibition. OpenPBL implements a middle position. Students may delegate bounded productive work, but the delegation is explicit, visible, and reversible. This recognizes that learning to work with AI includes learning to specify, inspect, challenge, and integrate machine contributions. At the same time, it prevents a request for help from silently becoming authorship transfer.

Reversibility alone is insufficient. Students may approve AI text without understanding it, and provenance can become an ignored log. The learning mechanism depends on associated practices: students should explain why a contribution was kept, identify what they verified, link changes to evidence, and demonstrate unaided or differently supported performance. The system's test-result and revision-decision records create opportunities for those practices, but their quality must be studied.

### 8.3 Curriculum anchoring limits adaptive overreach

OpenPBL's role-aware graph addresses a subtle but consequential failure mode. Personalization is often framed as matching content to a learner, but without an explicit curricular boundary the system may decide that weak prelesson performance justifies removing or simplifying the very content the lesson is meant to teach. By separating prerequisite from lesson nodes and returning every learner to the full main lesson, the design constrains adaptation to access support rather than curricular tracking.

The approach also reveals unresolved measurement questions. A single diagnostic item is interpretable and low burden, but noisy. Required typed edges improve validity only if the generated or teacher-edited dependency is correct. The graph should therefore be treated as a contestable curriculum model, not ground truth.

### 8.4 Evidence can support agency or become compliance

Evidence-gated progression is intended to protect inquiry from product-only evaluation. Yet additional forms can become bureaucratic compliance, especially if students generate plausible test and reflection records after the fact. Evidence design must balance structure with authenticity. High-quality evidence should be close to the action it represents, connected across iterations, and useful to the learner or teacher rather than collected solely for analytics.

This risk argues for mixed-method evaluation. Log completeness alone cannot establish regulation or agency. Researchers should combine interaction traces with artifact histories, think-aloud or stimulated-recall interviews, independent performance tasks, classroom observation, and teacher interpretation. Multimodal data may add temporal resolution, but inference claims must remain proportional to the evidence [19].

### 8.5 Implications for AIED design and scholarship

For designers, the framework suggests that prompts should be the last rather than the only line of defence. Authority boundaries should also live in schemas, validators, operation whitelists, state transitions, audit records, and user-facing controls. For educators, generated curriculum graphs and adaptive paths should be inspectable arguments. For researchers, implementation fidelity should be reported separately from learning effects, and unaided transfer should be measured whenever AI performs substantial task work.

The framework is relevant beyond PjBL. Writing tutors, inquiry environments, design studios, coding platforms, and collaborative problem-solving systems all distribute the same five forms of authority. The specific evidence types will differ, but the questions of curricular scope, instructional sequence, adaptation, productive delegation, and consequential evaluation remain.

## 9. Limitations and Threats to Validity

The study has substantial limitations.

First, it is a design and fidelity study with no human participants. Educational benefits and harms remain hypotheses. Second, the theory-to-mechanism mapping was produced within the development project and was not independently coded; confirmation bias is possible. Third, the targeted regression set is not the entire repository suite; 111 passing tests show only that selected boundaries conform in the current snapshot. The code revision, dependency environment, model versions, prompts, and complete tests must be frozen and independently reproducible before empirical deployment.

Fourth, the enforced minimum of one prerequisite may manufacture a dependency for genuinely foundational lessons. Fifth, some default knowledge ladders are tailored to common AI topics and may over-prescribe other domains, cultures, or curricula. Sixth, one-question routing has limited reliability and can misclassify students. Seventh, model-generated graphs, explanations, feedback, and edits can be incorrect, biased, age-inappropriate, or homogenizing despite structural controls.

Eighth, provenance and undo do not guarantee meaningful consent or understanding. Interface defaults, social pressure, or time constraints may still encourage uncritical acceptance. Ninth, typed evidence can privilege what the platform can capture and disadvantage valid offline, embodied, collaborative, or creative work. Tenth, teacher oversight can create workload rather than reduce it if signals are poorly calibrated. Finally, privacy, accessibility, language variation, and unequal access require local evaluation, particularly in K-12 settings.

## 10. Empirical Research Agenda

The artifact is ready for co-design and feasibility research, not a definitive outcome claim. We propose three stages.

### 10.1 Stage 1: Teacher co-design and validity study

Teachers from the intended grade levels and subject domains should inspect generated curriculum graphs, prerequisite classifications, diagnostic items, remediation resources, terminal assessments, evidence missions, and intervention signals. Measures should include content-validity ratings, disagreement rationales, correction time, perceived decision authority, and workload. Expert review should explicitly test whether the hard minimum of one prerequisite manufactures dependencies, as well as domains outside the current AI-oriented defaults.

### 10.2 Stage 2: Classroom feasibility and mechanism pilot

A multi-class pilot should examine whether students understand AI roles, delegation, provenance, undo, evidence requirements, and teacher authority. Data should include system traces, screen and classroom observation, artifact histories, student interviews, teacher stimulated recall, support incidents, accessibility issues, and model errors. Primary feasibility criteria should be defined in advance: completion, integrity of evidence chains, frequency and success of undo, proportion of teacher signals judged useful, latency, and adverse events. No efficacy conclusion should be drawn from convenience comparisons.

### 10.3 Stage 3: Comparative effectiveness study

After co-design and feasibility criteria are met, a preregistered cluster-randomized or carefully matched study can compare four conditions: PjBL without generative AI, PjBL with an unrestricted general-purpose LLM, role-based AI without authority compilation or evidence gates, and full OpenPBL. The primary outcome should be delayed, unaided transfer aligned with lesson targets. Secondary outcomes should include conceptual achievement, artifact quality, verification accuracy, revision quality, persistence after AI withdrawal, epistemic agency, ownership, trust calibration, collaboration quality, equity, and teacher orchestration workload. The C3-versus-C4 contrast is essential because it separates role richness from executable authority governance.

Adverse outcomes should be treated as first-class results: copied but unverified content, reduced unaided performance, false prerequisite routing, evidence fabrication, inaccessible interactions, biased suggestions, privacy incidents, and teacher alert fatigue. The agenda tests a proposition that can fail: bounded authority control may protect learning better than unrestricted assistance, but it may instead add friction, documentation burden, or teacher work.

## 11. Conclusion

OpenPBL addresses more than the addition of another agent role. Once generative AI enters an end-to-end project-learning process, curricular, instructional, adaptive, productive, and evaluative authority must remain visible, executable, and accountable. The system compiles pedagogical principles into a role-aware curriculum graph, strict prerequisite remediation, one post-instruction mastery assessment, whitelisted and reversible artifact operations, typed evidence chains, student submission, and teacher adjudication.

The formative evaluation shows that these boundaries can become inspectable software contracts: all 111 tests across 14 targeted files passed. Engineering conformance is not learning effect. The synthetic values in Section 7 demonstrate only that the proposed data schema and analysis pipeline run; they establish no condition as superior. OpenPBL's warranted status is therefore an original and falsifiable system design organized around a pedagogical-authority control plane. Claims about learning, agency, or workload require teacher co-design, classroom feasibility evidence, and a preregistered comparative trial.

## Data and Artifact Availability

The analyzed artifact is the OpenPBL development snapshot of 13 August 2026. All 111 tests in 14 targeted files passed. The 240 records in Section 7 were generated with fixed seed 20260813 and carry `synthetic_placeholder=true` on every row; they exist only to debug the pipeline. Before classroom research, the authors should freeze the source revision, schema, architecture-decision records, prompt and model configuration, dependency environment, test commands, analysis code, and data dictionary. No human-participant data were collected.

## Author Contributions, Funding, and Competing Interests

These statements are withheld for anonymous review. The non-anonymous version should report contributions using the CRediT taxonomy, identify all funding, and disclose relevant financial or non-financial interests.

## References

[1] Kestin G, Miller K, Klales A, Milbourne T, Ponti G. AI tutoring outperforms in-class active learning: An RCT introducing a novel research-based design in an authentic educational setting. *Scientific Reports*, 2025, 15: 17458. https://doi.org/10.1038/s41598-025-97652-6

[2] Holstein K, McLaren B M, Aleven V. Co-designing a real-time classroom orchestration tool to support teacher-AI complementarity. *Journal of Learning Analytics*, 2019, 6(2): 27-52. https://doi.org/10.18608/jla.2019.62.3

[3] Bastani H, Bastani O, Sungu A, Ge H, Kabakcı Ö, Mariman R. Generative AI without guardrails can harm learning: Evidence from high school mathematics. *Proceedings of the National Academy of Sciences*, 2025, 122(26): e2422633122. https://doi.org/10.1073/pnas.2422633122

[4] Darvishi A, Khosravi H, Sadiq S, Gašević D, Siemens G. Impact of AI assistance on student agency. *Computers & Education*, 2024, 210: 104967. https://doi.org/10.1016/j.compedu.2023.104967

[5] Chen C-H, Yang Y-C. Revisiting the effects of project-based learning on students' academic achievement: A meta-analysis investigating moderators. *Educational Research Review*, 2019, 26: 71-81. https://doi.org/10.1016/j.edurev.2018.11.001

[6] Farshad S, Fortin C. An umbrella review of meta-analyses on project-based learning: Effects on academic achievement, higher-order thinking, and 21st-century skills. *Educational Research Review*, 2026, 52: 100809. https://doi.org/10.1016/j.edurev.2026.100809

[7] Hmelo-Silver C E, Duncan R G, Chinn C A. Scaffolding and achievement in problem-based and inquiry learning: A response to Kirschner, Sweller, and Clark (2006). *Educational Psychologist*, 2007, 42(2): 99-107. https://doi.org/10.1080/00461520701263368

[8] Kim N J, Belland B R, Walker A E. Effectiveness of computer-based scaffolding in the context of problem-based learning for STEM education: Bayesian meta-analysis. *Educational Psychology Review*, 2018, 30: 397-429. https://doi.org/10.1007/s10648-017-9419-1

[9] Kim J, Lee H, Cho Y H. Learning design to support student-AI collaboration: Perspectives of leading teachers for AI in education. *Education and Information Technologies*, 2022, 27: 6069-6104. https://doi.org/10.1007/s10639-021-10831-6

[10] Yu J F, Zhang-Li D, Zhang Z Y, et al. From MOOC to MAIC: Reimagine online teaching and learning through LLM-driven agents. *Journal of Computer Science and Technology*, 2026, 41(1): 394-414. https://doi.org/10.1007/s11390-025-6000-0

[11] Samuel A. Learning with machines: Toward a theory of epistemic co-agency. *Computers and Education: Artificial Intelligence*, 2026, 10: 100573. https://doi.org/10.1016/j.caeai.2026.100573

[12] Chaaban Y, Jung S-G, Medina J, Azem J Y, Salminen J, Jansen B J. Examining student teachers' agency in an AI-supported learning environment: Q methodology research. *International Journal of Artificial Intelligence in Education*, 2025, 35: 4083-4107. https://doi.org/10.1007/s40593-025-00529-y

[13] Kim J, Detrick R, Yu S, Song Y, Bol L, Li N. Socially shared regulation of learning and artificial intelligence: Opportunities to support socially shared regulation. *Education and Information Technologies*, 2025, 30: 11483-11521. https://doi.org/10.1007/s10639-024-13187-9

[14] Mouta A, Torrecilla-Sánchez E M, Pinto-Llorente A M. Where is agency moving to? Exploring the interplay between AI technologies in education and human agency. *Digital Society*, 2025, 4: 49. https://doi.org/10.1007/s44206-025-00203-9

[15] Kasneci E, Sessler K, Küchemann S, et al. ChatGPT for good? On opportunities and challenges of large language models for education. *Learning and Individual Differences*, 2023, 103: 102274. https://doi.org/10.1016/j.lindif.2023.102274

[16] Chanaa A, El Faddouli N. Prerequisites-based course recommendation: Recommending learning objects using concept prerequisites and metadata matching. *Smart Learning Environments*, 2024, 11: 16. https://doi.org/10.1186/s40561-024-00301-0

[17] Hadwin A F, Järvelä S, Miller M. Self-regulation, co-regulation, and shared regulation in collaborative learning environments. In: Schunk D H, Greene J A, eds. *Handbook of Self-Regulation of Learning and Performance*, 2nd ed. Routledge, 2018: 83-106. https://doi.org/10.4324/9781315697048-6

[18] Banihashem S K, Bond M, Bergdahl N, Khosravi H, Noroozi O. A systematic mapping review at the intersection of artificial intelligence and self-regulated learning. *International Journal of Educational Technology in Higher Education*, 2025, 22: 50. https://doi.org/10.1186/s41239-025-00548-8

[19] de Mooij S, Lämsä J, Lim L, et al. A systematic review of self-regulated learning through integration of multimodal data and artificial intelligence. *Educational Psychology Review*, 2025, 37: 54. https://doi.org/10.1007/s10648-025-10028-0

[20] Dillenbourg P. Design for classroom orchestration. *Computers & Education*, 2013, 69: 485-492. https://doi.org/10.1016/j.compedu.2013.04.013

[21] Possaghi I, Vesin B, Zhang F, et al. Integrating multi-modal learning analytics dashboard in K-12 education: Insights for enhancing orchestration and teacher decision-making. *Smart Learning Environments*, 2025, 12: 53. https://doi.org/10.1186/s40561-025-00410-4

[22] Wang F, Hannafin M J. Design-based research and technology-enhanced learning environments. *Educational Technology Research and Development*, 2005, 53: 5-23. https://doi.org/10.1007/BF02504682

[23] Miao F, Holmes W. *Guidance for Generative AI in Education and Research*. Paris: UNESCO, 2023.
