# OpenPBL: Curriculum-Anchored, Evidence-Gated, and Reversible Human-AI Co-Agency for Project-Based Learning

**Manuscript type:** Educational design research and formative artifact evaluation  
**Author information:** Anonymous for peer review  
**Target community:** International Journal of Artificial Intelligence in Education / AIED human-centred learning research  
**Development snapshot:** 13 August 2026

## Abstract

Generative artificial intelligence can expand access to explanation, feedback, and productive assistance, yet the same assistance can displace the cognitive and regulatory work through which students learn. This tension is especially consequential in project-based learning (PjBL), where authentic production, iterative inquiry, and learner ownership are both means and outcomes of learning. This paper presents OpenPBL, a design-research artifact that operationalizes **curriculum-anchored, evidence-gated, and reversible human-AI co-agency**. The design distributes five forms of authority across teachers, students, and AI: curricular, instructional, adaptive, productive, and evaluative authority. Authentic prerequisites are distinguished from lesson targets in a role-aware curriculum graph; instruction follows an explanation-example-practice-feedback sequence before one terminal mastery assessment; adaptation remediates diagnosed prerequisite gaps and offers time-contingent enrichment; and students may explicitly delegate bounded draft edits to AI while preserving provenance, conflict protection, undo, final submission, and teacher adjudication. We report a formative evaluation of the implemented design using architecture-decision records, source-level traceability, and 114 targeted regression expectations across 14 test files. The audit found that all five authority boundaries were represented in executable mechanisms, while 113 of 114 targeted expectations passed. The remaining failure exposed a contract mismatch between a legacy upload-only stage-gate expectation and the revised requirement for test-interpret-revision evidence. Because no human participants or learning-outcome data were included, the study does not claim improved achievement, agency, or teacher workload. Its contributions are a theoretically grounded authority topology for educational human-AI collaboration, five reusable design principles, an auditable implementation pattern for reversible delegation, and a staged empirical agenda for evaluating learning, agency, and classroom orchestration.

**Keywords:** artificial intelligence in education; project-based learning; human-AI collaboration; learner agency; adaptive learning; self-regulated learning; educational design research; learning evidence

## 1. Introduction

Generative AI has made high-quality-seeming explanation, feedback, planning, and production support available at unprecedented scale. Well-designed AI tutoring can improve learning and engagement in bounded contexts (Kestin et al., 2025), and AI can augment teachers' capacity to provide timely guidance (Holstein et al., 2019). However, helpfulness is not equivalent to learning. In a large high-school mathematics field experiment, unguarded generative AI improved assisted practice performance but reduced subsequent unaided performance, whereas pedagogical guardrails mitigated the harm (Bastani et al., 2025). In peer feedback, students tended to rely on rather than learn from AI assistance when the support was removed (Darvishi et al., 2024). These findings shift the design question from whether AI should assist students to **which work AI may perform, under whose authority, with what evidence, and with what path back to independent performance**.

The problem is acute in PjBL. PjBL organizes learning around sustained inquiry into authentic problems and the creation, testing, and revision of public or inspectable products. Meta-analytic evidence generally supports positive effects, but the magnitude varies by design and context (Chen & Yang, 2019), and a recent umbrella review cautions that the methodological quality of available meta-analyses remains low despite a consistently positive direction (Farshad & Fortin, 2026). PjBL is therefore not a self-executing intervention. Students need calibrated scaffolding for problem framing, knowledge building, inquiry, collaboration, iteration, and reflection (Hmelo-Silver et al., 2007; Kim et al., 2018). Generative AI can provide such scaffolding, but it can also collapse an inquiry into an answer, a design process into a generated artifact, or reflection into plausible prose.

Existing AIED research provides important but fragmented responses. Intelligent tutoring research structures hints and feedback around domain models. Learning analytics supports teacher orchestration. Self-regulated learning (SRL) research emphasizes planning, monitoring, and reflection. Human-centred AI calls for meaningful human control. Student-AI collaboration research frames AI as a learning mate rather than a passive tool (Kim, Lee, & Cho, 2022). Yet educational systems increasingly combine all these functions: they map curriculum, generate courses, diagnose prior knowledge, tutor, collaborate on artifacts, monitor activity, and recommend interventions. When those functions are designed independently, authority can drift. A prerequisite diagnostic may test new lesson content; an adaptive engine may skip core instruction; a collaborator may silently overwrite a student's idea; a dashboard may turn probabilistic inference into a consequential judgment; or multiple agents may optimize local helpfulness while eroding coherence.

