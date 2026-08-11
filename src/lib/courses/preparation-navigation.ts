export function courseDetailedEditHref(courseId: string): string {
  return `/teacher/prepare/${encodeURIComponent(courseId)}/verify/edit`;
}

export function resolvePreparationGenerationMode(pathname: string): "quick" | "detailed" {
  return pathname.endsWith("/verify/edit") ? "detailed" : "quick";
}
