import { Component, inject, signal } from '@angular/core';
import { BeachField } from './beach-field';
import { BookingCutoffField } from './booking-cutoff-field';
import { BookingModeField } from './booking-mode-field';
import { form, required, submit, FormField } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { OperatorAuth } from '../core/operator-auth';
import { OwnedVenues } from '../core/owned-venues';
import { FieldErrorFor } from '../shared/field-error-for';
import { TouchTarget } from '../shared/touch-target';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { formatCommissionPercent } from '../shared/commission-rate';
import { BeachCode } from '../shared/beaches';
import { BookingMode } from '../shared/venue-views';
import { VenueAdminErrorCode, VenueDefaults } from './venue-admin.model';
import { VenueAdminService, venueAdminErrorOf } from './venue-admin.service';

/** The new-venue fields bound to the Signal Form. Typed rather than inferred, so `bookingMode`
 *  is the union the server accepts instead of a bare string the submit path has to assert. */
interface VenueDraft {
  name: string;
  beach: BeachCode | '';
  description: string;
  bookingMode: BookingMode;
  payoutCurrency: string;
  bookingCutoff: string; // "HH:mm" Europe/Tirane
}

/**
 * The create-venue form in the operator console, rendered by `OperatorHome` for an operator with no
 * venue and for the `/operator?create=1` entry. On success it resets the cached owned-venues list
 * (the landing decision reads it) and navigates into the new venue's beach-map tab (the creator
 * owns it). The server re-validates every field. The commission is not an input: the platform
 * stamps its default server-side; the card only discloses the served `/api/venue-defaults` figure.
 */
@Component({
  selector: 'app-venue-create-card',
  imports: [
    BeachField,
    BookingCutoffField,
    BookingModeField,
    CardGlass,
    FieldErrorFor,
    FormField,
    BusyAction,
    TouchTarget,
  ],
  templateUrl: './venue-create-card.html',
})
export class VenueCreateCard {
  private readonly admin = inject(VenueAdminService);
  private readonly ownedVenues = inject(OwnedVenues);
  private readonly router = inject(Router);
  protected readonly operator = inject(OperatorAuth);

  protected readonly saving = signal(false);
  private readonly errorCode = signal<VenueAdminErrorCode | undefined>(undefined);

  /**
   * The platform terms from `GET /api/venue-defaults` — the commission the create will be stamped
   * with. Stays `undefined` (line hidden) when the read fails: never block the form, and never fall
   * back to a hardcoded figure that could drift from the stamped rate.
   */
  protected readonly platformDefaults = signal<VenueDefaults | undefined>(undefined);
  protected readonly commissionPercent = formatCommissionPercent;

  constructor() {
    this.admin.venueDefaults().subscribe({
      next: (defaults) => this.platformDefaults.set(defaults),
      error: () => this.platformDefaults.set(undefined),
    });
  }

  protected readonly venueModel = signal<VenueDraft>({
    name: '',
    beach: '',
    description: '',
    bookingMode: 'INSTANT',
    payoutCurrency: 'EUR',
    bookingCutoff: '18:00',
  });
  protected readonly venueForm = form(this.venueModel, (path) => {
    required(path.name, { message: 'Venue name is required' });
    required(path.beach, { message: 'Beach is required' });
    required(path.payoutCurrency, { message: 'Payout currency is required' });
    required(path.bookingCutoff, { message: 'Free-cancellation deadline is required' });
  });

  protected onCreateVenue(): void {
    this.errorCode.set(undefined);
    void submit(this.venueForm, async () => {
      const m = this.venueModel();
      if (m.beach === '') {
        return;
      }
      this.saving.set(true);
      try {
        const created = await firstValueFrom(
          this.admin.createVenue({
            name: m.name,
            beach: m.beach,
            description: m.description,
            bookingMode: m.bookingMode,
            payoutCurrency: m.payoutCurrency,
            bookingCutoff: m.bookingCutoff,
          }),
        );
        // Reset BEFORE navigating: the console we land in is fed by this cached list.
        this.ownedVenues.reset();
        await this.router.navigateByUrl(`/operator/${created.id}/beach-map`);
      } catch (error) {
        this.failWrite(error);
      } finally {
        this.saving.set(false);
      }
    });
  }

  /**
   * Map a write failure to its message and, on a 401, drop the lost session — otherwise the
   * operator keeps retrying a dead session; the header flips to sign-in and the guarded form hides.
   */
  private failWrite(error: unknown): void {
    const code = venueAdminErrorOf(error);
    this.errorCode.set(code);
    if (code === 'UNAUTHORIZED') {
      this.operator.sessionLost();
    }
  }

  protected errorMessage(): string | undefined {
    const code = this.errorCode();
    if (code === undefined) {
      return undefined;
    }
    switch (code) {
      case 'UNAUTHORIZED':
        return 'Your operator session has expired. Please sign in again.';
      case 'NO_SUCH_VENUE':
        return 'That venue no longer exists.';
      case 'INVALID_REQUEST':
        return 'Please check the form values and try again.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
}
