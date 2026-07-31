# OpenPBL: Evidence-Gated Multi-Agent Scaffolding for Human-Centered Project-Based Learning

**Anonymous Author(s)**

## Abstract

Generative artificial intelligence can provide timely explanations and feedback, but unconstrained assistance may displace rather than develop learners' judgment. This tension is especially consequential in project-based learning (PjBL), where students must retain ownership of ill-structured problems while teachers coordinate heterogeneous progress at classroom scale. This paper presents OpenPBL, a human-centered learning environment that operationalizes a six-stage project cycle through role-delimited AI companions, evidence-gated adaptation, and teacher-controlled classroom orchestration. OpenPBL separates three forms of authority: students own project decisions and artifacts; six AI companions provide bounded knowledge, ideation, critique, planning, review, and process-recording support; and teachers retain authority over stage transitions, high-risk interventions, and final evaluation. Rather than treating interaction volume as evidence of learning, the system derives support from observable events such as knowledge-point performance, artifact revisions, source verification, progress markers, and teacher-confirmed interventions. A design-based research framing and a formative technical evaluation were used to examine the implemented artifact. Traceability analysis shows that the architecture instantiates five design principles: learner ownership, stage-bounded assistance, evidence before inference, teacher-AI complementarity, and interruption-aware multi-agent interaction. The current implementation contains 55 API routes, 44 persistent data models, and 46 typed classroom action variants. A targeted regression suite covering the paper's core mechanisms passed all 36 tests, while an archived integration report recorded 14 successful workflow checks. These results establish implementation fidelity and technical feasibility, not learning effectiveness. The paper contributes an executable design pattern for reconciling scalable AI scaffolding with student agency and specifies a classroom evaluation protocol for testing learning, agency, cognitive load, and teacher orchestration in subsequent design cycles.

**Keywords:** project-based learning; generative AI; multi-agent systems; instructional scaffolding; student agency; classroom orchestration; learning analytics; human-AI complementarity

## 1. Introduction

Project-based learning (PjBL) organizes learning around authentic questions, sustained inquiry, iterative production, and a public artifact. Meta-analytic evidence generally associates PjBL with improved academic outcomes, although effects vary with implementation conditions and the methodological quality of the evidence base [1]. The approach is demanding by design. Learners must formulate goals, coordinate knowledge and action, evaluate evidence, revise artifacts, and explain decisions. Teachers simultaneously monitor multiple non-linear trajectories and decide when to explain, question, redirect, or remain silent. Scaffolding is therefore not an optional add-on to PjBL; it is a central mechanism for enabling learners to participate in complex work without reducing that work to a sequence of predetermined answers [2], [3].

Generative artificial intelligence (GenAI) appears well suited to this need. Conversational systems can deliver explanations, prompts, examples, and formative feedback on demand. Carefully structured AI tutoring has produced positive learning results in controlled studies [4], and human-AI systems can help educators use more productive tutoring strategies at scale [5]. Yet the same responsiveness creates an agency problem. AI systems are optimized to provide useful completions, whereas education often requires strategic withholding, productive struggle, verification, reflection, and transfer. In a randomized study involving 1,625 students, continuous AI assistance improved immediate performance but encouraged reliance rather than durable uptake of the supported behavior [6]. Reviews of educational chatbots similarly show that support concentrates on strategy enactment, while planning, reflection, and adaptation across a complete self-regulated learning cycle remain underdeveloped [7]. The design problem is thus not simply how to make AI more capable. It is how to make assistance contingent, bounded, inspectable, and subordinate to educational authority.

This problem becomes more complex when several AI roles are presented as a companion team. Role differentiation can make pedagogical functions legible: one agent may explain a concept, another challenge an assumption, and a third record decisions. However, additional agents can also increase interruption, repetition, anthropomorphic authority, and task outsourcing. A visually compelling "multi-agent classroom" is not necessarily a pedagogically coherent one. Without orchestration rules, multiple agents may compete for attention, restate the same advice, or generate parallel tasks that fragment students' work.

OpenPBL addresses these tensions through an evidence-gated architecture for AI-supported PjBL. It is not designed as a general chatbot embedded in a course page. It is a classroom workflow in which AI actions are conditioned by the learning stage, observable evidence, teacher directives, risk state, and interruption budget. The system assigns authority explicitly. Students are the sole owners of the project problem, key decisions, implementation, public presentation, and reflection. AI companions can explain, ask, critique, compare, and document, but stage policies prevent them from completing the core artifact on the learner's behalf. Teachers approve project directions, resolve high-risk issues, authorize stage progression, and confirm evaluative judgments.

