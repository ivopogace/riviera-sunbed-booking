import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { BookingConfirmation, BookingErrorCode, CreateBookingRequest } from './booking.model';

/**
 * Creates bookings against the U3 API (`POST /api/bookings`) and holds the most recent
 * confirmation so the confirmation screen can render it after navigation (no `GET by code`
 * endpoint until U6). Single responsibility: typed access to the booking write API + the
 * last-confirmation handoff.
 */
@Service()
export class BookingService {
  private readonly http = inject(HttpClient);

  private readonly confirmation = signal<BookingConfirmation | undefined>(undefined);
  /** The last successful confirmation, consumed by the confirmation route. */
  readonly lastConfirmation = this.confirmation.asReadonly();

  createBooking(request: CreateBookingRequest): Observable<BookingConfirmation> {
    return this.http
      .post<BookingConfirmation>(`${environment.apiBaseUrl}/api/bookings`, request)
      .pipe(tap((confirmation) => this.confirmation.set(confirmation)));
  }

  clear(): void {
    this.confirmation.set(undefined);
  }
}

/** Map an HTTP failure to a stable, displayable booking error code. */
export function bookingErrorOf(error: unknown): BookingErrorCode {
  if (error instanceof HttpErrorResponse) {
    const code = (error.error as { error?: string } | null)?.error;
    switch (code) {
      case 'SET_TAKEN':
      case 'SET_NOT_BOOKABLE_ONLINE':
      case 'BOOKING_CLOSED':
      case 'NO_SUCH_SET':
        return code;
      case 'INVALID_REQUEST':
        return 'INVALID_REQUEST';
      default:
        return 'UNKNOWN';
    }
  }
  return 'UNKNOWN';
}
