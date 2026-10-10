import { HttpErrorResponse } from '@angular/common/http';

/**
 * The API's RFC-7807 error body: every backend error is
 * `application/problem+json` whose stable machine-readable identity is the `code`
 * extension — `type` stays `about:blank` in v1. Only the fields the client reads are
 * typed here.
 */
interface ProblemBody {
  readonly code?: string;
  /**
   * The request field a `400 INVALID_REQUEST` refused, when the server can name one; see
   * error-contract.md § Extension members past `code`.
   */
  readonly field?: string;
}

/**
 * The stable error `code` of an HTTP failure, or `undefined` when the response carries no
 * ProblemDetail body (network failure, empty 401, non-JSON proxy error). The single place the wire
 * shape is parsed; the per-feature `…ErrorOf` mappers narrow it to their own displayable unions.
 */
export function problemCodeOf(error: HttpErrorResponse): string | undefined {
  return (error.error as ProblemBody | null)?.code;
}

/** The request field a refusal names (the `field` extension), or `undefined` when it names none. */
export function problemFieldOf(error: HttpErrorResponse): string | undefined {
  return (error.error as ProblemBody | null)?.field;
}