The work is positioned as the artifact-development and formative-evaluation phase of design-based research (DBR) [8]. It addresses three research questions:

- **RQ1:** How can pedagogical commitments to student agency and teacher authority be translated into executable constraints for a multi-agent PjBL environment?
- **RQ2:** How can learning evidence coordinate adaptive resources, companion interventions, stage progression, and teacher attention without reducing learners to coarse ability labels?
- **RQ3:** To what extent does the implemented artifact faithfully and reliably instantiate these design principles?

The paper makes four contributions. First, it presents an evidence-gated orchestration model in which adaptation is triggered by content-located learning evidence rather than interaction volume or global ability labels. Second, it defines a role- and stage-bounded multi-agent protocol that defaults to one speaker, one core problem, and one learner action. Third, it provides an executable separation of authority among student ownership, AI scaffolding, and teacher judgment. Fourth, it reports a reproducible technical evaluation and a preregistration-ready protocol for the classroom study required to test educational effectiveness.

The remainder of the paper reviews related research, derives the design principles, describes the OpenPBL architecture and implementation, reports the formative technical evaluation, discusses theoretical and practical implications, and specifies the next empirical cycle.

## 2. Related Work

### 2.1 Project-Based Learning and Scaffolding

PjBL engages learners in sustained work on meaningful problems that culminates in an artifact or performance. A meta-analysis of 30 studies and 12,585 students reported a positive overall association between PjBL and academic achievement, while also showing substantial moderation by subject, location, instructional time, and technology support [1]. More recent evidence synthesis cautions that effect magnitudes should be interpreted carefully because definitions, comparison conditions, and review quality vary [9]. These findings shift attention from whether PjBL "works" in the abstract to the design conditions under which learners can successfully participate.

Scaffolding is one such condition. Hmelo-Silver, Duncan, and Chinn argued that problem- and inquiry-based approaches are not minimally guided; they use structured prompts, representations, facilitation, and sequencing to reduce unproductive load while preserving the epistemic work of inquiry [2]. A Bayesian meta-analysis found a small-to-moderate positive effect of computer-based scaffolding in problem-based STEM learning and, importantly, reported different effects for conceptual, strategic, and metacognitive support [3]. The same analysis warned that combining multiple strategies without sensitivity to context can be counterproductive. OpenPBL therefore treats scaffolding as a conditional policy rather than a permanently visible bundle of help.

### 2.2 Generative AI, Tutoring, and Learner Agency

GenAI expands the range and immediacy of computer-based scaffolding. A randomized crossover study in undergraduate physics found that a carefully structured AI tutor produced higher post-test scores in less median time than an active-learning class for the targeted lessons [4]. The authors emphasized that the result depended on sequential task structure, curated solutions, active engagement, cognitive-load management, and targeted feedback rather than unguided access to a general chatbot. Tutor CoPilot provides complementary evidence on the educator side: in a preregistered randomized trial, AI guidance increased students' topic mastery and increased tutors' use of guiding questions instead of answer-giving, with larger benefits for initially lower-rated tutors [5].

These results support pedagogically engineered AI, not unlimited automation. Darvishi et al. showed that students receiving AI support for peer feedback tended to rely on the system; when assistance was removed, the supported behavior did not persist at the same level [6]. Kasneci et al. similarly identified opportunities for personalization and feedback alongside risks related to accuracy, bias, privacy, assessment validity, and overreliance [10]. UNESCO's guidance consequently emphasizes human agency, age-appropriate use, human accountability, and pedagogical validation [11]. OpenPBL operationalizes these concerns through action boundaries, confirmation requirements, evidence capture, and teacher override rather than relying on policy text alone.

### 2.3 Self-Regulated Learning and Process Evidence

Self-regulated learning (SRL) involves recursive goal setting, strategy selection, monitoring, and adaptation. A systematic review of educational chatbots found promising effects but also a narrow concentration on strategy enactment; few systems supported the full cycle from planning to reflection and future adaptation [7]. A recent review of multimodal SRL analytics likewise argues that useful intervention requires alignment among data streams, the learning process being inferred, and the action taken [12]. Raw counts are insufficient because the same observable behavior may have different meanings across stages and contexts.

OpenPBL uses process evidence conservatively. Interaction frequency is not interpreted as dependency or engagement by itself. Evidence must connect to a content location, artifact state, verification behavior, progress event, or decision. When there is too little observable evidence, the collaboration evaluator returns "insufficient evidence" rather than forcing a low score. This design follows a general principle: uncertainty should reduce automation, not increase it.

### 2.4 Classroom Orchestration and Teacher-AI Complementarity

