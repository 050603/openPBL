import type { Course } from "@/lib/session/types";

type CourseCoverContext = Pick<Course, "name"> &
  Partial<
    Pick<
      Course,
      "subject" | "grade" | "summary" | "drivingQuestion" | "expectedOutcome"
    >
  >;

const COVER_STYLE = "modern editorial vector illustration";

/**
 * All course covers share this output contract. Keeping the dimensions and art
 * direction here prevents individual preparation screens from drifting into
 * different ratios or unrelated visual styles.
 */
export const COURSE_COVER_GENERATION_SPEC = {
  aspectRatio: "16:9" as const,
  width: 1024,
  height: 576,
  style: COVER_STYLE,
  negativePrompt:
    "text, words, letters, numbers, typography, captions, labels, logos, watermarks, interface elements, posters, book covers, split panels, photorealism, 3D render, clutter, generic education icons",
};

function cleanContext(value: string | undefined, maxLength: number): string {
  return (value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function buildCourseCoverPrompt(
  course: CourseCoverContext,
): string {
  const name = cleanContext(course.name, 100) || "Untitled project course";
  const subject = cleanContext(course.subject, 60);
  const grade = cleanContext(course.grade, 40);
  const drivingQuestion = cleanContext(course.drivingQuestion, 180);
  const summary = cleanContext(course.summary, 180);
  const expectedOutcome = cleanContext(course.expectedOutcome, 120);

  const context = [
    `PRIMARY COURSE THEME: "${name}"`,
    subject ? `Subject: ${subject}` : null,
    grade ? `Learners: ${grade}` : null,
    drivingQuestion ? `Project question: ${drivingQuestion}` : null,
    summary ? `Course context: ${summary}` : null,
    expectedOutcome ? `Expected project outcome: ${expectedOutcome}` : null,
  ].filter(Boolean);

  return [
    "Create a cover image whose visible subject is unmistakably derived from the PRIMARY COURSE THEME below. Depict the concrete objects, environment, people or process named or strongly implied by that title. The course title controls the image; the remaining context only improves accuracy. Do not fall back to generic books, classrooms, light bulbs or random educational symbols unless the theme explicitly requires them.",
    context.join("\n"),
    `ART DIRECTION: ${COVER_STYLE}; consistent OpenPBL course-cover visual system; clean layered shapes with subtle paper texture; crisp silhouettes; approachable but not childish; restrained shared palette of teal, sky blue, warm amber and coral with warm off-white highlights; soft natural depth; polished editorial finish.`,
    "COMPOSITION: one clear focal scene, medium visual density, strong subject separation, generous safe margins, no collage and no split panels. Keep important subjects inside the central 80% so the same image remains legible when course cards crop it slightly.",
    "OUTPUT: 16:9 landscape composition at 1024x576. Pure image only. NO TEXT, NO WORDS, NO LETTERS, NO NUMBERS, NO TYPOGRAPHY, NO LABELS, NO CAPTIONS, NO LOGOS, NO WATERMARKS, NO UI.",
  ].join("\n\n");
}

export async function requestCourseCoverImage(
  course: CourseCoverContext,
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await fetch("/api/openmaic/generate/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: buildCourseCoverPrompt(course),
      ...COURSE_COVER_GENERATION_SPEC,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Image generation failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    result?: { url?: string; base64?: string; format?: string };
  };
  const result = payload.result;
  if (result?.url) return result.url;
  if (result?.base64) {
    return `data:image/${result.format || "png"};base64,${result.base64}`;
  }
  return null;
}
