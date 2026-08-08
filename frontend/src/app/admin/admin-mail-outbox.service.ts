import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { AdminOutboxPort } from './admin-outbox-lever';
import { OutboxStatusView, ResubmissionResultView } from './admin.model';

/** The platform-admin mail-outbox surface; ADMIN-gated server-side. */
const ADMIN_MAIL_OUTBOX_API = `${environment.apiBaseUrl}/api/admin/mail-outbox`;

/**
 * HTTP client for the mail outbox — what the Event Publication Registry still owes the
 * notification module, and the lever that re-drives it. Stateless: the session cookie + CSRF header
 * are added by {@link apiSessionInterceptor}, and the component holds the page state.
 *
 * <p>Both calls are ADMIN-gated by the backend (a non-admin operator gets 403). Neither ever returns
 * an address or an arrival code — counts and an outcome token only.
 */
@Service()
export class AdminMailOutboxService implements AdminOutboxPort {
  private readonly http = inject(HttpClient);

  /** What is outstanding, and whether the lever is currently accepting. */
  status(): Promise<OutboxStatusView> {
    return firstValueFrom(this.http.get<OutboxStatusView>(ADMIN_MAIL_OUTBOX_API));
  }

  /**
   * Hand every outstanding publication back to the registry.
   *
   * Resolves — it does not reject — for all three outcomes, including the two refusals: a
   * cooling-down press is a normal answer the admin acts on, not a failure.
   */
  resubmit(): Promise<ResubmissionResultView> {
    return firstValueFrom(
      this.http.post<ResubmissionResultView>(`${ADMIN_MAIL_OUTBOX_API}/resubmit`, null),
    );
  }
}