Classroom orchestration concerns how teachers manage layered activities under real-time constraints [13]. Teacher dashboards and awareness tools can extend perception, but poorly targeted alerts can create new monitoring work or displace professional judgment. Co-design research on teacher-AI complementarity shows that teachers need actionable awareness linked to classroom context, together with control over how analytics influence intervention [14]. Recent in-the-wild dashboard research similarly favors evidence visibility and educator autonomy over prescriptive automation [15].

OpenPBL treats the teacher dashboard as an orchestration surface, not an AI command center. Signals identify what happened, where it happened, which learners are affected, what evidence supports the inference, and a suggested action. Teachers may intervene, dismiss, resolve, or override a stage gate with a recorded reason. AI detects and proposes; teachers adjudicate consequential classroom action.

## 3. Research and Design Method

### 3.1 Design-Based Research Framing

DBR is appropriate when a learning theory must be embodied in an intervention, evaluated in context, and refined through iterative cycles [8]. The present paper reports the first completed artifact cycle:

1. **Problem analysis:** identify tensions among scalable PjBL support, learner ownership, teacher workload, AI over-assistance, and classroom continuity.
2. **Design principle synthesis:** translate research on scaffolding, SRL, learner agency, and orchestration into explicit system constraints.
3. **Artifact construction:** implement the complete teacher-student workflow, companion policies, evidence model, adaptive resource selection, real-time synchronization, and deployment infrastructure.
4. **Formative evaluation:** inspect principle-to-mechanism traceability, execute targeted regression tests, review integration checkpoints, and audit software coverage.
5. **Empirical protocol:** define the classroom comparison, measures, and analysis required for the next cycle.

No human-subject learning study is reported in this cycle. Accordingly, the evaluation concerns implementation fidelity, technical feasibility, and evaluability. Claims about learning effectiveness are reserved for future classroom research.

### 3.2 Derivation of Design Principles

Five principles guided the artifact.

**DP1 — Learner ownership must be executable.** Agency cannot depend only on a prompt instructing the model not to provide answers. High-impact actions must be unavailable, redirected, or require explicit confirmation. Students must be able to accept, modify, or reject suggestions and explain that decision.

**DP2 — Assistance must be stage-bounded.** A useful action in one phase may be harmful in another. Concept explanation is appropriate during knowledge acquisition; generating the final artifact is not appropriate during production. Each stage therefore has an allowlist of roles, help types, artifact triggers, and boundary responses.

**DP3 — Evidence must precede inference.** Counts of messages, time, or clicks are ambiguous. Signals require stage scope and content-linked evidence. Insufficient observations should produce an uncertainty state rather than a deficit label.

**DP4 — Consequential judgment remains with the teacher.** AI may detect patterns and propose interventions, but teachers control project approval, high-risk resolution, class-wide response, gate override, and final evaluative confirmation.

**DP5 — Multi-agent support must respect an interruption budget.** Multiple roles should not imply simultaneous speech. Proactive turns default to one speaker, one core issue, and one learner action. Additional perspectives are permitted only when requested, and redundant output is suppressed.

## 4. The OpenPBL Model

### 4.1 Separation of Authority

OpenPBL defines three complementary authorities.

**Student authority** covers the driving interpretation, project direction, choice among alternatives, artifact production, presentation, and reflection. The system may expose AI suggestions, but adoption is stored as a decision with an optional reason and before/after evidence.

**AI authority** is limited to cognitive and metacognitive support: explaining, questioning, challenging, proposing options, reviewing, and recording. AI-generated diagnoses must include evidence drawn from the student's actual materials. The system rejects structurally incomplete model output rather than silently substituting fabricated local content.

**Teacher authority** covers pedagogical direction and accountability: approving projects, interpreting class patterns, issuing directives, handling ethical or high-risk issues, overriding stage gates, conducting final evaluation, and closing the learning cycle.

This separation is not merely conceptual. It appears in role-based permissions, stage gate logic, data provenance, confirmation records, teacher directives, and evaluation responsibility.

### 4.2 Six-Stage Learning Cycle

The course is organized as six stages:

1. **Project launch:** the teacher establishes an authentic context, driving question, expected artifact, and criteria; students interpret the task.
2. **AI-supported knowledge building:** students work through generated explanations, examples, interactions, and short assessments; the teacher monitors knowledge-point evidence.
3. **Proposal and calibration:** each student develops an individual project proposal. AI companions question and compare options, while the teacher approves or redirects the project direction.
4. **Project making:** students create and revise the core artifact. AI support is triggered by explicit help requests, milestone saves, uploads, or evidence of stalled progress.
5. **Showcase and evaluation:** students present the artifact and explain their reasoning and AI use. AI may organize process evidence; the teacher evaluates outcome quality and oral defense.
6. **Reflection:** students compare initial and final decisions, identify how AI advice was verified or rejected, and formulate transferable lessons.

