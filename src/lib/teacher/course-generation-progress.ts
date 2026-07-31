export const PRIMARY_GENERATION_PROGRESS_MAX = 82;
export const ADAPTIVE_GENERATION_PROGRESS_START = 86;
export const ADAPTIVE_GENERATION_PROGRESS_END = 98;

export function mapPrimaryGenerationProgress(progress: number): number {
  return Math.min(
    PRIMARY_GENERATION_PROGRESS_MAX,
    Math.max(0, Math.round(progress * (PRIMARY_GENERATION_PROGRESS_MAX / 100))),
  );
}

export function mapAdaptiveGenerationProgress(values: Iterable<number>): number {
  const progress = Array.from(values);
  if (progress.length === 0) return ADAPTIVE_GENERATION_PROGRESS_START;
  const average = progress.reduce((sum, value) => sum + value, 0) / progress.length;
  const span =
    ADAPTIVE_GENERATION_PROGRESS_END - ADAPTIVE_GENERATION_PROGRESS_START;
  return Math.min(
    ADAPTIVE_GENERATION_PROGRESS_END,
    ADAPTIVE_GENERATION_PROGRESS_START +
      Math.round((Math.max(0, average) / 100) * span),
  );
}

export function currentGenerationProgress(
  values: Iterable<number>,
  complete = false,
): number {
  if (complete) return 100;
  const progress = Array.from(values);
  if (progress.length === 0) return 0;
  return Math.min(99, Math.max(0, ...progress));
}
