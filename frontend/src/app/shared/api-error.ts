import { HttpErrorResponse } from '@angular/common/http';

/**
 * The API's RFC-7807 error body (issue #97): every backend error is
 * `application/problem+json` whose stable machine-readable identity is the `code`
 * extension — `type` stays `about:blank` in v1. Only the fields the client reads are
 * typed here.
 */
interface ProblemBody {
  readonly code?: string;
}

/**
 * The stable error `code` of an HTTP failure, or `undefined` when the response carries
 * no ProblemDetail body (network failure, empty 401, non-JSON proxy error). The single
 * place the wire shape is parsed — the per-feature `…ErrorOf` mappers narrow the result
 * to their own displayable unions.
 */
export function problemCodeOf(error: HttpErrorResponse): string | undefined {
  return (error.error as ProblemBody | null)?.code;
}
