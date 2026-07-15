import type { QuizOption, QuizQuestion } from '@openmaic/lib/types/stage';

export const SUPPORTED_QUIZ_FORMATS = [
  'single_choice',
  'multiple_choice',
  'true_false',
  'fill_blank',
  'short_answer',
  'scenario_task',
] as const;

export type SupportedQuizFormat = (typeof SUPPORTED_QUIZ_FORMATS)[number];

export interface QuizNormalizationResult {
  questions: QuizQuestion[];
  issues: string[];
}

const GENERATABLE_FORMATS = new Set(['single', 'multiple', 'short_answer', 'true_false', 'fill_blank', 'scenario_task']);

export function selectQuizFormats(input: {
  objectiveText: string;
  difficulty: 'easy' | 'medium' | 'hard';
  questionCount: number;
  requested?: string[];
}): string[] {
  const selected = (input.requested ?? []).filter((item) => GENERATABLE_FORMATS.has(item));
  const textValue = input.objectiveText.toLowerCase();
  const candidates: string[] = [];
  if (/判断|辨认|识别|概念|定义|recogn|identify|define/.test(textValue)) candidates.push('true_false', 'single');
  if (/比较|分类|证据|多种|compare|classif|evidence/.test(textValue)) candidates.push('multiple');
  if (/解释|原因|机制|说明|explain|why|mechanism/.test(textValue)) candidates.push('short_answer');
  if (/应用|解决|设计|情境|案例|迁移|apply|solve|design|scenario|case/.test(textValue)) candidates.push('scenario_task');
  if (/术语|关键词|关系|填|term|keyword|relation/.test(textValue)) candidates.push('fill_blank');
  if (candidates.length === 0) candidates.push('single', input.difficulty === 'easy' ? 'true_false' : 'short_answer');
  if (input.difficulty === 'hard') candidates.push('scenario_task');

  const merged = Array.from(new Set([...selected, ...candidates]));
  const maxFormats = Math.max(1, Math.min(input.questionCount, 3));
  return merged.slice(0, maxFormats);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function rawAnswer(record: Record<string, unknown>): unknown {
  return record.answer ?? record.correctAnswer ?? record.correct_answer;
}

function answerArray(record: Record<string, unknown>): string[] {
  const value = rawAnswer(record);
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (value === undefined || value === null || value === '') return [];
  return [String(value).trim()];
}

function normalizeOptions(value: unknown): QuizOption[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const fallback = String.fromCharCode(65 + index);
    if (typeof item === 'string') return { value: fallback, label: item.trim() || fallback };
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      value: text(record.value) || fallback,
      label: text(record.label) || text(record.text) || text(record.value) || fallback,
    };
  });
}

function semanticFormat(rawType: string, rawFormat: string): SupportedQuizFormat {
  const value = `${rawFormat || rawType}`.toLowerCase().replace(/[\s-]+/g, '_');
  if (/true_false|judg|判断|boolean/.test(value)) return 'true_false';
  if (/fill|blank|填空/.test(value)) return 'fill_blank';
  if (/scenario|situation|情境|case_task/.test(value)) return 'scenario_task';
  if (/multiple|multi_choice|多选/.test(value)) return 'multiple_choice';
  if (/short|text|essay|简答/.test(value)) return 'short_answer';
  return 'single_choice';
}

function unsupportedStructuredType(rawType: string): boolean {
  return /match|matching|drag|connect|line|order|sort|排序|连线|拖拽|匹配/.test(rawType.toLowerCase());
}

function explainUnsupported(record: Record<string, unknown>): string {
  const parts: string[] = [];
  if (Array.isArray(record.options)) {
    parts.push((record.options as unknown[]).map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join('；'));
  }
  if (Array.isArray(record.pairs)) {
    parts.push((record.pairs as unknown[]).map((item) => JSON.stringify(item)).join('；'));
  }
  return parts.filter(Boolean).join('；').slice(0, 500);
}

function choiceAnalysis(options: QuizOption[], answers: string[], original: string): string {
  if (original.length >= 12) return original;
  const labels = answers.map((answer) => options.find((option) => option.value === answer)?.label ?? answer);
  return `正确答案为${labels.join('、')}。判断时应回到题目对应的核心概念，说明这些选项为什么符合条件，并辨析其他选项所反映的常见误解。`;
}

