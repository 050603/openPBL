import type {
  CourseContent,
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

export class LlmNotConfiguredError extends Error {
  constructor() {
    super("LLM_NOT_CONFIGURED");
    this.name = "LlmNotConfiguredError";
  }
}

export type LlmCallRequest = {
  action:
    | "pblOutline"
    | "knowledgeGraph"
    | "teachingOutline"
    | "lessonOutline"
    | "evaluationPlan"
    | "fullCourse";
  input: GenerateInput;
  context?: Partial<
    Pick<
      CourseContent,
      "pblOutline" | "knowledgePoints" | "knowledgeGraph" | "teachingOutline" | "lessonOutline"
    >
  >;
};

export type LlmCallResponse = {
  content: CourseContent;
  source: "llm";
};
