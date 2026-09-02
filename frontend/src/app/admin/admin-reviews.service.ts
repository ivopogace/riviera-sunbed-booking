import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { AdminReviewsPage } from './admin.model';

/** The optional grounds an admin action may carry into the audit trail; sanitized server-side. */
const AUDIT_REASON_HEADER = 'X-Audit-Reason';

/**
 * HTTP client for the admin console's Reviews tab. Stateless: the session cookie + CSRF header
 * are added by {@link apiSessionInterceptor}, and the component holds the page state.
 *
 * <p>All three calls are ADMIN-gated server-side and deliberately ownership-free: the list is the
 * only read of a venue's reviews that shows hidden and star-only rows, and it answers for venues
 * the public list refuses. Hide and un-hide are idempotent on the server, so a retried press is
 * harmless.
 */
@Service()
export class AdminReviewsService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  /** One page of a venue's reviews, newest first; `cursor` is the previous page's `nextCursor`. */
  reviews(venueId: number, cursor?: number): Promise<AdminReviewsPage> {
    return firstValueFrom(
      this.http.get<AdminReviewsPage>(`${this.base}/api/admin/venues/${venueId}/reviews`, {
        params: cursor === undefined ? {} : { cursor },
      }),
    );
  }

  /**
   * Take one review out of public view — reversible. A non-blank `reason` rides the
   * {@link AUDIT_REASON_HEADER} into the audit trail; header values must be Latin-1, so anything
   * outside it becomes a space rather than an aborted request.
   */
  hide(reviewId: number, reason?: string): Promise<void> {
    const grounds = reason?.replace(/[^\x20-\x7e\xa0-\xff]/g, ' ').trim();
    return firstValueFrom(
      this.http.post<void>(`${this.base}/api/admin/reviews/${reviewId}/hide`, null, {
        headers: grounds ? { [AUDIT_REASON_HEADER]: grounds } : {},
      }),
    );
  }

  /** Put a hidden review back into public view. */
  unhide(reviewId: number): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base}/api/admin/reviews/${reviewId}/unhide`, null),
    );
  }
}