export function normalizeQuizQuestions(input: unknown): QuizNormalizationResult {
  const issues: string[] = [];
  const rawQuestions = Array.isArray(input) ? input : [];
  const questions = rawQuestions.flatMap((value, index): QuizQuestion[] => {
    const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const question = text(record.question) || text(record.prompt) || text(record.title);
    if (!question) {
      issues.push(`question ${index + 1}: missing stem and removed`);
      return [];
    }
    const rawType = text(record.type) || 'single';
    const id = text(record.id) || `q_${index + 1}`;
    const pointsValue = Number(record.points);
    const points = Number.isFinite(pointsValue) && pointsValue > 0 ? Math.min(100, Math.round(pointsValue)) : 10;
    const originalAnalysis = text(record.analysis) || text(record.explanation);

    if (unsupportedStructuredType(rawType)) {
      issues.push(`question ${index + 1}: unsupported ${rawType} downgraded to scenario_task`);
      const structure = explainUnsupported(record);
      return [{
        id,
        type: 'short_answer',
        format: 'scenario_task',
        question: structure ? `${question}\n请用“对象—对应关系/顺序—理由”的方式作答。可参考待处理项目：${structure}` : `${question}\n请写出完整关系或顺序，并说明理由。`,
        analysis: originalAnalysis || '参考答案应给出完整关系或顺序，并根据当前知识点解释每一项判断的依据。',
        commentPrompt: text(record.commentPrompt) || '评分规则：关系或顺序完整且正确占60%；理由符合当前知识点占30%；表达清楚占10%。',
        hasAnswer: false,
        points,
      }];
    }

    const format = semanticFormat(rawType, text(record.format));
    if (format === 'fill_blank' || format === 'short_answer' || format === 'scenario_task') {
      return [{
        id,
        type: 'short_answer',
        format,
        question,
        analysis: originalAnalysis || '参考答案必须围绕当前知识点给出关键概念、判断依据和必要步骤，而不只是结论。',
        commentPrompt: text(record.commentPrompt) || (format === 'fill_blank'
          ? '评分规则：关键概念准确占70%；语义符合题干占20%；表达清楚占10%。允许语义等价表述。'
          : '评分规则：核心概念和结论占40%；推理或证据占40%；表达清楚占20%。'),
        hasAnswer: false,
        points,
      }];
    }

    let options = normalizeOptions(record.options);
    let answers = answerArray(record);
    if (format === 'true_false') {
      options = [{ value: 'true', label: '正确' }, { value: 'false', label: '错误' }];
      answers = answers.map((answer) => /^(true|正确|对|是|1)$/i.test(answer) ? 'true' : 'false').slice(0, 1);
    } else {
      answers = answers.map((answer) => {
        const byValue = options.find((option) => option.value === answer);
        if (byValue) return byValue.value;
        return options.find((option) => option.label === answer)?.value ?? answer;
      });
    }
    answers = Array.from(new Set(answers.filter((answer) => options.some((option) => option.value === answer))));

    if (options.length < 2 || answers.length === 0) {
      issues.push(`question ${index + 1}: invalid choice structure downgraded to short_answer`);
      return [{
        id,
        type: 'short_answer',
        format: 'short_answer',
        question,
        analysis: originalAnalysis || '参考答案应说明结论以及依据当前知识点得出该结论的原因。',
        commentPrompt: text(record.commentPrompt) || '评分规则：结论准确占40%；理由或证据占50%；表达清楚占10%。',
        hasAnswer: false,
        points,
      }];
    }

    const type = format === 'multiple_choice' && answers.length > 1 ? 'multiple' : 'single';
    if (format === 'multiple_choice' && type === 'single') {
      issues.push(`question ${index + 1}: multiple choice had fewer than two answers and was repaired as single choice`);
    }
    return [{
      id,
      type,
      format: type === 'multiple' ? 'multiple_choice' : format,
      question,
      options,
      answer: type === 'single' ? answers.slice(0, 1) : answers,
      analysis: choiceAnalysis(options, type === 'single' ? answers.slice(0, 1) : answers, originalAnalysis),
      hasAnswer: true,
      points,
    }];
  });

  return { questions, issues };
}
