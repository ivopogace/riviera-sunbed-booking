import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { MailDeliveryLookupView, MailResendResultView } from './admin.model';

/** The platform-admin mail-delivery surface (#380); ADMIN-gated server-side. */
const ADMIN_MAIL_DELIVERY_API = `${environment.apiBaseUrl}/api/admin/mail-deliveries`;

/**
 * HTTP client for the per-booking mail-delivery view (#380) — what happened to a tourist's
 * confirmation mail, and the button that sends it again. Stateless: the session cookie + CSRF header
 * are added by {@link apiSessionInterceptor}, and the component holds the page state.
 *
 * <p>Both calls are ADMIN-gated by the backend (a non-admin operator gets 403). The lookup is a POST
 * although it reads: its key is an email address, and a query string would put that address into
 * access, proxy and browser-history logs.
 */
@Service()
export class AdminMailDeliveryService {
  private readonly http = inject(HttpClient);

  /**
   * The bookings made with this address and their mail history.
   *
   * Resolves with an empty list both for an unknown address and for a known one with no bookings —
   * deliberately the same answer, so the surface is not an "is this address known" oracle.
   */
  lookup(email: string): Promise<MailDeliveryLookupView> {
    return firstValueFrom(
      this.http.post<MailDeliveryLookupView>(`${ADMIN_MAIL_DELIVERY_API}/lookup`, { email }),
    );
  }

  /**
   * Send this booking's confirmation again.
   *
   * Resolves — it does not reject — for every outcome, refusals included: "never confirmed" is an
   * answer the admin acts on, not a failure.
   */
  resend(bookingId: number): Promise<MailResendResultView> {
    return firstValueFrom(
      this.http.post<MailResendResultView>(`${ADMIN_MAIL_DELIVERY_API}/${bookingId}/resend`, null),
    );
  }
}