OpenPBL was redesigned in response to this integration problem. Its earlier architecture treated AI mainly as role-delimited companions that could explain, question, critique, and review but not directly modify a learner's project artifact. The current design adopts a more demanding position: protecting agency does not require prohibiting all AI contribution. Instead, agency can be supported through **constrained, inspectable, attributable, and reversible delegation**, provided that students retain consequential authority and that progress depends on evidence of learning rather than artifact presence alone.

This paper asks:

**RQ1.** How can an AIED system operationalize curricular boundaries so that personalization diagnoses genuine prerequisites without pretesting or replacing lesson targets?

**RQ2.** How can generative AI participate as both tutor and project teammate while preserving learner epistemic agency and teacher authority across PjBL?

**RQ3.** To what extent does the implemented OpenPBL artifact faithfully instantiate these principles, and what remains to be established before claims about educational effectiveness are warranted?

The paper makes four contributions. First, it proposes a five-part **authority topology** for curricular, instructional, adaptive, productive, and evaluative decisions. Second, it derives five reusable design principles for curriculum-anchored and evidence-gated co-agency. Third, it shows how those principles can be compiled into inspectable system constraints, including role-aware knowledge graphs, a strict prerequisite loop, a single terminal mastery assessment, reversible workspace operations, and evidence-dependent stage progression. Fourth, it distinguishes implementation fidelity from educational efficacy and specifies a classroom research program capable of testing the proposed mechanisms.

## 2. Theoretical and Empirical Background

### 2.1 PjBL requires scaffolding without appropriation

PjBL places students in uncertain problem spaces where goals, evidence, methods, and quality criteria must be progressively clarified. This uncertainty is educationally productive but can overwhelm novices. Scaffolding therefore reduces nonproductive complexity while preserving the central intellectual work of the task (Hmelo-Silver et al., 2007). Computer-based scaffolding has a small-to-moderate positive effect in problem-based STEM contexts, with effectiveness varying by function and context (Kim et al., 2018). The design challenge is not merely to provide more help, but to calibrate help so that it supports participation and then makes learner competence visible.

Generative AI complicates this calibration because the same interface can explain a concept, generate an answer, propose a design, write an artifact, and evaluate the result. Traditional distinctions between a tutor, tool, peer, and assessor become porous. In PjBL, an AI-generated product may be superficially excellent while concealing weak conceptual understanding, limited verification, or minimal student decision-making. Accordingly, the unit of educational design must include not only the product but the sequence of inquiry, evidence, decisions, and revisions that produced it.

### 2.2 From student-AI interaction to co-agency

Teachers envision productive student-AI collaboration as evolving from learning about AI, to learning from AI, to learning together with AI. They also emphasize authentic tasks, process-oriented assessment, disciplinary knowledge, error analysis, and a safe-to-fail culture (Kim, Lee, & Cho, 2022). This view treats AI as a participant in activity rather than a neutral delivery channel. Recent work on epistemic co-agency similarly argues that learners must reason with, through, and against AI while retaining responsibility for knowledge claims (Samuel, 2026).

Co-agency is not automatically empowering. Student teachers exhibit distinct agency profiles in AI-supported learning environments, including balanced engagement and uncritical reliance (Chaaban et al., 2025). In collaborative learning, students can imagine AI supporting planning, monitoring, and reflection, but lower domain knowledge may increase the likelihood of adopting AI suggestions without sufficient trial, evaluation, or ownership (Kim et al., 2025). Darvishi et al. (2024) further show that frequent AI support may produce dependence rather than transferable regulation. These findings imply that agency should be treated as a dynamic relation among people, technologies, tasks, and institutional rules, not as a stable learner trait or a binary “AI/no-AI” property (Mouta et al., 2025).

