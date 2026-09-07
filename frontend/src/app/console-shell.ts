import {
  Component,
  DOCUMENT,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { AdminConsoleTabs } from './admin/admin-console-tabs';
import { OperatorAuth } from './core/operator-auth';
import { ConsoleVenueMap } from './operator/console-venue-map';
import { OperatorAccountChip } from './operator/operator-account-chip';
import { OperatorVenueSwitch } from './operator/operator-venue-switch';
import { PendingRequestsStore } from './operator/pending-requests-store';
import { todayBookingDate } from './shared/booking-date';
import { currentUrl } from './shared/current-url';
import {
  TAB_RAIL_MARKER,
  TAB_RAIL_MATCH,
  TabRail,
  TabRailDivider,
  TabRailTab,
} from './shared/tab-rail';
import { TouchTarget } from './shared/touch-target';

/**
 * Which console section a route belongs to, carried as `data.console` on the route
 * (`app.routes.ts`) and read by the app shell on its root→leaf walk: `venue` is the venue
 * console (`/operator/:venueId/*`), `admin` the admin console (`/admin/*`), `plain` an operator
 * page with no rail (the `/operator` landing, the password page). Any value makes the app shell
 * wear {@link ConsoleShell} instead of the tourist chrome and pin the subtree porcelain.
 */
export type ConsoleSection = 'venue' | 'admin' | 'plain';

/** The route data an operator or admin route carries (`app.routes.ts`). */
export interface ConsoleRouteData {
  readonly console: ConsoleSection;
}

/** A venue-console tab: its child-route path, its label, whether a group divider precedes it on
 *  the rail, and whether it carries the live Requests badge. */
interface ConsoleTab {
  readonly path: string;
  readonly label: string;
  readonly dividerBefore?: boolean;
  readonly badge?: boolean;
}

/** The six venue-console sections, Today first and grouped — what a running venue opens every
 *  day, then set-up, then money (the console-nav spike's grill, answer 7); only Requests carries
 *  the live badge. */
const VENUE_TABS: readonly ConsoleTab[] = [
  { path: 'daily', label: 'Daily view' },
  { path: 'requests', label: 'Requests', badge: true },
  { path: 'beach-map', label: 'Beach map', dividerBefore: true },
  { path: 'pricing', label: 'Pricing' },
  { path: 'venue', label: 'Venue & commodities' },
  { path: 'payouts', label: 'Payouts', dividerBefore: true },
];

/** A section slot on the row: the rail's marker one level up, the bar over the header's border. */
const SLOT = `flex items-center after:-bottom-px ${TAB_RAIL_MARKER}`;

/** Template skins, hoisted so each recipe exists once (the `app.ts` `cls` idiom). */
const CLS = {
  // The transition is the scroll-hide below sm; sticky at every width, the transform only below sm.
  header:
    'oc-header sticky top-0 z-20 border-b border-riv-header-border bg-riv-header-glass backdrop-blur-[22px] backdrop-saturate-[1.7] [transition:transform_0.2s_ease] motion-reduce:transition-none',
  // relative: the chip's popover anchors to it; min-h keeps the 44px controls' row at the spike's ~46px.
  row: 'oc-header-inner relative mx-auto flex min-h-[46px] max-w-[1120px] items-stretch justify-between gap-3 px-6 sm:gap-5',
  brand:
    'oc-wordmark inline-flex shrink-0 items-center text-[19px] leading-[1.15] font-bold tracking-[-0.01em] text-riv-ink no-underline',
  venueSlot: `min-w-0 ${SLOT}`,
  adminSlot: `shrink-0 px-0.5 text-[13.5px] font-semibold text-riv-ink-soft no-underline hover:text-riv-ink ${SLOT}`,
  signIn:
    'inline-flex items-center text-[13px] font-semibold text-riv-ink no-underline hover:underline',
  railBox: 'mx-auto w-full max-w-[1120px]',
  rail: 'oc-tabs px-6 pt-3.5 scroll-px-6',
  badge:
    'oc-badge inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-riv-solid-fill-brand px-1.5 text-[11.5px] font-bold leading-none text-white',
} as const;

/**
 * The one shell every operator and admin route wears, mounted by the app shell (`app.html`) in
 * place of the tourist header whenever the active route carries `data.console`
 * ({@link ConsoleSection}). Its **section row** — the only sticky chrome, about 46px — holds the
 * brand (to `/operator`), the venue switcher (`operator-venue-switch.ts`), which IS the
 * venue-console section and is current-marked on `/operator/:venueId/*`, `Admin` as a section
 * link for admins (current on `/admin/*`), and the account chip (`operator-account-chip.ts`) or,
 * signed out, the operator `Sign in` carrying the page as `returnUrl`. Under the row sits the
 * active section's rail: the venue console's six tabs with the live Requests badge, or the admin
 * console's tabs (`admin-console-tabs.ts`) — the latter only past the admin gate (restored, signed
 * in, admin), so a signed-out visitor on an admin URL is never told which admin surfaces exist.
 * Both rows draw the same marker one level apart (`shared/tab-rail.ts`'s
 * `TAB_RAIL_MARKER`), so section and tab read as one structure. The rail, and the page under it,
 * scroll with the page.
 *
 * <p>Everything it renders it reads from the router and root singletons, so the routed page
 * publishes nothing: the venue id comes off the route chain (the app shell's walk hands it over),
 * the venue name through the `ConsoleVenueMap` snapshot the console's stats strip shares (so the
 * header's read costs no extra request; a superseded venue's late read is discarded by the epoch
 * guard, invariant #13 — the row never names a venue the console is not on), the badge from
 * `PendingRequestsStore`, the gate from `OperatorAuth`. `Your venue` stands in while the name read
 * is pending or failed.
 *
 * <p><strong>Below `sm` the row slides away on scroll-down past 64px and returns on scroll-up</strong>
 * — a phone keeps its viewport for the page; the transform is the whole mechanism, so `motion-reduce:`
 * removes the transition and the row simply appears. The signal only changes at a direction flip,
 * so a scroll frame with no change re-renders nothing.
 *
 * <p><strong>Sign-out is the shell's teardown</strong> (the chip only emits it): focus is parked on
 * the app shell's `<main>` before the chip unmounts (WCAG 2.4.3), the session is signed out, the
 * two console stores that outlive the console are dropped so the next operator on this device
 * inherits neither, and the app leaves for the operator sign-in — the guarded operator routes would
 * bounce anyway. The `contents` host keeps the app shell's flex column as the sticky header's
 * containing block.
 */
@Component({
  selector: 'app-console-shell',
  imports: [
    AdminConsoleTabs,
    OperatorAccountChip,
    OperatorVenueSwitch,
    RouterLink,
    RouterLinkActive,
    TabRail,
    TabRailDivider,
    TabRailTab,
    TouchTarget,
  ],
  host: { class: 'contents', '(window:scroll)': 'onScroll()' },
  template: `
    <header
      [class]="cls.header"
      [class.max-sm:-translate-y-full]="hidden()"
      data-testid="oc-header"
    >
      <div [class]="cls.row">
        <div class="flex min-w-0 flex-1 items-stretch gap-3 sm:gap-5">
          <a appTouchTarget routerLink="/operator" [class]="cls.brand" data-testid="oc-brand"
            >Riviera</a
          >
          <nav class="flex min-w-0 items-stretch gap-3 sm:gap-5" aria-label="Sections">
            @if (operator.signedIn()) {
              <div
                [class]="cls.venueSlot"
                [attr.aria-current]="venueCurrent() ? 'page' : null"
                data-testid="oc-section-venue"
              >
                <app-operator-venue-switch
                  [venueId]="venueId()"
                  [venueName]="venueName()"
                  [section]="tabPath()"
                />
              </div>
            }
            @if (operator.isAdmin()) {
              <a
                appTouchTarget
                routerLink="/admin"
                [class]="cls.adminSlot"
                [attr.aria-current]="section() === 'admin' ? 'page' : null"
                data-testid="oc-section-admin"
                >Admin</a
              >
            }
          </nav>
        </div>
        <div class="flex shrink-0 items-center">
          @if (!operator.restoring()) {
            @if (operator.signedIn()) {
              <app-operator-account-chip testIdPrefix="oc" (signOut)="onSignOut()" />
            } @else {
              <a
                appTouchTarget
                [class]="cls.signIn"
                routerLink="/account/sign-in"
                [queryParams]="signInParams()"
                data-testid="oc-signin"
                >Sign in</a
              >
            }
          }
        </div>
      </div>
    </header>

    @if (section() === 'venue' && venueId() !== undefined) {
      <div [class]="cls.railBox">
        <nav
          appTabRail
          [class]="cls.rail"
          data-testid="oc-tabs"
          aria-label="Operator console sections"
        >
          @for (tab of tabs; track tab.path) {
            @if (tab.dividerBefore) {
              <span appTabRailDivider></span>
            }
            <a
              appTabRailTab
              appTouchTarget
              [routerLink]="['/operator', venueId(), tab.path]"
              routerLinkActive
              [routerLinkActiveOptions]="match"
              ariaCurrentWhenActive="page"
            >
              {{ tab.label }}
              @if (tab.badge && requestsCount() > 0) {
                <span [class]="cls.badge" data-testid="oc-requests-badge">{{
                  requestsCount()
                }}</span>
              }
            </a>
          }
        </nav>
      </div>
    } @else if (section() === 'admin' && adminGate()) {
      <div [class]="cls.railBox">
        <app-admin-console-tabs label="Admin console sections" />
      </div>
    }
  `,
})
export class ConsoleShell {
  /** The section the active route belongs to. */
  readonly section = input.required<ConsoleSection>();
  /** The venue the console is on — the `:venueId` off the route chain; `undefined` off the
   *  console, or when the segment is not a positive integer (the console's not-found page). */
  readonly venueId = input<number | undefined>(undefined);

  protected readonly operator = inject(OperatorAuth);
  private readonly requests = inject(PendingRequestsStore);
  private readonly venueMap = inject(ConsoleVenueMap);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly url = currentUrl(this.router);

  protected readonly cls = CLS;
  protected readonly tabs = VENUE_TABS;
  protected readonly match = TAB_RAIL_MATCH;
  protected readonly requestsCount = this.requests.count;
  /** The section row is translated away below `sm`. */
  protected readonly hidden = signal(false);
  /** The venue name from the shared snapshot; `undefined` while it loads or after a failed read. */
  protected readonly venueName = signal<string | undefined>(undefined);
  private lastY = 0;
  /** Bumped per venue: a late read from a superseded venue compares this and is dropped. */
  private epoch = 0;

  protected readonly venueCurrent = computed(
    () => this.section() === 'venue' && this.venueId() !== undefined,
  );
  /** Whether the admin rail may render: past the gate `admin-console.ts` also applies. */
  protected readonly adminGate = computed(
    () => !this.operator.restoring() && this.operator.signedIn() && this.operator.isAdmin(),
  );
  /** The open venue-console tab, for the switcher to keep across a switch; the console's index
   *  redirect (`beach-map`) before any child has settled, `undefined` off the console. */
  protected readonly tabPath = computed(() =>
    this.venueCurrent()
      ? (/^\/operator\/\d+\/([^/?#;]+)/.exec(this.url())?.[1] ?? 'beach-map')
      : undefined,
  );
  /** Sign-in carries the page as `returnUrl` — it outranks the venue-count landing rule. */
  protected readonly signInParams = computed(() => ({
    audience: 'operator',
    returnUrl: this.url(),
  }));

  constructor() {
    // Per session (the async /me restore resolves late) AND per venue.
    effect(() => {
      const id = this.venueCurrent() ? this.venueId() : undefined;
      const signedIn = this.operator.signedIn();
      untracked(() => this.loadName(signedIn ? id : undefined));
    });
  }

  protected onScroll(): void {
    const y = window.scrollY;
    this.hidden.set(y > this.lastY && y > 64);
    this.lastY = y;
  }

  /** Sign out, then leave for the operator sign-in — see the class doc. */
  protected async onSignOut(): Promise<void> {
    this.document.querySelector<HTMLElement>('main')?.focus();
    await this.operator.signOut();
    this.venueMap.reset();
    this.requests.reset();
    await this.router.navigate(['/account/sign-in'], { queryParams: { audience: 'operator' } });
  }

  /** Read the venue's name through the shared snapshot, best-effort; the previous name is dropped first. */
  private loadName(venueId: number | undefined): void {
    const epoch = ++this.epoch;
    this.venueName.set(undefined);
    if (venueId === undefined) {
      return;
    }
    this.venueMap.load(venueId, todayBookingDate(new Date())).subscribe({
      next: (venue) => {
        if (this.epoch === epoch) {
          this.venueName.set(venue.name);
        }
      },
      error: () => {
        // best-effort — the row keeps `Your venue`
      },
    });
  }
}
