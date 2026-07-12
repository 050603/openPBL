import type { Course } from "@/lib/session/types";

export function buildCourseCoverPrompt(
  course: Pick<Course, "name" | "subject" | "drivingQuestion">,
): string {
  const parts: string[] = [
    "A pure visual illustration for an educational PBL course",
  ];
  if (course.subject) parts.push(`subject area: ${course.subject}`);
  if (course.drivingQuestion) {
    parts.push(`thematic concept: ${course.drivingQuestion.slice(0, 80)}`);
  }
  parts.push(
    "NO TEXT, NO WORDS, NO LETTERS, NO TYPOGRAPHY, NO LABELS, NO CAPTIONS — pure image only",
    "abstract or representational scene, clean modern style, vibrant colors, educational atmosphere",
    "16:9 aspect ratio, professional quality",
  );
  return parts.join(", ");
}

export async function requestCourseCoverImage(
  course: Pick<Course, "name" | "subject" | "drivingQuestion">,
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await fetch("/api/openmaic/generate/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: buildCourseCoverPrompt(course),
      aspectRatio: "16:9",
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
