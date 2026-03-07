/** User-facing message when an unexpected server/network error occurs. */
export const GENERIC_ERROR_MESSAGE =
  "An unexpected error occurred with our servers. Please try again.";

/** Normalize API error detail to a string. Handles Pydantic-style { detail: [{ msg }] } and plain string. */
export function normalizeApiErrorDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (first && typeof first === "object" && "msg" in first && typeof (first as { msg: unknown }).msg === "string") {
      return (first as { msg: string }).msg;
    }
  }
  if (detail && typeof detail === "object" && "msg" in detail && typeof (detail as { msg: unknown }).msg === "string") {
    return (detail as { msg: string }).msg;
  }
  return fallback;
}
