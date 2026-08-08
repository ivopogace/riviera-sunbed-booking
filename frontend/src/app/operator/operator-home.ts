import {
  afterNextRender,
  Component,
  computed,
  DOCUMENT,
  inject,
  Injector,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { skip } from 'rxjs';

import { OwnedVenue, OwnedVenues } from '../core/owned-venues';
import { landingRouteFor, safeReturnUrl } from '../shared/auth-landing';
import { CardGlass } from '../shared/card-glass';
import { RetryButton } from '../shared/retry-button';
import { VenueCreateCard } from './venue-create-card';

/**
 * `/operator` — where a signed-in operator lands when the destination isn't already known.
 * It resolves the owned-venue count and then forwards (1 → straight into that console), renders the
 * picker (2+), or renders the create-venue card inline: the **zero state** for an operator
 * with no venue yet, and the deliberate **`?create=1`** state ("Add another venue", reachable from
 * the picker and both operator headers) for one who already owns some. The decision table itself is
 * {@link landingRouteFor}, shared with the auth page so the two can't drift; the create param is
 * read reactively because the router reuses this instance when only the query string changes
 * (picker → create and back).
 *
 * A **failed** read renders a retry rather than the zero state: treating "couldn't load" as "owns
 * nothing" would push an established operator into venue creation on a network blip.
 *
 * Behind {@code operatorSessionGuard}, so this component never renders for a signed-out visitor and
 * needs no session state of its own. Porcelain like the rest of the operator surface.
 */
@Component({
  selector: 'app-operator-home',
  imports: [RouterLink, CardGlass, RetryButton, VenueCreateCard],
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
      } @else if (creating()) {
        <h1
          id="operator-home-title"
          tabindex="-1"
          class="m-0 mb-1 text-[22px] font-semibold text-(--riv-ink) outline-none"
        >
          {{ zeroState() ? 'Create your venue' : 'Add another venue' }}
        </h1>
        <p class="mt-0 mb-4 text-[15px] text-(--riv-ink-soft)">
          {{
            zeroState()
              ? 'Welcome to Riviera — set up your venue to start taking bookings.'
              : 'It will appear beside your other venues once created.'
          }}
        </p>
        <app-venue-create-card />
      } @else if (venues().length > 1) {
        <div
          appCardGlass
          class="rounded-[20px] p-6 shadow-[0_12px_44px_rgba(12,42,51,0.14)]"
          data-testid="operator-home-picker"
        >
          <h1
            id="operator-home-title"
            tabindex="-1"
            class="m-0 text-[22px] font-semibold text-(--riv-card-ink) outline-none"
          >
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
          <a
            routerLink="/operator"
            [queryParams]="{ create: '1' }"
            class="mt-3 inline-block text-[13.5px] font-semibold text-(--riv-card-ink) underline"
            data-testid="operator-home-add-venue"
            >Add another venue</a
          >
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
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly venues = signal<readonly OwnedVenue[]>([]);
  protected readonly failed = signal(false);
  private readonly loaded = signal(false);

  /** The deliberate "Add another venue" entry — reactive: the router reuses this instance. */
  protected readonly creating = computed(
    () => this.query().get('create') === '1' || (this.loaded() && this.venues().length === 0),
  );
  protected readonly zeroState = computed(() => this.loaded() && this.venues().length === 0);

  constructor() {
    // Param-only navs (picker ⇄ create) re-decide AND re-anchor focus on the swapped-in title (WCAG 2.4.3).
    this.route.queryParamMap.pipe(skip(1), takeUntilDestroyed()).subscribe(() => {
      void this.decide();
      afterNextRender(
        {
          earlyRead: () => this.document.getElementById('operator-home-title'),
          write: (title) => title?.focus(),
        },
        { injector: this.injector },
      );
    });
  }

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
    this.loaded.set(true);
    await this.decide();
  }

  /** Forward per {@link landingRouteFor} — unless the create state or this page itself is the answer. */
  private async decide(): Promise<void> {
    if (!this.loaded()) {
      return;
    }
    const returnUrl = this.query().get('returnUrl') ?? undefined;
    // A safe returnUrl outranks even the create state — the landingRouteFor contract.
    if (this.creating() && safeReturnUrl(returnUrl) === undefined) {
      return;
    }
    const route = landingRouteFor(this.venues(), returnUrl);
    // '/operator' IS this page — render the picker rather than navigating to ourselves.
    if (route !== '/operator') {
      await this.router.navigateByUrl(route);
    }
  }
}
