import type {
  CourseContent,
} from "../session/types";
import type { PblCourseConfig } from "../pbl-course-config";
import type { LearnerProfileInput } from "@/lib/openmaic/pedagogy/teaching-constraints";

export type GenerateInput = {
  name: string;
  subject: string;
  grade: string;
  hours: number;
  summary: string;
  drivingQuestion: string;
  learningObjectives?: string[];
  learnerProfile?: LearnerProfileInput;
  stages: { key: string; label: string; description: string }[];
  pblConfig?: PblCourseConfig;
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
      | "pblOutline"
      | "knowledgePoints"
      | "knowledgeGraph"
      | "projectMainline"
      | "moduleTimingPlan"
      | "teachingOutline"
      | "lessonOutline"
    >
  >;
};

export type LlmCallResponse = {
  content: CourseContent;
  source: "llm";
};