We define **human-AI co-agency for learning** as the negotiated distribution of initiative and action among learners, teachers, and AI in pursuit of educational goals, where the distribution remains visible, contestable, and accountable. **Epistemic agency** concerns responsibility for framing questions, judging evidence, and endorsing knowledge claims. **Productive agency** concerns control over creating and revising artifacts. **Evaluative authority** concerns consequential judgments about mastery, progression, and quality. The three should not be conflated: a student may delegate a productive action while retaining epistemic and evaluative responsibility.

### 2.3 Guardrails must be pedagogical, not merely safety filters

The strongest current evidence suggests that the educational consequences of generative AI depend on interaction design. Broader analyses likewise identify both substantial educational opportunities and risks rather than an inherently beneficial technology (Kasneci et al., 2023). Kestin et al. (2025) reported stronger learning in a structured AI-tutoring condition than in an active-learning comparison, while Bastani et al. (2025) found that unguarded assistance harmed later unaided performance and that teacher-designed hints mitigated the effect. These studies differ in population, subject, duration, and comparison, but together they reject a capability-only view. An educational guardrail must shape the learning process: it should manage when explanations, prompts, examples, solutions, checks, and production help appear, and what independent performance follows.

OpenPBL therefore treats guardrails as an instructional and governance architecture. Content safety remains necessary, but it is insufficient. A pedagogical guardrail must preserve curricular validity, productive struggle, verification, revision, and human authority. It must also produce records that allow teachers and researchers to inspect whether the intended design was enacted.

### 2.4 Prior knowledge, adaptation, and curricular validity

Adaptive learning often begins with learner modelling, but personalization can become educationally invalid when a system confuses prerequisite knowledge with the new content that instruction is intended to teach. Prerequisite-aware recommendation demonstrates the value of modelling conceptual dependencies rather than matching only learner preferences or metadata (Chanaa & El Faddouli, 2024). However, a dependency is not automatically a legitimate pretest target. A construct is a prerequisite only if it is expected prior knowledge, necessary for access to the lesson, and observable through a diagnostic task.

This distinction matters for fairness and interpretation. Testing new lesson targets before teaching can disadvantage novices and turn personalization into premature tracking. Conversely, omitting genuine prerequisites can cause students to fail core instruction for reasons unrelated to the intended learning goal. OpenPBL addresses this problem through role-labelled curriculum nodes, typed dependency edges, one-to-one diagnostic-remediation mappings, and independent semantic review.

### 2.5 Regulation, evidence, and teacher orchestration

SRL comprises cyclical processes of forethought, performance, and reflection; collaborative learning also involves co-regulation and socially shared regulation (Hadwin, Järvelä, & Miller, 2018). A recent mapping review found that AI-SRL research concentrates on cognition and metacognition, underexamines motivation, overrepresents higher education, and often lacks explicit SRL theory (Banihashem et al., 2025). Multimodal and trace data may make regulation more visible, but observed activity is not equivalent to a psychological state or learning (de Mooij et al., 2025).

Teachers therefore remain essential interpreters. Classroom orchestration involves managing multiple activities, time constraints, social configurations, and learning goals (Dillenbourg, 2013). Teacher-facing analytics can improve awareness, but effective designs complement rather than replace professional judgment (Holstein et al., 2019; Possaghi et al., 2025). OpenPBL uses evidence to prioritize attention and gate progression, but does not grant AI final authority over consequential assessment or stage transitions.

## 3. Conceptual Framework: An Authority Topology for Educational AI

The framework begins from a simple proposition: **an educational AI system is partly defined by who may make which consequential decision, on what basis, and whether that decision can be contested or reversed**. We distinguish five forms of authority (Table 1).

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

The study follows an educational design research orientation in which theory, design, implementation, and analysis inform one another in iterative cycles (Wang & Hannafin, 2005). The object of analysis is not a generic software platform but a set of educational conjectures embodied in an executable artifact. The current paper documents the artifact and conducts a formative fidelity evaluation. It does not constitute an effectiveness trial.

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

No human participants, classroom data, demographic data, or student work were collected for this study. Tests used synthetic fixtures. Consequently, institutional-review status, consent, and participant protection are not applicable to the reported audit. Any classroom deployment must add informed consent or appropriate educational research authorization, data minimization, age-appropriate transparency, privacy review, accessibility testing, model-risk procedures, and a non-AI participation pathway consistent with local requirements and UNESCO guidance (Miao & Holmes, 2023).