Each stage has completion evidence. Gates block progression when essential evidence is missing, such as absent learning content, incomplete proposals, missing teacher approval, no artifact version, unresolved high-risk intervention, or missing presentation. Reflection is terminal and therefore produces warnings rather than a forward blocker.

### 4.3 Role-Delimited Companion Team

The companion team contains six roles (Table 1). Roles are functional, not simulated autonomous persons with independent goals.

| Role | Primary function | Typical move | Prohibited substitution |
|---|---|---|---|
| Knowledge companion | Explain concepts and connect prerequisite knowledge | Example, contrast, check-for-understanding | Completing the student's project |
| Ideation companion | Expand the option space | Generate alternatives and dimensions | Selecting the final direction |
| Critical companion | Test assumptions and evidence | Counterexample, risk question, source challenge | Declaring the student's decision |
| Planning companion | Convert a chosen direction into feasible steps | Milestone, dependency, resource plan | Executing the plan |
| Review companion | Evaluate an artifact against criteria | Evidence-linked feedback and revision target | Rewriting the final artifact |
| Recorder companion | Preserve decisions and process evidence | Summarize changes, rationales, and unresolved questions | Awarding an unconfirmed final grade |

Role access changes by stage. Reflection, for example, excludes ideation because opening new solution branches at course closure can undermine consolidation. Server-side filtering enforces these policies even if a client requests a forbidden role.

### 4.4 Evidence-Gated Adaptation

OpenPBL avoids global ability tiers such as "weak," "average," or "advanced." Pre-assessment produces knowledge-point gaps. Adaptive resources are generated before class for reliability, but inserted only when evidence and time conditions are satisfied. Prerequisite material may appear before the main sequence when the corresponding knowledge point is missing. Extension material is inserted after mastery, not after error, and must declare its added value relative to the core lesson. The student remains in the same player, and the system returns to the main sequence automatically.

Teacher alerts are similarly gated. Temporal alerts apply only while the relevant scene is actively open; leaving or completing the scene closes the observation scope. A common issue requires the same normalized problem at the same content location for at least 30% of the class and at least two students. Optional non-use of AI is not treated as risk. Every signal contains an evidence list, affected targets, confidence, stage, and suggested response.

### 4.5 Interruption-Aware Multi-Agent Protocol

The orchestrator applies trigger-specific cooldowns and milestone rules. Routine document saves remain silent. File uploads and meaningful milestones may trigger review. Proactive turns always use one speaker; an explicit student request for multiple perspectives permits at most two. Responses are constrained to one core problem and one actionable next step.

To reduce repetition, a deterministic bigram-overlap check suppresses later responses when overlap reaches 0.72 relative to a prior role response. The recorder's automatic summary is visible to the teacher rather than replayed to the student. Text generation remains sequential to preserve cross-role context, while text-to-speech (TTS) for completed responses is prefetched and played in director order. This arrangement preserves coherence while reducing audible gaps.

## 5. System Architecture and Implementation

### 5.1 Architecture

OpenPBL is implemented as a full-stack TypeScript application. The presentation layer provides separate teacher and student surfaces. The orchestration layer contains stage policies, companion routing, adaptive sequencing, learning-signal detection, evaluation, and stage gates. The application layer exposes authenticated course actions, AI support, course generation, uploads, sessions, metrics, and health endpoints. Persistence uses PostgreSQL through Prisma, with an IndexedDB/JSON fallback for demonstration. Real-time coordination uses WebSocket event delivery with a long-polling fallback. AI functions are provider-agnostic through an OpenAI-compatible interface and include streaming conversation and TTS.

The data path is deliberately evidence-first:

`learner action -> typed course event -> persisted evidence -> scoped inference -> proposed support or signal -> student confirmation or teacher decision -> new evidence`.

This loop makes provenance inspectable and enables later process analysis.

### 5.2 Event and Evidence Model

The implementation contains 44 persistent data models. Models central to the research contribution include:

