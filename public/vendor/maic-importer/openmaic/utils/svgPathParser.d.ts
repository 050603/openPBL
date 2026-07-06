/**
 * Compute the bounding-box max corner of an SVG path's `d` attribute.
 *
 * Used by the PPTX import pipeline to derive a `viewBox` when the shape's
 * path has been customised and no longer matches the preset dimensions.
 *
 * Implementation notes:
 * - Handles standard absolute commands: M, L, H, V, C, S, Q, T, A, Z.
 * - Relative commands (m/l/h/v/c/s/q/t/a) are tracked against the current
 *   point so coordinates accumulate correctly.
 * - Arc command arguments (rx, ry, x-axis-rotation, large-arc, sweep) are
 *   skipped; only the endpoint affects the bounding box approximation.
 *   The true arc extrema can extend beyond the endpoint — for `viewBox`
 *   sizing this is a small under-approximation that callers can compensate
 *   for by padding (which the import pipeline already does indirectly).
 * - Returns `{ maxX: 0, maxY: 0 }` for empty / unparseable input; callers
 *   typically fall back to the element's original width/height in that case.
 */
export interface PathRange {
    maxX: number;
    maxY: number;
}
export declare function getSvgPathRange(path: string | undefined | null): PathRange;