## 5. The Redesigned OpenPBL Intervention

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

## 6. Formative Fidelity Results

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

Fourteen targeted test files covering course-entry generation, knowledge-role validation, adaptive routing, deep-interaction sequencing, terminal assessment, teaching-tool planning, workspace operations, companion guidance, learning-evidence readiness, and stage gates were executed against the development snapshot. Of 114 expectations, 113 passed.

The single failing expectation is analytically useful. A legacy stage-gate test expected a submitted work file to satisfy making-stage readiness. The revised readiness model requires a completed test-interpret-revision cycle in addition to the artifact. The runtime gate blocked progression, consistent with DP5, while the older test expected acceptance. We therefore classify the failure as an unresolved specification-test mismatch. It must be corrected and the full suite rerun before an archival research release. The result also illustrates why executable design arguments are valuable: a pedagogical change can be traced to an explicit contract rather than hidden in interface behaviour.

### 6.3 What the fidelity results do and do not show

The audit supports three bounded claims. First, the proposed authority topology is technically realizable within a full-stack PjBL environment. Second, the new design principles are represented by enforceable constraints rather than prompt-only intentions. Third, the artifact produces records that could support later process research.

The audit does **not** show that students learn more, remain more agentic, feel greater ownership, or become less dependent on AI. It does not show that teachers interpret the graph or dashboard correctly, that one-item prerequisite routing is valid, or that the added evidence burden is acceptable. Passing tests establish conformance to specified behaviour, not the educational value of that behaviour.

## 7. Discussion

### 7.1 From AI roles to an authority topology

Many educational systems describe AI through social roles such as tutor, peer, critic, or assistant. Roles help users form expectations, but they are under-specified for governance. A “peer” may merely suggest an idea or may rewrite a student's artifact; a “tutor” may ask a question or decide mastery. The authority topology adds a more precise layer: for each consequential domain, it specifies who initiates, who may act, what evidence is required, who can reverse the action, and who decides.

This is the paper's primary theoretical contribution. It connects student-AI collaboration to curriculum design, adaptive instruction, PjBL evidence, and teacher orchestration. It also offers a unit for comparative research. Systems that use the same model and interface may create different learning conditions because they allocate productive and evaluative authority differently.

### 7.2 Reversible delegation as a middle position

Debates about generative AI in education often contrast unrestricted use with prohibition. OpenPBL implements a middle position. Students may delegate bounded productive work, but the delegation is explicit, visible, and reversible. This recognizes that learning to work with AI includes learning to specify, inspect, challenge, and integrate machine contributions. At the same time, it prevents a request for help from silently becoming authorship transfer.

Reversibility alone is insufficient. Students may approve AI text without understanding it, and provenance can become an ignored log. The learning mechanism depends on associated practices: students should explain why a contribution was kept, identify what they verified, link changes to evidence, and demonstrate unaided or differently supported performance. The system's test-result and revision-decision records create opportunities for those practices, but their quality must be studied.

### 7.3 Curriculum anchoring limits adaptive overreach

OpenPBL's role-aware graph addresses a subtle but consequential failure mode. Personalization is often framed as matching content to a learner, but without an explicit curricular boundary the system may decide that weak prelesson performance justifies removing or simplifying the very content the lesson is meant to teach. By separating prerequisite from lesson nodes and returning every learner to the full main lesson, the design constrains adaptation to access support rather than curricular tracking.

The approach also reveals unresolved measurement questions. A single diagnostic item is interpretable and low burden, but noisy. Required typed edges improve validity only if the generated or teacher-edited dependency is correct. The graph should therefore be treated as a contestable curriculum model, not ground truth.

### 7.4 Evidence can support agency or become compliance

Evidence-gated progression is intended to protect inquiry from product-only evaluation. Yet additional forms can become bureaucratic compliance, especially if students generate plausible test and reflection records after the fact. Evidence design must balance structure with authenticity. High-quality evidence should be close to the action it represents, connected across iterations, and useful to the learner or teacher rather than collected solely for analytics.

