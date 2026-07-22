import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { OwnedVenue, OwnedVenues } from '../core/owned-venues';
import { landingRouteFor } from '../shared/auth-landing';
import { CardGlass } from '../shared/card-glass';
import { RetryButton } from '../shared/retry-button';

/**
 * `/operator` — where a signed-in operator lands when the destination isn't already known (S9 #277).
 * It resolves the owned-venue count and then either forwards (0 → venue onboarding, 1 → straight
 * into that console) or renders the picker (2+). The decision table itself is
 * {@link landingRouteFor}, shared with the auth page so the two can't drift.
 *
 * A **failed** read renders a retry rather than forwarding: treating "couldn't load" as "owns
 * nothing" would push an established operator into venue onboarding on a network blip (R-12).
 *
 * Behind {@code operatorSessionGuard}, so this component never renders for a signed-out visitor and
 * needs no session state of its own. Porcelain like the rest of the operator surface.
 */
@Component({
  selector: 'app-operator-home',
  imports: [RouterLink, CardGlass, RetryButton],
  host: { 'data-riv-theme': 'porcelain' },
  template: `
    <section
      class="mx-auto flex min-h-[70vh] max-w-[520px] flex-col justify-center px-4 py-10"
      aria-labelledby="operator-home-title"
    >
      @if (failed()) {
        <div
          appCardGlass
          class="rounded-[20px] p-6 shadow-[0_12px_44px_rgba(12,42,51,0.14)]"
          data-testid="operator-home-error"
        >
          <h1 id="operator-home-title" class="m-0 text-[22px] font-semibold text-(--riv-card-ink)">
            We couldn’t load your venues
          </h1>
          <p class="mt-2 mb-4 text-[15px] text-(--riv-card-ink-soft)">
            Your session is fine — the venue list just didn’t load. Try again.
          </p>
          <app-retry-button testId="operator-home-retry" (retry)="load()" />
        </div>
      } @else if (venues().length > 1) {
        <div
          appCardGlass
          class="rounded-[20px] p-6 shadow-[0_12px_44px_rgba(12,42,51,0.14)]"
          data-testid="operator-home-picker"
        >
          <h1 id="operator-home-title" class="m-0 text-[22px] font-semibold text-(--riv-card-ink)">
            Choose a venue
          </h1>
          <p class="mt-2 mb-4 text-[15px] text-(--riv-card-ink-soft)">
            You manage {{ venues().length }} venues. Pick the one to open.
          </p>
          <ul class="m-0 flex list-none flex-col gap-2 p-0">
            @for (venue of venues(); track venue.id) {
              <li>
                <a
                  [routerLink]="['/operator', venue.id]"
                  class="flex flex-col gap-0.5 rounded-[14px] border border-(--riv-field-border) bg-(--riv-field-fill) px-4 py-3 no-underline transition-colors hover:bg-white motion-reduce:transition-none"
                >
                  <span class="text-[15px] font-semibold text-(--riv-card-ink)">{{
                    venue.name
                  }}</span>
                  <span class="text-[13px] text-(--riv-card-ink-faint)">{{ venue.beach }}</span>
                </a>
              </li>
            }
          </ul>
        </div>
      } @else {
        <output class="text-center text-[15px] text-(--riv-card-ink-soft)" data-testid="operator-home-loading"
          >Opening your console…</output
        >
      }
    </section>
  `,
})
export class OperatorHome implements OnInit {
  private readonly ownedVenues = inject(OwnedVenues);
  private readonly router = inject(Router);
  private readonly returnUrl =
    inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl') ?? undefined;

  protected readonly venues = signal<readonly OwnedVenue[]>([]);
  protected readonly failed = signal(false);

  // Not the constructor: an async call there is a testability/ordering smell (typescript:S7059).
  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.failed.set(false);
    const owned = await this.ownedVenues.load();
    if (owned.status === 'error') {
      this.failed.set(true);
      return;
    }
    this.venues.set(owned.venues);
    const route = landingRouteFor(owned.venues, this.returnUrl);
    // '/operator' IS this page — render the picker rather than navigating to ourselves.
    if (route !== '/operator') {
      await this.router.navigateByUrl(route);
    }
  }
}
