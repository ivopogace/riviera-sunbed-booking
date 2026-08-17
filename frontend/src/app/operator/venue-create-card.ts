import { Component, inject, signal } from '@angular/core';
import { form, required, submit, FormField } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { OperatorAuth } from '../core/operator-auth';
import { OwnedVenues } from '../core/owned-venues';
import { TouchTarget } from '../shared/touch-target';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { formatCommissionPercent } from '../shared/commission-rate';
import { BookingMode } from '../shared/venue-views';
import { VenueAdminErrorCode, VenueDefaults } from './venue-admin.model';
import { VenueAdminService, venueAdminErrorOf } from './venue-admin.service';

/**
 * The create-venue form inside the operator console surface — the retired
 * `/venue-admin` editor's one surviving job, restyled to Liquid Glass. Rendered by
 * `OperatorHome` for an operator with no venue (the zero state) and for the deliberate
 * `/operator?create=1` entry. On success it resets the cached owned-venues list (the
 * landing decision reads it) and navigates straight into the new venue's beach-map tab:
 * laying out the map is the operator's next real step, and creator-owns-on-create
 * means the console is immediately theirs. The server re-validates every field (invariants
 * #3/#5/#12). The commission is not an input: the platform stamps its default server-side, and
 * the card only discloses the served figure (`GET /api/venue-defaults`).
 */
@Component({
  selector: 'app-venue-create-card',
  imports: [CardGlass, FormField, BusyAction, TouchTarget],
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
   * The platform terms served by `GET /api/venue-defaults` — the commission the create will be
   * stamped with, disclosed as an info line. Stays `undefined` (line hidden) when the read fails:
   * the disclosure is informational and must neither block the form nor fall back to a hardcoded
   * figure that could drift from the stamped rate.
   */
  protected readonly platformDefaults = signal<VenueDefaults | undefined>(undefined);
  protected readonly commissionPercent = formatCommissionPercent;

  constructor() {
    this.admin.venueDefaults().subscribe({
      next: (defaults) => this.platformDefaults.set(defaults),
      error: () => this.platformDefaults.set(undefined),
    });
  }

  protected readonly venueModel = signal({
    name: '',
    beach: '',
    region: '',
    description: '',
    bookingMode: 'INSTANT',
    payoutCurrency: 'EUR',
    bookingCutoff: '18:00',
  });
  protected readonly venueForm = form(this.venueModel, (path) => {
    required(path.name, { message: 'Venue name is required' });
    required(path.beach, { message: 'Beach is required' });
    required(path.region, { message: 'Region is required' });
    required(path.payoutCurrency, { message: 'Payout currency is required' });
    required(path.bookingCutoff, { message: 'Cutoff time is required' });
  });

  protected onCreateVenue(): void {
    this.errorCode.set(undefined);
    void submit(this.venueForm, async () => {
      const m = this.venueModel();
      this.saving.set(true);
      try {
        const created = await firstValueFrom(
          this.admin.createVenue({
            name: m.name,
            beach: m.beach,
            region: m.region,
            description: m.description,
            bookingMode: m.bookingMode as BookingMode,
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
   * Map a write failure to its message and, on a 401, drop the lost session: the
   * server session can expire/invalidate mid-create, and without clearing local auth state the
   * operator would keep retrying a dead session — the shared operator header flips to its sign-in
   * link and the guarded create form hides.
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