This risk argues for mixed-method evaluation. Log completeness alone cannot establish regulation or agency. Researchers should combine interaction traces with artifact histories, think-aloud or stimulated-recall interviews, independent performance tasks, classroom observation, and teacher interpretation. Multimodal data may add temporal resolution, but inference claims must remain proportional to the evidence (de Mooij et al., 2025).

### 7.5 Implications for AIED design and scholarship

For designers, the framework suggests that prompts should be the last rather than the only line of defence. Authority boundaries should also live in schemas, validators, operation whitelists, state transitions, audit records, and user-facing controls. For educators, generated curriculum graphs and adaptive paths should be inspectable arguments. For researchers, implementation fidelity should be reported separately from learning effects, and unaided transfer should be measured whenever AI performs substantial task work.

The framework is relevant beyond PjBL. Writing tutors, inquiry environments, design studios, coding platforms, and collaborative problem-solving systems all distribute the same five forms of authority. The specific evidence types will differ, but the questions of curricular scope, instructional sequence, adaptation, productive delegation, and consequential evaluation remain.

## 8. Limitations and Threats to Validity

The study has substantial limitations.

First, it is a design and fidelity study with no human participants. Educational benefits and harms remain hypotheses. Second, the theory-to-mechanism mapping was produced within the development project and was not independently coded; confirmation bias is possible. Third, the targeted regression set is not the entire repository suite, and one expectation failed. The code, model versions, prompts, and tests must be frozen and independently reproducible before empirical deployment.

Fourth, the enforced minimum of one prerequisite may manufacture a dependency for genuinely foundational lessons. Fifth, some default knowledge ladders are tailored to common AI topics and may over-prescribe other domains, cultures, or curricula. Sixth, one-question routing has limited reliability and can misclassify students. Seventh, model-generated graphs, explanations, feedback, and edits can be incorrect, biased, age-inappropriate, or homogenizing despite structural controls.

Eighth, provenance and undo do not guarantee meaningful consent or understanding. Interface defaults, social pressure, or time constraints may still encourage uncritical acceptance. Ninth, typed evidence can privilege what the platform can capture and disadvantage valid offline, embodied, collaborative, or creative work. Tenth, teacher oversight can create workload rather than reduce it if signals are poorly calibrated. Finally, privacy, accessibility, language variation, and unequal access require local evaluation, particularly in K-12 settings.

## 9. Empirical Research Agenda

The artifact is ready for co-design and feasibility research, not a definitive outcome claim. We propose three stages.

### 9.1 Stage 1: Teacher co-design and validity study

Teachers from the intended grade levels and subject domains should inspect generated curriculum graphs, prerequisite classifications, diagnostic items, remediation resources, terminal assessments, evidence missions, and intervention signals. Measures should include content-validity ratings, disagreement rationales, correction time, perceived decision authority, and workload. Expert review should explicitly test zero-prerequisite cases and domains outside the current AI-oriented defaults.

### 9.2 Stage 2: Classroom feasibility and mechanism pilot

A multi-class pilot should examine whether students understand AI roles, delegation, provenance, undo, evidence requirements, and teacher authority. Data should include system traces, screen and classroom observation, artifact histories, student interviews, teacher stimulated recall, support incidents, accessibility issues, and model errors. Primary feasibility criteria should be defined in advance: completion, integrity of evidence chains, frequency and success of undo, proportion of teacher signals judged useful, latency, and adverse events. No efficacy conclusion should be drawn from convenience comparisons.

### 9.3 Stage 3: Comparative effectiveness study

A preregistered cluster-randomized or carefully matched study could compare:

1. PjBL with access to a generic generative-AI chat tool;
2. OpenPBL with curriculum anchoring, evidence gates, and tutoring but no direct artifact edits; and
3. full OpenPBL with reversible productive delegation.

The primary outcome should be delayed, unaided transfer aligned to lesson targets. Secondary outcomes should include conceptual achievement, artifact quality, verification accuracy, revision quality, persistence after AI withdrawal, epistemic-agency and ownership measures, calibration of trust, collaboration quality, equity, and teacher orchestration workload. Process analyses should test whether explicit delegation and verification mediate outcomes, and whether prior knowledge moderates benefits or dependence. Condition 2 versus Condition 3 is especially important: it isolates whether reversible editing adds productive value without reducing independent learning or ownership.

