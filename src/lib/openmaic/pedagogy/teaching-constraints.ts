export type LearnerSupportLevel = 'high-scaffold' | 'balanced' | 'independent';
export type LearnerGradeBand = 'primary' | 'middle-school' | 'high-school' | 'vocational' | 'higher-education' | 'general';

export interface LearnerProfileInput {
  priorKnowledge?: string;
  learningNeeds?: string;
  familiarContexts?: string;
}

export interface TeachingConstraints {
  grade: string;
  subject: string;
  topic: string;
  gradeBand: LearnerGradeBand;
  supportLevel: LearnerSupportLevel;
  learnerFoundation: string;
  learningNeeds: string[];
  familiarContexts: string[];
  learningObjectives: string[];
  allowedKnowledgePoints: Array<{ id: string; name: string; level?: string }>;
  terminologyRule: string;
  abstractionRule: string;
  exampleRule: string;
  progressionRule: string;
  assessmentRule: string;
}

function splitItems(value?: string): string[] {
  return (value ?? '')
    .split(/[\n；;，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function inferGradeBand(grade: string): LearnerGradeBand {
  const value = grade.trim().toLowerCase();
  if (/小学|一年级|二年级|三年级|四年级|五年级|六年级|primary|elementary/.test(value)) return 'primary';
  if (/初中|七年级|八年级|九年级|初一|初二|初三|middle|junior/.test(value)) return 'middle-school';
  if (/高中|高一|高二|高三|high school|senior/.test(value)) return 'high-school';
  if (/职高|中职|高职|技校|vocational/.test(value)) return 'vocational';
  if (/大学|本科|研究生|college|university|higher/.test(value)) return 'higher-education';
  return 'general';
}

function gradeDefaults(gradeBand: LearnerGradeBand): Pick<TeachingConstraints, 'supportLevel' | 'learnerFoundation' | 'terminologyRule' | 'abstractionRule' | 'exampleRule'> {
  switch (gradeBand) {
    case 'primary':
      return {
        supportLevel: 'high-scaffold',
        learnerFoundation: 'Assume concrete everyday experience but little formal disciplinary vocabulary.',
        terminologyRule: 'Use one new term at a time. Explain it immediately in plain language and pair it with a concrete example or visual.',
        abstractionRule: 'Prefer observation, comparison, and concrete cause-and-effect; avoid unexplained symbolic or multi-step abstraction.',
        exampleRule: 'Use home, school, games, nature, and familiar objects; keep scenarios short and observable.',
      };
    case 'middle-school':
      return {
        supportLevel: 'high-scaffold',
        learnerFoundation: 'Assume basic school-subject knowledge but no specialist or university-level background.',
        terminologyRule: 'Define every specialist term before using it for reasoning; connect it to already familiar school concepts.',
        abstractionRule: 'Move from concrete examples to one abstraction at a time, with worked examples and checks for understanding.',
        exampleRule: 'Use school life, common apps, sports, media, public transport, and simple experiments.',
      };
    case 'high-school':
      return {
        supportLevel: 'balanced',
        learnerFoundation: 'Assume general high-school literacy and subject basics, but no university-level specialist knowledge unless explicitly listed.',
        terminologyRule: 'Do not use specialist concepts such as named architectures, advanced theories, or implementation jargon as if already known. Define, scaffold, or replace them first.',
        abstractionRule: 'Use intuitive mechanisms and simple models before formal detail; include only depth required by the confirmed objectives.',
        exampleRule: 'Use familiar digital products, communication, campus life, social issues, and small data examples tied to the lesson goal.',
      };
    case 'vocational':
      return {
        supportLevel: 'balanced',
        learnerFoundation: 'Assume practical experience may be stronger than formal theory; do not assume unlisted specialist terminology.',
        terminologyRule: 'Introduce terminology through its job purpose, observable effect, and safe operating context before formal definition.',
        abstractionRule: 'Prioritize task steps, decisions, evidence, and troubleshooting, then explain the minimum supporting principle.',
        exampleRule: 'Use authentic workplace tasks, tools, records, safety decisions, and quality checks appropriate to the course.',
      };
    case 'higher-education':
      return {
        supportLevel: 'independent',
        learnerFoundation: 'Assume general academic study skills and stated prerequisites, but not specialist concepts outside the confirmed boundary.',
        terminologyRule: 'Define domain terms on first use unless they are explicitly listed as prior knowledge; distinguish foundational and extension concepts.',
        abstractionRule: 'Permit formal models and multi-step reasoning only when they serve the confirmed objectives and prerequisites are established.',
        exampleRule: 'Use authentic disciplinary cases and data while explaining assumptions and limitations.',
      };
    default:
      return {
        supportLevel: 'balanced',
        learnerFoundation: 'Assume only general literacy and the explicitly stated prior knowledge.',
        terminologyRule: 'Define every non-common term on first use and never assume knowledge outside the confirmed boundary.',
        abstractionRule: 'Progress from concrete example to explanation to application, adding abstraction only when required.',
        exampleRule: 'Use accessible real-life contexts directly related to the teaching objective.',
      };
  }
}

export function deriveTeachingConstraints(input: {
  grade?: string;
  subject?: string;
  topic?: string;
  difficulty?: 'introductory' | 'standard' | 'advanced';
  learnerProfile?: LearnerProfileInput;
  learningObjectives?: string[];
  knowledgePoints?: Array<{ id: string; name?: string; level?: string }>;
}): TeachingConstraints {
  const grade = input.grade?.trim() || '未指定学段';
  const gradeBand = inferGradeBand(grade);
  const defaults = gradeDefaults(gradeBand);
  const explicitPrior = input.learnerProfile?.priorKnowledge?.trim();
  const difficulty = input.difficulty ?? 'standard';
  const supportLevel: LearnerSupportLevel = difficulty === 'introductory'
    ? 'high-scaffold'
    : difficulty === 'advanced' && gradeBand === 'higher-education'
      ? 'independent'
      : defaults.supportLevel;

  return {
    grade,
    subject: input.subject?.trim() || '综合课程',
    topic: input.topic?.trim() || '当前课程主题',
    gradeBand,
    supportLevel,
    learnerFoundation: explicitPrior || defaults.learnerFoundation,
    learningNeeds: splitItems(input.learnerProfile?.learningNeeds),
    familiarContexts: splitItems(input.learnerProfile?.familiarContexts),
    learningObjectives: (input.learningObjectives ?? []).map((item) => item.trim()).filter(Boolean),
    allowedKnowledgePoints: (input.knowledgePoints ?? [])
      .filter((point) => Boolean(point.id))
      .map((point) => ({ id: point.id, name: point.name?.trim() || point.id, level: point.level })),
    terminologyRule: defaults.terminologyRule,
    abstractionRule: defaults.abstractionRule,
    exampleRule: defaults.exampleRule,
    progressionRule: 'Sequence pages as activate prior knowledge → explain with a concrete example → make the mechanism explicit → guided application → independent check → concise synthesis. Do not increase difficulty merely to fill time.',
    assessmentRule: 'Assess only the current objective and confirmed knowledge points. Progress from recognition to explanation and then application; distractors must reflect plausible misconceptions, and every analysis must explain the reasoning.',
  };
}

export function formatTeachingConstraintsForPrompt(constraints?: TeachingConstraints): string {
  if (!constraints) return '';
  const allowed = constraints.allowedKnowledgePoints.length
    ? constraints.allowedKnowledgePoints.map((point) => `${point.id}: ${point.name}${point.level ? ` (${point.level})` : ''}`).join('\n')
    : 'No explicit catalog was supplied. Stay strictly within the stated page objective and course topic.';
  return [
    '## Student Profile and Teaching Boundary (authoritative)',
    `Grade/stage: ${constraints.grade} (${constraints.gradeBand})`,
    `Subject/topic: ${constraints.subject} / ${constraints.topic}`,
    `Scaffolding level: ${constraints.supportLevel}`,
    `Assumed prior knowledge: ${constraints.learnerFoundation}`,
    constraints.learningNeeds.length ? `Learning needs: ${constraints.learningNeeds.join('；')}` : '',
    constraints.familiarContexts.length ? `Familiar contexts: ${constraints.familiarContexts.join('；')}` : '',
    constraints.learningObjectives.length ? `Learning objectives: ${constraints.learningObjectives.join('；')}` : '',
    'Confirmed knowledge boundary:',
    allowed,
    `Terminology rule: ${constraints.terminologyRule}`,
    `Abstraction/depth rule: ${constraints.abstractionRule}`,
    `Example rule: ${constraints.exampleRule}`,
    `Progression rule: ${constraints.progressionRule}`,
    `Assessment rule: ${constraints.assessmentRule}`,
    'Hard rule: A concept outside the confirmed boundary may appear only as a brief analogy or context. It must be explained before use and must never become a hidden prerequisite, assessment target, or tangential extension.',
  ].filter(Boolean).join('\n');
}