- `LearningEvent`, which stores stage, content reference, duration, visibility, progress marker, and idempotency key;
- `AiSupportRecord`, which stores trigger, diagnosis, suggestions, evidence, source, structured payload, and adoption decision;
- `LearningSignal` and `ClassCommonIssue`, which separate individual evidence from thresholded class patterns;
- `TeacherIntervention`, `TeacherAgentDirective`, and `OfflineInterventionRecord`, which preserve human decisions;
- `StageTransitionRecord`, which records passed or overridden gates, blockers, warnings, actor, and rationale;
- `CompanionThread`, `CompanionTask`, `CompanionConfirmation`, and `CompanionProcessRecord`, which distinguish dialogue, delegated operations, high-impact confirmation, and process evidence.

Course mutations use request identifiers and version fields to support idempotency and concurrency control. Real-time patches are derived from typed session actions rather than arbitrary client writes.

### 5.3 Agency-Preserving Evaluation

The AI collaboration evaluator measures observable indicators: use of specific context, independent progress, verification, artifact change, corroboration, and direct-delegation patterns. Interaction count alone does not determine healthy or unhealthy AI use. If fewer than two substantive indicators are observable, the evaluator returns `insufficient-evidence` and no score. Otherwise, positive evidence is capped by dimension and direct-delegation patterns incur a bounded penalty. The result is accompanied by reasons, making the assessment contestable.

This heuristic is not presented as a validated psychometric instrument. Its purpose is to instantiate a falsifiable design claim: evidence of verification and independent artifact progress should matter more than frequency of AI use. The classroom study in Section 8 includes validation against human coding.

### 5.4 Production and Reproducibility Features

The artifact includes 55 API route handlers, 46 typed classroom action variants, role-based authorization, signed HTTP-only sessions, rate limiting, encrypted provider credentials, structured logs with personally identifiable information redaction, Prometheus metrics, liveness/readiness checks, graceful shutdown, file-reference tracking, database migration, course-session archival, and containerized deployment. WebSocket synchronization falls back to periodic polling. AI providers and TTS voices are configurable so that evaluation is not tied to a single commercial model.

These features do not constitute a pedagogical contribution by themselves. They matter because in-class research requires stable identity, event integrity, recoverable sessions, observable failures, and consistent treatment delivery.

## 6. Formative Technical Evaluation

### 6.1 Evaluation Questions and Materials

The formative evaluation addressed:

- **FQ1:** Are the five design principles traceable to implemented mechanisms and persistent evidence?
- **FQ2:** Do core policies behave as intended under targeted regression tests?
- **FQ3:** Is the artifact sufficiently instrumented and operationally complete for a classroom pilot?

Materials included source code, architecture decision records, the database schema, automated tests, coverage artifacts, and an archived integration workflow report. Repository inspection and test execution were performed on 27 July 2026.

### 6.2 Principle-to-Mechanism Traceability

Table 2 summarizes the traceability audit.

| Design principle | Executable mechanism | Persisted evidence |
|---|---|---|
| DP1 Learner ownership | Boundary prompts, outsourcing redirection, high-impact confirmation, accept/modify/reject workflow | Adoption reason, before/after artifact state, confirmation outcome |
| DP2 Stage-bounded assistance | Per-stage role allowlists, server filtering, stage-specific help policies and gates | Stage key on messages, tasks, supports, submissions, and transitions |
| DP3 Evidence before inference | Active-scope temporal rules, content references, class threshold, insufficient-evidence state | Event IDs, content location, target IDs, confidence, evidence arrays |
| DP4 Teacher authority | Proposal approval, high-risk blockers, directives, intervention lifecycle, gate override | Teacher identity, directive, status, override rationale, final confirmation |
| DP5 Interruption budget | Trigger cooldowns, silent routine saves, one-speaker default, two-speaker maximum, repetition suppression | Trigger type, timestamps, role order, visibility, generated messages |

All five principles were represented in executable logic and in data structures that permit post hoc audit. The strongest traceability concerns stage gating and companion orchestration, which are independently testable pure functions. The weakest concerns qualitative evidence extraction from model-generated diagnoses; although structured output and evidence arrays are required, semantic faithfulness still requires human validation.

### 6.3 Targeted Regression Tests

A targeted suite selected tests directly associated with the paper's claims: stage policy, companion orchestration, learner profiling, AI-collaboration evaluation, stage gates, and teaching-AI support. All 36 tests across six files passed in 11.41 seconds. The tests verified, among other behaviors:

- server-side rejection of stage-forbidden roles;
- redirection of requests to outsource student-owned work;
- one opening message per student and stage;
- one-speaker proactive turns and at most two requested perspectives;
- cooldowns and silence for routine saves;
- suppression of substantially repeated role responses;
- an `insufficient-evidence` result rather than a forced low score;
- no penalty for high AI use when verification and artifact progress are present;
- blocking of incomplete proposals, missing teacher approval, and unresolved high-risk issues;
- evidence-bearing signals for shared misconceptions and project risks;
- failure rather than fabricated fallback data when structured model output is invalid.