Adverse outcomes should be treated as first-class results. These include copied but unverified content, reduced unaided performance, false prerequisite routing, evidence fabrication, inaccessible interactions, biased suggestions, and teacher alert fatigue. This agenda directly tests the conjecture that bounded co-agency can preserve learning better than unrestricted assistance while offering more authentic collaboration than prohibition.

## 10. Conclusion

OpenPBL addresses a central AIED problem: generative AI can be simultaneously a tutor, collaborator, producer, monitor, and evaluator, but educational responsibility cannot be allowed to diffuse across those roles. The redesigned system organizes human-AI collaboration through five explicit authority domains. It anchors personalization in curriculum, sequences support before mastery judgment, remediates specific prerequisite gaps, permits only explicit and reversible artifact delegation, and requires process evidence plus human adjudication for consequential progression.

The formative audit shows that these ideas can be implemented as inspectable and testable constraints, while the unresolved regression mismatch demonstrates that the artifact is still a development snapshot. The more important test is now educational: whether students use reversible delegation to reason more effectively with and against AI, whether their independent performance and ownership are preserved, and whether teachers gain actionable visibility without losing authority or time. Until classroom evidence answers those questions, OpenPBL should be understood as a theoretically grounded and empirically testable design proposition—not a proven educational solution.

## References

Banihashem, S. K., Bond, M., Bergdahl, N., Khosravi, H., & Noroozi, O. (2025). A systematic mapping review at the intersection of artificial intelligence and self-regulated learning. *International Journal of Educational Technology in Higher Education, 22*, 50. https://doi.org/10.1186/s41239-025-00548-8

Bastani, H., Bastani, O., Sungu, A., Ge, H., Kabakcı, Ö., & Mariman, R. (2025). Generative AI without guardrails can harm learning: Evidence from high school mathematics. *Proceedings of the National Academy of Sciences, 122*(26), e2422633122. https://doi.org/10.1073/pnas.2422633122

Chaaban, Y., Jung, S.-G., Medina, J., Azem, J. Y., Salminen, J., & Jansen, B. J. (2025). Examining student teachers' agency in an AI-supported learning environment: Q methodology research. *International Journal of Artificial Intelligence in Education, 35*, 4083–4107. https://doi.org/10.1007/s40593-025-00529-y

Chanaa, A., & El Faddouli, N. (2024). Prerequisites-based course recommendation: Recommending learning objects using concept prerequisites and metadata matching. *Smart Learning Environments, 11*, 16. https://doi.org/10.1186/s40561-024-00301-0

Chen, C.-H., & Yang, Y.-C. (2019). Revisiting the effects of project-based learning on students' academic achievement: A meta-analysis investigating moderators. *Educational Research Review, 26*, 71–81. https://doi.org/10.1016/j.edurev.2018.11.001

Darvishi, A., Khosravi, H., Sadiq, S., Gašević, D., & Siemens, G. (2024). Impact of AI assistance on student agency. *Computers & Education, 210*, 104967. https://doi.org/10.1016/j.compedu.2023.104967

de Mooij, S., Lämsä, J., Lim, L., Aksela, O., Athavale, S., Bistolfi, I., Jin, F., Li, T., Azevedo, R., Bannert, M., Gašević, D., Järvelä, S., & Molenaar, I. (2025). A systematic review of self-regulated learning through integration of multimodal data and artificial intelligence. *Educational Psychology Review, 37*, 54. https://doi.org/10.1007/s10648-025-10028-0

Dillenbourg, P. (2013). Design for classroom orchestration. *Computers & Education, 69*, 485–492. https://doi.org/10.1016/j.compedu.2013.04.013

Farshad, S., & Fortin, C. (2026). An umbrella review of meta-analyses on project-based learning: Effects on academic achievement, higher-order thinking, and 21st-century skills. *Educational Research Review, 52*, 100809. https://doi.org/10.1016/j.edurev.2026.100809

Hadwin, A. F., Järvelä, S., & Miller, M. (2018). Self-regulation, co-regulation, and shared regulation in collaborative learning environments. In D. H. Schunk & J. A. Greene (Eds.), *Handbook of self-regulation of learning and performance* (2nd ed., pp. 83–106). Routledge. https://doi.org/10.4324/9781315697048-6

