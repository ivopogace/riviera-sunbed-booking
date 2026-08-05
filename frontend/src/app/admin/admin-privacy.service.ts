import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { problemCodeOf } from '../shared/api-error';

/** What went wrong on an erasure request, as the console needs to tell it apart (RFC-7807 `code`, #97). */
export type ErasureError = 'INVALID_REQUEST' | 'UNKNOWN';

/** The optional grounds an admin action may carry into the audit trail (#507); sanitized server-side. */
const AUDIT_REASON_HEADER = 'X-Audit-Reason';

/**
 * HTTP client for the admin console's Privacy tab (A3, epic #348), against the ADMIN-gated
 * data-subject erasure endpoint #101 shipped. Stateless: the session cookie + CSRF header are added
 * by {@link apiSessionInterceptor}, and the component holds the stage state.
 *
 * <p><strong>There is exactly one success shape, and it carries no information.</strong>
 * `POST /api/admin/erasure` answers `204` when a subject was scrubbed, when they had already been
 * scrubbed, and when the platform never held that address at all — deliberately non-enumerating
 * (design D-8), so the response never reveals whether the email was known. That is why this method
 * resolves to `void` and not to an outcome: there is no outcome on the wire to model, and inventing
 * one in the client would re-open the oracle the backend closes.
 *
 * <p>A non-blank `reason` rides the {@link AUDIT_REASON_HEADER} into the platform's admin audit
 * trail (#507, recorded at the edge with no instrumentation here); header values must be Latin-1, so
 * anything outside it becomes a space rather than an aborted request.
 */
@Service()
export class AdminPrivacyService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** Erase everything the platform holds for one email address. Irreversible; `204` either way. */
  erase(email: string, reason?: string): Promise<void> {
    const grounds = reason?.replace(/[^\x20-\x7e\xa0-\xff]/g, ' ').trim();
    return firstValueFrom(
      this.http.post<void>(
        `${this.base}/api/admin/erasure`,
        { email },
        { headers: grounds ? { [AUDIT_REASON_HEADER]: grounds } : {} },
      ),
    );
  }
}

/**
 * Map an erasure failure to an {@link ErasureError}. Kept beside the call, mirroring
 * `commissionWriteErrorOf`, so the page never handles an `HttpErrorResponse` itself.
 *
 * <p>`INVALID_REQUEST` earns its own value because it is the one refusal that is about the *address*
 * rather than about the request failing: the client checks the format first, so reaching it means
 * the platform disagreed, and telling the admin to fix the address is different advice from telling
 * them to try again. Note what is deliberately absent — there is no "not found" to map, at any
 * status, because the endpoint never answers one.
 */
export function erasureErrorOf(error: unknown): ErasureError {
  if (!(error instanceof HttpErrorResponse)) {
    return 'UNKNOWN';
  }
  return problemCodeOf(error) === 'INVALID_REQUEST' ? 'INVALID_REQUEST' : 'UNKNOWN';
}
