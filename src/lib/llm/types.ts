import type {
  CourseContent,
  EvaluationDimension,
  KnowledgePoint,
  LessonOutlineSection,
} from "../session/types";

export type GenerateInput = {
  name: string;
  subject: string;
  grade: string;
  hours: number;
  summary: string;
  drivingQuestion: string;
  stages: { key: string; label: string; description: string }[];
};

export type LlmGenerateOptions = {
  // If true, return the sample content (used as a UI fallback when LLM is not configured).
  useSample?: boolean;
};

export class LlmNotConfiguredError extends Error {
  constructor() {
    super("LLM_NOT_CONFIGURED");
    this.name = "LlmNotConfiguredError";
  }
}

export type LlmCallRequest = {
  action: "pblOutline" | "lessonOutline" | "evaluationPlan" | "fullCourse";
  input: GenerateInput;
  useSample?: boolean;
};

export type LlmCallResponse = {
  content: CourseContent;
  source: "llm" | "sample";
};
