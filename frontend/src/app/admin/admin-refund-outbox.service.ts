import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { AdminOutboxPort } from './admin-outbox-lever';
import { OutboxStatusView, ResubmissionResultView } from './admin.model';

/** The platform-admin refund-outbox surface (#454); ADMIN-gated server-side. */
const ADMIN_REFUND_OUTBOX_API = `${environment.apiBaseUrl}/api/admin/refund-outbox`;

/**
 * HTTP client for the refund outbox (#460) — what the Event Publication Registry still owes the
 * cancellation-refund listener, and the lever that re-drives it. Stateless: the session cookie +
 * CSRF header are added by {@link apiSessionInterceptor}, and the component holds the page state.
 *
 * <p>Both calls are ADMIN-gated by the backend (a non-admin operator gets 403). Neither ever returns
 * a booking id or code — counts and an outcome token only (invariant #7, the #454 contract).
 */
@Service()
export class AdminRefundOutboxService implements AdminOutboxPort {
  private readonly http = inject(HttpClient);

  /** What is outstanding, and whether the lever is currently accepting. */
  status(): Promise<OutboxStatusView> {
    return firstValueFrom(this.http.get<OutboxStatusView>(ADMIN_REFUND_OUTBOX_API));
  }

  /**
   * Hand every outstanding refund publication back to the registry.
   *
   * Resolves — it does not reject — for all three outcomes, including the two refusals: a
   * cooling-down press is a normal answer the admin acts on, not a failure.
   */
  resubmit(): Promise<ResubmissionResultView> {
    return firstValueFrom(
      this.http.post<ResubmissionResultView>(`${ADMIN_REFUND_OUTBOX_API}/resubmit`, null),
    );
  }
}