Hmelo-Silver, C. E., Duncan, R. G., & Chinn, C. A. (2007). Scaffolding and achievement in problem-based and inquiry learning: A response to Kirschner, Sweller, and Clark (2006). *Educational Psychologist, 42*(2), 99–107. https://doi.org/10.1080/00461520701263368

Holstein, K., McLaren, B. M., & Aleven, V. (2019). Co-designing a real-time classroom orchestration tool to support teacher-AI complementarity. *Journal of Learning Analytics, 6*(2), 27–52. https://doi.org/10.18608/jla.2019.62.3

Kasneci, E., Sessler, K., Küchemann, S., Bannert, M., Dementieva, D., Fischer, F., Gasser, U., Groh, G., Günnemann, S., Hüllermeier, E., Krusche, S., Kutyniok, G., Michaeli, T., Nerdel, C., Pfeffer, J., Poquet, O., Sailer, M., Schmidt, A., Seidel, T., Stadler, M., Weller, J., Kuhn, J., & Kasneci, G. (2023). ChatGPT for good? On opportunities and challenges of large language models for education. *Learning and Individual Differences, 103*, 102274. https://doi.org/10.1016/j.lindif.2023.102274

Kestin, G., Miller, K., Klales, A., Milbourne, T., & Ponti, G. (2025). AI tutoring outperforms in-class active learning: An RCT introducing a novel research-based design in an authentic educational setting. *Scientific Reports, 15*, 17458. https://doi.org/10.1038/s41598-025-97652-6

Kim, J., Detrick, R., Yu, S., Cho, Y. H., & Li, S. (2025). Socially shared regulation of learning and artificial intelligence: Opportunities to support socially shared regulation. *Education and Information Technologies, 30*, 11483–11521. https://doi.org/10.1007/s10639-024-13187-9

Kim, J., Lee, H., & Cho, Y. H. (2022). Learning design to support student-AI collaboration: Perspectives of leading teachers for AI in education. *Education and Information Technologies, 27*, 6069–6104. https://doi.org/10.1007/s10639-021-10831-6

Kim, N. J., Belland, B. R., & Walker, A. E. (2018). Effectiveness of computer-based scaffolding in the context of problem-based learning for STEM education: Bayesian meta-analysis. *Educational Psychology Review, 30*, 397–429. https://doi.org/10.1007/s10648-017-9419-1

Miao, F., & Holmes, W. (2023). *Guidance for generative AI in education and research*. UNESCO.

Mouta, A., Torrecilla-Sánchez, E. M., & Pinto-Llorente, A. M. (2025). “Where is agency moving to?”: Exploring the interplay between AI technologies in education and human agency. *Digital Society, 4*, 49. https://doi.org/10.1007/s44206-025-00203-9

Possaghi, I., Vesin, B., Zhang, F., Sharma, K., Knudsen, C., Bjørkum, H., & Papavlasopoulou, S. (2025). Integrating multi-modal learning analytics dashboard in K-12 education: Insights for enhancing orchestration and teacher decision-making. *Smart Learning Environments, 12*, 53. https://doi.org/10.1186/s40561-025-00410-4

Samuel, A. (2026). Learning with machines: Toward a theory of epistemic co-agency. *Computers and Education: Artificial Intelligence, 10*, 100573. https://doi.org/10.1016/j.caeai.2026.100573

Wang, F., & Hannafin, M. J. (2005). Design-based research and technology-enhanced learning environments. *Educational Technology Research and Development, 53*, 5–23. https://doi.org/10.1007/BF02504682

## Data and Artifact Availability

The artifact analysed in this paper is the OpenPBL repository at the stated development snapshot. Before submission or classroom study, the authors should create a frozen archival release containing the source revision, schema, decision records, prompt and model configuration, test commands, synthetic fixtures, and a data dictionary. No human-subject data were collected for the present study.

## Author Contributions, Funding, and Competing Interests

These statements are withheld for anonymous review. The submitted non-anonymous version should report contributions using the CRediT taxonomy, identify all funding, and disclose relevant financial or non-financial interests.