An archived integration report contained 14 successful checks and one informational checkpoint. It covered provider configuration, classroom creation and retrieval, progress persistence, three generated scene types, input validation, error-path behavior, and teacher/student page availability.

### 6.4 Coverage and Readiness

The repository contains 124 TypeScript test files across the application and local packages. The most recent coverage artifact instrumented 124 source files and recorded 1,640 of 5,840 lines (28.08%), 597 of 1,538 functions (38.82%), and 1,768 of 6,826 branches (25.90%). This coverage is adequate for identifying the presence of a test infrastructure but is not adequate for claiming comprehensive software assurance. A full test command did not complete within a 120-second observation window during this evaluation; it produced no failing assertion before timeout, but it is not counted as a pass.

Operationally, the artifact is pilot-ready in the narrow sense that it supports authenticated teacher and student flows, persistence, real-time synchronization, observability, and deployment. Research readiness still requires a frozen intervention version, fixture-based model-output tests, a completed data-protection review, recovery drills, and a pilot-specific monitoring dashboard.

## 7. Discussion

### 7.1 From Chatbot Access to Executable Pedagogy

OpenPBL's primary contribution is a shift in the unit of design. The unit is not an AI response or agent persona; it is a governed learning transition. Each transition begins with observable student or classroom state, passes through a scoped interpretation, and ends with either a learner-owned action or a teacher decision. This structure turns pedagogical intentions into executable constraints.

The distinction matters because prompts are probabilistic. A system prompt that says "do not give the answer" can still yield an answer. OpenPBL supplements model instructions with role filtering, action permissions, confirmation records, stage gates, and interface affordances. The resulting boundary is imperfect but inspectable. A reviewer can ask whether a prohibited action was technically unavailable, whether the learner accepted a suggestion, and whether an artifact changed afterward.

### 7.2 Evidence Gating as an Agency Mechanism

Learning analytics often frames evidence as a means to improve prediction. In OpenPBL, evidence also limits system authority. When evidence is absent, the system should know less and do less. When a signal is individual, it should not become a class-wide label. When a learner uses AI frequently but independently verifies and advances the artifact, frequency should not be treated as dependency.

This approach directly addresses the reliance problem observed by Darvishi et al. [6]. It does not assume that reflection prompts alone will make AI support transferable. Instead, it preserves adoption decisions, verification behavior, artifact changes, and later performance so that reliance can be studied as a temporal process. Whether this design actually protects agency remains an empirical question, but the artifact makes that question measurable.

### 7.3 Multi-Agent Systems Need Restraint, Not Just Diversity

Role diversity is pedagogically useful when it clarifies the type of help being offered. It becomes harmful when role visibility is mistaken for learning value. The OpenPBL protocol intentionally reduces visible variety: most proactive turns use one role, routine saves are silent, and recorder summaries are teacher-only. This design may appear less "agentic," but it better aligns with cognitive-load management and productive student action.

The one-problem/one-action rule also creates an evaluable unit. Researchers can code whether the proposed action was relevant, completed, verified, and followed by progress. In contrast, a long multi-agent conversation containing several recommendations makes causal interpretation difficult.

### 7.4 Teacher-AI Complementarity

Teacher authority is not a fallback for model failure; it is a designed component of the learning environment. The teacher is uniquely positioned to interpret classroom norms, emotional context, ethical issues, and the educational value of productive struggle. OpenPBL therefore reserves direction approval, high-risk resolution, class-wide intervention, and final evaluation for teachers.

At the same time, complementarity requires avoiding alert overload. Active-scope rules, content locations, class thresholds, and evidence arrays are attempts to increase signal precision. The next study should measure not only whether teachers notice more learners, but whether alerts improve allocation of attention without increasing workload or reducing trust.

### 7.5 Limitations and Threats to Validity

The most important limitation is the absence of learner outcome data. Technical fidelity does not demonstrate learning gain, agency preservation, reduced cognitive load, equity, or teacher benefit. The paper therefore does not claim educational effectiveness.

Second, the design principles were derived and implemented by the development team. The traceability audit may reflect designer confirmation bias. Independent teacher review and participatory redesign are needed.

Third, the collaboration-health heuristic uses hand-designed weights and language-pattern evidence. It is not a validated scale and may behave differently across ages, subjects, languages, and project genres. Until validated, it should support reflection and teacher review rather than consequential grading.

