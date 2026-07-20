// Request body validation helpers built on zod. Keeps route handlers terse
// while returning structured 400 responses on invalid input.

import type { ZodSchema, ZodError } from "zod";
import { openPblError, OPENPBL_ERROR_CODES } from "./error-codes";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: Response };

/**
 * Parse a JSON request body against a zod schema. On any failure (bad JSON,
 * schema mismatch) returns a `ValidationResult.ok=false` carrying a ready
 * 400 response. On success returns the typed value.
 *
 * Usage:
 *   const parsed = await validateRequestBody(req, MySchema);
 *   if (!parsed.ok) return parsed.response;
 *   // parsed.value is now typed as z.infer<typeof MySchema>
 */
export async function validateRequestBody<T>(
  req: Request,
  schema: ZodSchema<T>,
): Promise<ValidationResult<T>> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return {
      ok: false,
      response: openPblError(
        OPENPBL_ERROR_CODES.INVALID_JSON,
        400,
        "请求体不是有效的 JSON",
      ),
    };
  }

  const result = schema.safeParse(json);
  if (result.success) {
    return { ok: true, value: result.data };
  }

  return {
    ok: false,
    response: openPblError(
      OPENPBL_ERROR_CODES.VALIDATION_FAILED,
      400,
      "请求参数校验失败",
      formatZodError(result.error),
    ),
  };
}

/**
 * Validate an already-parsed value (e.g. from a query string or a search
 * param) against a zod schema.
 */
export function validateValue<T>(
  value: unknown,
  schema: ZodSchema<T>,
): ValidationResult<T> {
  const result = schema.safeParse(value);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  return {
    ok: false,
    response: openPblError(
      OPENPBL_ERROR_CODES.VALIDATION_FAILED,
      400,
      "参数校验失败",
      formatZodError(result.error),
    ),
  };
}

function formatZodError(err: ZodError): string {
  const issues = err.issues.map((i) => {
    const path = i.path.length > 0 ? i.path.join(".") : "(root)";
    return `${path}: ${i.message}`;
  });
  return issues.join("; ");
}
