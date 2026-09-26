import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { problemCodeOf } from '../shared/api-error';

/** What went wrong on an erasure request, as the console needs to tell it apart (RFC-7807 `code`). */
export type ErasureError = 'INVALID_REQUEST' | 'UNKNOWN';

/** The optional grounds an admin action may carry into the audit trail; sanitized server-side. */
const AUDIT_REASON_HEADER = 'X-Audit-Reason';

/**
 * Stateless HTTP client for the Privacy tab's ADMIN-gated erasure endpoint. It answers `204`
 * whether the subject was scrubbed, already scrubbed or never known, non-enumerating by design
 * (`docs/runbooks/data-erasure.md`), so `erase` resolves `void`: modelling an outcome the wire does
 * not carry would re-open that oracle. A non-blank `reason` rides {@link AUDIT_REASON_HEADER} to
 * the edge's audit trail; non-Latin-1 characters become spaces, not an aborted request.
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
 * Map an erasure failure to an {@link ErasureError}. `INVALID_REQUEST` is defensive: the server
 * refuses only a blank address, which the form already excludes, so a form regression reads "fix
 * the address", not a futile "try again". No "not found" exists: the endpoint never answers one.
 */
export function erasureErrorOf(error: unknown): ErasureError {
  if (!(error instanceof HttpErrorResponse)) {
    return 'UNKNOWN';
  }
  return problemCodeOf(error) === 'INVALID_REQUEST' ? 'INVALID_REQUEST' : 'UNKNOWN';
}