Fourth, the targeted tests cover central policies but overall line and branch coverage remain low. Model-dependent behavior, real-time concurrency, accessibility, recovery, and cross-browser behavior need broader testing. The full suite timeout also limits the strength of the current software-reliability claim.

Fifth, role names, conversational style, and visual companions may produce novelty or social-presence effects. These features must be separated from evidence gating in ablation studies.

Finally, the system currently represents learning through digital events and submitted artifacts. Offline discussion, affect, collaboration with family or peers, and unrecorded reasoning may be educationally important but invisible. Teachers must be able to add contextual evidence and contest automated interpretations.

## 8. Classroom Evaluation Protocol

### 8.1 Study Design

The next DBR cycle should use a cluster-randomized or stepped-wedge classroom study, depending on school constraints. The preferred design compares three conditions:

1. **Structured PjBL without conversational AI** — identical six-stage project, resources, teacher dashboard, and assessment, but no companion dialogue.
2. **Single-agent structured support** — one pedagogically constrained AI tutor with the same stage policies and evidence model.
3. **OpenPBL evidence-gated companions** — role-delimited companion team, evidence-gated proactivity, and teacher orchestration.

This comparison separates the effects of digital PjBL structure, conversational support, and role-delimited multi-agent orchestration. A minimum of 12 classes across at least three schools is recommended for feasibility estimation; the confirmatory sample should be determined through simulation-based power analysis using the intraclass correlation and effect variance observed in the pilot.

### 8.2 Outcomes

The primary outcome should be **independent transfer**, measured by a post-project task completed without AI. A rubric should assess problem framing, evidence use, solution quality, justification, and reflection. Two blinded raters should score artifacts and oral defenses; inter-rater agreement should be reported.

Secondary learner outcomes should include:

- domain knowledge pre/post gain;
- project artifact quality;
- student agency and perceived ownership;
- SRL planning, monitoring, and reflection;
- cognitive load and interruption;
- AI literacy, including verification and appropriate rejection;
- delayed retention and transfer;
- equity of benefit by prior attainment and AI familiarity.

Teacher outcomes should include:

- time spent monitoring and intervening;
- precision and usefulness of alerts;
- distribution of attention across students;
- intervention latency;
- perceived control, trust, and workload;
- agreement between AI signals and teacher judgment.

Process measures should include support exposure, suggestion adoption, stated rationale, artifact revisions, source verification, stage duration, teacher overrides, and no-progress episodes. Conversation content should be coded for prompting, explanation, critique, answer-giving, learner reasoning, and delegation.

### 8.3 Analysis

Primary analysis should use multilevel models with students nested in classes and schools. The model should adjust for baseline knowledge and prespecified covariates, report standardized effects and confidence intervals, and follow intention-to-treat assignment. Mediation analysis can test whether verification behavior and independent artifact progress explain transfer. Moderation analysis should examine prior attainment, AI familiarity, and teacher experience without converting continuous evidence into fixed learner labels.

The agency hypothesis should be tested behaviorally, not only through self-report. Key indicators include performance after AI withdrawal, the proportion of suggestions modified or rejected with justification, source verification, divergence between AI drafts and final artifacts, and oral-defense consistency.

An ablation study should compare: (a) evidence-gated versus always-on proactivity, (b) one-speaker versus unconstrained multi-speaker turns, and (c) content-located versus generic alerts. These tests would identify which mechanisms, rather than the overall interface, produce value.

### 8.4 Ethics, Privacy, and Transparency

The protocol requires institutional ethics approval and guardian consent where applicable. Data collection should be minimized, retention periods specified, and model providers contractually prevented from training on student data. Students and teachers should be able to inspect, correct, and export process records. Automated indicators must not be used for high-stakes grading without human confirmation. The preregistration should distinguish confirmatory outcomes from exploratory process analyses, and model versions, prompts, temperature, and generated learning content should be archived for reproducibility.

## 9. Conclusion

OpenPBL demonstrates how a pedagogical position can become an executable system architecture. The platform does not equate more AI with better learning. It assigns students ownership of the project, limits companions to stage-appropriate scaffolding, requires evidence before inference, reserves consequential judgment for teachers, and constrains multi-agent interaction to protect attention. Formative evaluation shows that these principles are traceable to implemented policies and persistent records, and targeted regression tests confirm the intended behavior of the core mechanisms.

The contribution is therefore a research-ready design pattern rather than a claim of proven educational impact. The decisive next step is classroom evaluation of independent transfer, agency, cognitive load, and teacher orchestration. If those studies support the design hypotheses, evidence-gated orchestration may offer a path beyond the current choice between generic chatbots and rigid intelligent tutors: AI support that is adaptive yet restrained, scalable yet accountable, and helpful without taking ownership of learning.

