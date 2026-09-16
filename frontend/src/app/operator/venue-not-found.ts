import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * The one surface that answers a bad operator-console link, at `/operator/venue-not-found`.
 *
 * <p>`core/venue-id.guard.ts` redirects every malformed `/operator/:venueId` here. The card is the
 * console shell's retired invalid-venue arm verbatim — same utilities, same test ids, so the
 * surface did not change, only where it lives — and it offers BOTH destinations the shell's copy
 * and the tabs' copy disagreed about before #1127 (ADR-0023).
 */
@Component({
  selector: 'app-venue-not-found',
  imports: [RouterLink],
  template: `
    <section class="oc-signin mx-auto w-full max-w-[440px] px-6 py-[72px]">
      <div
        class="oc-signin-card flex flex-col gap-3.5 rounded-[22px] border border-riv-console-card-border bg-riv-console-inset px-[26px] py-7 shadow-[0_20px_50px_rgba(7,42,58,0.14)]"
        data-testid="oc-invalid-venue-card"
      >
        <h1
          class="oc-signin-title text-[24px] font-bold tracking-[-0.02em] text-riv-ink"
          data-testid="oc-invalid-venue"
        >
          Venue not found
        </h1>
        <p class="oc-signin-intro mb-1 text-[14px] leading-[1.55] text-riv-ink-soft">
          This operator console link isn’t valid. Open a venue from
          <a
            class="oc-venue-list inline-flex min-h-11 items-center text-[13px] font-semibold text-riv-ink no-underline hover:underline"
            routerLink="/operator"
            data-testid="oc-venue-list"
            >your venue list</a
          >, or
          <a
            class="oc-create-venue inline-flex min-h-11 items-center text-[13px] font-semibold text-riv-ink no-underline hover:underline"
            routerLink="/operator"
            [queryParams]="{ create: '1' }"
            data-testid="oc-invalid-create-venue"
            >create a venue</a
          >.
        </p>
      </div>
    </section>
  `,
})
export class VenueNotFound {}
