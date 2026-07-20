// Unified API error codes for openPBL.
//
// Re-exports the legacy OpenMAIC API_ERROR_CODES for backwards compatibility
// and adds new codes introduced in Stage 3 (API hardening). All API routes
// should use these codes (or the legacy ones) when constructing error
// responses so clients can switch on stable string identifiers.

export {
  API_ERROR_CODES,
  apiError,
  apiSuccess,
  type ApiErrorCode,
  type ApiErrorBody,
} from "@/lib/openmaic/server/api-response";

/**
 * Additional error codes beyond the legacy OpenMAIC set. These are emitted
 * by new openPBL routes (auth, session, uploads, realtime) that did not
 * exist in the original OpenMAIC surface.
 */
export const OPENPBL_ERROR_CODES = {
  // Auth
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  FORBIDDEN_ACTION: "FORBIDDEN_ACTION",
  AUTH_NOT_CONFIGURED: "AUTH_NOT_CONFIGURED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  // Session actions
  INVALID_JSON: "INVALID_JSON",
  INVALID_ACTION: "INVALID_ACTION",
  UNKNOWN_ACTION_TYPE: "UNKNOWN_ACTION_TYPE",
  ACTION_FAILED: "ACTION_FAILED",
  START_TEACHING_NOT_ALLOWED: "START_TEACHING_NOT_ALLOWED",
  // Validation
  VALIDATION_FAILED: "VALIDATION_FAILED",
  // Uploads
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  UNSUPPORTED_FILE_TYPE: "UNSUPPORTED_FILE_TYPE",
  UPLOAD_FAILED: "UPLOAD_FAILED",
  // System
  RATE_LIMITED: "RATE_LIMITED",
  MISSING_PUBLIC_BASE_URL: "MISSING_PUBLIC_BASE_URL",
  DB_NOT_CONFIGURED: "DB_NOT_CONFIGURED",
  NOT_FOUND: "NOT_FOUND",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type OpenPblErrorCode = (typeof OPENPBL_ERROR_CODES)[keyof typeof OPENPBL_ERROR_CODES];

/**
 * Construct a JSON error response in the openPBL canonical shape:
 * `{ error: code, message, details? }`. Use this for new routes that do
 * not need the OpenMAIC `success: false` envelope.
 */
export function openPblError(
  code: OpenPblErrorCode | string,
  status: number,
  message: string,
  details?: string,
): Response {
  return Response.json(
    {
      error: code,
      message,
      ...(details ? { details } : {}),
    },
    { status },
  );
}