## References

[1] C.-H. Chen and Y.-C. Yang, "Revisiting the effects of project-based learning on students' academic achievement: A meta-analysis investigating moderators," *Educational Research Review*, vol. 26, pp. 71-81, 2019, doi: 10.1016/j.edurev.2018.11.001.

[2] C. E. Hmelo-Silver, R. G. Duncan, and C. A. Chinn, "Scaffolding and achievement in problem-based and inquiry learning: A response to Kirschner, Sweller, and Clark (2006)," *Educational Psychologist*, vol. 42, no. 2, pp. 99-107, 2007, doi: 10.1080/00461520701263368.

[3] N. J. Kim, B. R. Belland, and A. E. Walker, "Effectiveness of computer-based scaffolding in the context of problem-based learning for STEM education: Bayesian meta-analysis," *Educational Psychology Review*, vol. 30, pp. 397-429, 2018, doi: 10.1007/s10648-017-9419-1.

[4] G. Kestin, K. Miller, A. Klales, T. Milbourne, and G. Ponti, "AI tutoring outperforms in-class active learning: An RCT introducing a novel research-based design in an authentic educational setting," *Scientific Reports*, vol. 15, art. 17458, 2025, doi: 10.1038/s41598-025-97652-6.

[5] R. E. Wang, A. T. Ribeiro, C. D. Robinson, S. Loeb, and D. Demszky, "Tutor CoPilot: A human-AI approach for scaling real-time expertise," arXiv:2410.03017, 2024, doi: 10.48550/arXiv.2410.03017.

[6] A. Darvishi, H. Khosravi, S. Sadiq, D. Gašević, and G. Siemens, "Impact of AI assistance on student agency," *Computers & Education*, vol. 210, art. 104967, 2024, doi: 10.1016/j.compedu.2023.104967.

[7] R. Guan, M. Raković, G. Chen, and D. Gašević, "How educational chatbots support self-regulated learning? A systematic review of the literature," *Education and Information Technologies*, vol. 30, pp. 4493-4518, 2025, doi: 10.1007/s10639-024-12881-y.

[8] F. Wang and M. J. Hannafin, "Design-based research and technology-enhanced learning environments," *Educational Technology Research and Development*, vol. 53, pp. 5-23, 2005, doi: 10.1007/BF02504682.

[9] S. Farshad and C. Fortin, "An umbrella review of meta-analyses on project-based learning: Effects on academic achievement, higher-order thinking, and 21st-century skills," *Educational Research Review*, art. 100809, 2026, doi: 10.1016/j.edurev.2026.100809.

[10] E. Kasneci et al., "ChatGPT for good? On opportunities and challenges of large language models for education," *Learning and Individual Differences*, vol. 103, art. 102274, 2023, doi: 10.1016/j.lindif.2023.102274.

[11] F. Miao and W. Holmes, *Guidance for Generative AI in Education and Research*. Paris, France: UNESCO, 2023.

[12] S. de Mooij et al., "A systematic review of self-regulated learning through integration of multimodal data and artificial intelligence," *Educational Psychology Review*, vol. 37, art. 54, 2025, doi: 10.1007/s10648-025-10028-0.

[13] P. Dillenbourg, "Design for classroom orchestration," *Computers & Education*, vol. 69, pp. 485-492, 2013, doi: 10.1016/j.compedu.2013.04.013.

[14] K. Holstein, B. M. McLaren, and V. Aleven, "Co-designing a real-time classroom orchestration tool to support teacher-AI complementarity," *Journal of Learning Analytics*, vol. 6, no. 2, pp. 27-52, 2019, doi: 10.18608/jla.2019.62.3.

[15] I. Possaghi, B. Vesin, F. Zhang, K. Sharma, C. Knudsen, H. Bjørkum, and S. Papavlasopoulou, "Integrating multi-modal learning analytics dashboard in K-12 education: Insights for enhancing orchestration and teacher decision-making," *Smart Learning Environments*, vol. 12, art. 53, 2025, doi: 10.1186/s40561-025-00410-4.

## Data and Artifact Availability

The research artifact is the OpenPBL repository inspected for this paper. A public archival release should be created before submission and should include the frozen source revision, deployment files, schema, test commands, synthetic fixtures, prompt templates, and a machine-readable data dictionary. No human-subject data were collected for the present study.

## Author Contributions

For double-blind review, contribution statements are withheld. The final version should report contributions using the CRediT taxonomy.

## Funding and Conflicts of Interest

For double-blind review, funding and conflict-of-interest statements are withheld and must be completed before submission.
