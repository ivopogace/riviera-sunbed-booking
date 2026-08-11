import { Component, inject, signal } from '@angular/core';
import { form, required, submit, FormField } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { OperatorAuth } from '../core/operator-auth';
import { OwnedVenues } from '../core/owned-venues';
import { BusyAction } from '../shared/busy-action';
import { CardGlass } from '../shared/card-glass';
import { parseWholeNumber } from '../shared/whole-number';
import { BookingMode } from '../shared/venue-views';
import { VenueAdminErrorCode } from './venue-admin.model';
import { VenueAdminService, venueAdminErrorOf } from './venue-admin.service';

/**
 * The create-venue form inside the operator console surface — the retired
 * `/venue-admin` editor's one surviving job, restyled to Liquid Glass. Rendered by
 * `OperatorHome` for an operator with no venue (the zero state) and for the deliberate
 * `/operator?create=1` entry. On success it resets the cached owned-venues list (the
 * landing decision reads it) and navigates straight into the new venue's beach-map tab:
 * laying out the map is the operator's next real step, and creator-owns-on-create
 * means the console is immediately theirs. The server re-validates every field (invariants
 * #3/#5/#12); numeric fields are parsed on submit.
 */
@Component({
  selector: 'app-venue-create-card',
  imports: [CardGlass, FormField, BusyAction],
  templateUrl: './venue-create-card.html',
})
export class VenueCreateCard {
  private readonly admin = inject(VenueAdminService);
  private readonly ownedVenues = inject(OwnedVenues);
  private readonly router = inject(Router);
  protected readonly operator = inject(OperatorAuth);

  protected readonly saving = signal(false);
  private readonly errorCode = signal<VenueAdminErrorCode | undefined>(undefined);

  protected readonly venueModel = signal({
    name: '',
    beach: '',
    region: '',
    description: '',
    bookingMode: 'INSTANT',
    commissionBps: '1500',
    payoutCurrency: 'EUR',
    bookingCutoff: '18:00',
  });
  protected readonly venueForm = form(this.venueModel, (path) => {
    required(path.name, { message: 'Venue name is required' });
    required(path.beach, { message: 'Beach is required' });
    required(path.region, { message: 'Region is required' });
    required(path.commissionBps, { message: 'Commission (bps) is required' });
    required(path.payoutCurrency, { message: 'Payout currency is required' });
    required(path.bookingCutoff, { message: 'Cutoff time is required' });
  });

  protected onCreateVenue(): void {
    this.errorCode.set(undefined);
    void submit(this.venueForm, async () => {
      const m = this.venueModel();
      const commissionBps = parseWholeNumber(m.commissionBps);
      if (commissionBps === undefined) {
        this.errorCode.set('INVALID_REQUEST');
        return;
      }
      this.saving.set(true);
      try {
        const created = await firstValueFrom(
          this.admin.createVenue({
            name: m.name,
            beach: m.beach,
            region: m.region,
            description: m.description,
            bookingMode: m.bookingMode as BookingMode,
            commissionBps,
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
