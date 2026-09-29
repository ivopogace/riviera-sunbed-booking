import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { problemCodeOf } from '../shared/api-error';
import {
  AdminDayRefundErrorCode,
  AdminDayRefundResultView,
  GuestBookingLookupView,
} from './admin.model';

/** The platform-admin day-refund surface; ADMIN-gated server-side. */
const ADMIN_BOOKINGS_API = `${environment.apiBaseUrl}/api/admin/bookings`;

/** The optional grounds an admin action may carry into the audit trail; sanitized server-side. */
const AUDIT_REASON_HEADER = 'X-Audit-Reason';

/**
 * HTTP client for the admin venue day refund (ADR-0027 decision 1): a guest's bookings by the address
 * they booked with, and the refund of one day by booking id. Stateless: the session cookie + CSRF
 * header are added by {@link apiSessionInterceptor}, and the component holds the page state. The
 * lookup is a POST although it reads: a query string would put the address into access, proxy and
 * browser-history logs.
 */
@Service()
export class AdminDayRefundService {
  private readonly http = inject(HttpClient);

  /** Empty both for an unknown address and for a known one with no bookings — no address oracle. */
  lookup(email: string): Promise<GuestBookingLookupView> {
    return firstValueFrom(
      this.http.post<GuestBookingLookupView>(`${ADMIN_BOOKINGS_API}/lookup`, { email }),
    );
  }

  /**
   * Refund `date` of booking `bookingId` for the venue's own reason; the server picks the leg and the
   * amount (#10). A non-blank `reason` rides {@link AUDIT_REASON_HEADER} into the audit trail; header
   * values must be Latin-1, so anything outside it becomes a space rather than an aborted request.
   */
  refund(bookingId: number, date: string, reason?: string): Promise<AdminDayRefundResultView> {
    const grounds = reason?.replace(/[^\x20-\x7e\xa0-\xff]/g, ' ').trim();
    return firstValueFrom(
      this.http.post<AdminDayRefundResultView>(
        `${ADMIN_BOOKINGS_API}/${bookingId}/days/${date}/refund`,
        null,
        { headers: grounds ? { [AUDIT_REASON_HEADER]: grounds } : {} },
      ),
    );
  }
}

/** Map an HTTP failure of an admin day refund to a known {@link AdminDayRefundErrorCode} (RFC-7807 `code`; or 401). */
export function adminDayRefundErrorOf(error: unknown): AdminDayRefundErrorCode {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) {
      return 'UNAUTHORIZED';
    }
    const code = problemCodeOf(error);
    switch (code) {
      case 'DAY_ATTENDED':
      case 'DAY_ALREADY_REFUNDED':
      case 'BOOKING_NOT_FOUND':
        return code;
      default:
        return 'UNKNOWN';
    }
  }
  return 'UNKNOWN';
}
