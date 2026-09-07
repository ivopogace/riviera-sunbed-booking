import { NgComponentOutlet } from '@angular/common';
import {
  Component,
  DOCUMENT,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';

import { ADMIN_CONSOLE_TABS, AdminConsoleTabs } from './admin/admin-console-tabs';
import { OperatorAuth } from './core/operator-auth';
import { OwnedVenues } from './core/owned-venues';
import { ConsoleVenueMap } from './operator/console-venue-map';
import { OperatorAccountChip } from './operator/operator-account-chip';
import { OperatorVenueSwitch } from './operator/operator-venue-switch';
import { PendingRequestsStore } from './operator/pending-requests-store';
import { todayBookingDate } from './shared/booking-date';
import { ConsoleDestination } from './shared/console-destination';
import {
  AdminGlyph,
  BeachMapGlyph,
  DailyGlyph,
  MoreGlyph,
  PayoutsGlyph,
  PricingGlyph,
  PrivacyGlyph,
  RequestsGlyph,
  SearchGlyph,
  VenueGlyph,
  VenuesGlyph,
} from './shared/console-glyphs';
import { ConsolePalette, PaletteRow } from './shared/console-palette';
import { currentUrl } from './shared/current-url';
import { focusMover } from './shared/focus-after-render';
import { POP_BACKDROP, POP_NAV_HINT, POP_NAV_ROW, POP_SKIN } from './shared/popover-skin';
import {
  TAB_RAIL_BADGE,
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

/** The six venue-console sections, Today first and grouped — what a running venue opens every
 *  day, then set-up, then money (the console-nav spike's grill, answer 7); only Requests carries
 *  the live badge. The child path under `/operator/:venueId`. */
const VENUE_TABS: readonly ConsoleDestination[] = [
  {
    path: 'daily',
    label: 'Daily view',
    short: 'Daily',
    glyph: DailyGlyph,
    hint: 'Arrivals, walk-ins, sales close',
    group: 'Today',
  },
  {
    path: 'requests',
    label: 'Requests',
    glyph: RequestsGlyph,
    hint: 'Accept or decline booking requests',
    group: 'Today',
    badge: true,
  },
  {
    path: 'beach-map',
    label: 'Beach map',
    glyph: BeachMapGlyph,
    hint: 'Lay out sets, pools and aisles',
    group: 'Set-up',
  },
  {
    path: 'pricing',
    label: 'Pricing',
    glyph: PricingGlyph,
    hint: 'Per-row prices',
    group: 'Set-up',
  },
  {
    path: 'venue',
    label: 'Venue & commodities',
    short: 'Venue',
    glyph: VenueGlyph,
    hint: 'Details, amenities, photos',
    group: 'Set-up',
  },
  {
    path: 'payouts',
    label: 'Payouts',
    glyph: PayoutsGlyph,
    hint: 'Ledger and statements',
    group: 'Money',
  },
];

/** How many destinations the phone rail shows as slots; the rest go under More (grill answer 13:
 *  three plus More is what fits a 344px cover screen). */
const PHONE_PRIMARIES = 3;

/** The cross-console row's hint, in the More sheet and the palette alike. */
const ADMIN_CONSOLE_HINT = 'Operators, outboxes, moderation, records';

/** The account page every console route can jump to. */
const PASSWORD_PATH = '/account/operator-password';

/** A destination resolved for the active console: its router link and whether it is the page. */
interface PhoneItem extends ConsoleDestination {
  readonly link: readonly (string | number)[];
  readonly current: boolean;
}

/** A group of secondaries under one heading in the More sheet. */
interface PhoneGroup {
  readonly name: string;
  readonly items: readonly PhoneItem[];
}

/** What the phone rail renders for the active console. */
interface PhoneNav {
  readonly label: string;
  readonly primaries: readonly PhoneItem[];
  /** The More sheet's groups: the secondaries by group, then the cross-console row's group. */
  readonly groups: readonly PhoneGroup[];
  /** The current destination when it sits under More — the slot then wears its glyph and label. */
  readonly moreCurrent: PhoneItem | undefined;
}

/** A section slot on the row: the rail's marker one level up, the bar over the header's border. */
const SLOT = `flex items-center after:-bottom-px ${TAB_RAIL_MARKER}`;

/** Template skins, hoisted so each recipe exists once (the `app.ts` `cls` idiom). */
const CLS = {
  // The transition is the scroll-hide below sm; sticky at every width, the translate only below sm (v4's translate utilities set `translate`, not `transform`).
  header:
    'oc-header sticky top-0 z-20 border-b border-riv-header-border bg-riv-header-glass backdrop-blur-[22px] backdrop-saturate-[1.7] [transition:translate_0.2s_ease] motion-reduce:transition-none',
  // min-h keeps the 44px controls' row at the spike's ~46px; the popovers anchor to the chip's own host and to the header.
  row: 'oc-header-inner mx-auto flex min-h-[46px] max-w-[1120px] items-stretch justify-between gap-3 px-6 sm:gap-5',
  brand:
    'oc-wordmark inline-flex shrink-0 items-center text-[19px] leading-[1.15] font-bold tracking-[-0.01em] text-riv-ink no-underline',
  venueSlot: `min-w-0 ${SLOT}`,
  // Below sm the phone's route between consoles is the More sheet's row; the spike measured the row overflowing at 390px and 344px with this link in.
  adminSlot: `shrink-0 px-0.5 text-[13.5px] font-semibold text-riv-ink-soft no-underline hover:text-riv-ink max-sm:hidden ${SLOT}`,
  signIn:
    'inline-flex items-center text-[13px] font-semibold text-riv-ink no-underline hover:underline',
  // The palette's trigger, from sm up: the lens plus a keycap; below sm the row has no room and a phone no ⌘.
  search:
    'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-1.5 text-riv-ink-soft hover:text-riv-ink max-sm:hidden [&_svg]:size-[18px]',
  keycap:
    'rounded-md border border-riv-chip-border bg-riv-chip-bg px-1.5 py-0.5 font-[inherit] text-[11px] font-semibold leading-none',
  railBox: 'mx-auto w-full max-w-[1120px] max-sm:hidden',
  rail: 'oc-tabs px-6 pt-3.5 scroll-px-6',
  badge: TAB_RAIL_BADGE,
  // Four equal slots on the header's glass; the marker sits on its bottom border, as on the row.
  phoneRail:
    'grid grid-cols-4 border-b border-riv-header-border bg-riv-header-glass px-1 sm:hidden',
  // A glyph over an 11px label; `flex`, so the 44px floor is live on the links; the marker is the rail's.
  phoneSlot: `min-h-[58px] cursor-pointer flex-col justify-center gap-1 px-1 text-center text-[11px] leading-tight font-semibold text-riv-ink-soft no-underline after:-bottom-px [&_svg]:size-[21px] ${SLOT}`,
  phoneBadge: 'absolute top-1.5 right-[calc(50%-26px)]',
  sheetBackdrop: `${POP_BACKDROP} sm:hidden`,
  // Above the home indicator; capped to the viewport so nine admin rows still scroll inside the sheet on a short phone.
  sheet: `fixed inset-x-2.5 bottom-[calc(12px+env(safe-area-inset-bottom))] max-h-[calc(100dvh-24px)] overflow-y-auto p-2.5 sm:hidden ${POP_SKIN}`,
  groupLabel:
    'mt-3 mb-1 px-3.5 text-[10.5px] font-bold tracking-[0.16em] text-riv-pop-ink-soft uppercase first:mt-0',
  sheetRow: POP_NAV_ROW,
  hint: POP_NAV_HINT,
} as const;

/**
 * The one shell every operator and admin route wears, mounted by the app shell (`app.html`) in
 * place of the tourist header whenever the active route carries `data.console`
 * ({@link ConsoleSection}). Its **section row** — the only sticky chrome, about 46px — holds the
 * brand (to `/operator`), the venue switcher (`operator-venue-switch.ts`), which IS the
 * venue-console section and is current-marked on `/operator/:venueId/*`, `Admin` as a section
 * link for admins (current on `/admin/*`; from `sm` up only — below it the More sheet's
 * `Admin console` row is the phone's route between consoles), and the account chip
 * (`operator-account-chip.ts`) or, signed out, the operator `Sign in` carrying the page as
 * `returnUrl`, and — from `sm` up, for anyone the palette renders for — the search glyph that opens
 * the ⌘K palette (`shared/console-palette.ts`), the accelerator over everything the row and rail
 * offer: this console's sections, the owned venues on the open tab, the other console, the account
 * page. The shell computes those rows ({@link ConsoleShell#paletteRows}) and mounts the palette once,
 * under the same gate as the rails, as a sibling of the header — never inside it, whose
 * `backdrop-filter` would pin the `fixed` dialog to the row. Under the row sits the active section's rail: the venue console's six tabs with the
 * live Requests badge, or the admin console's tabs (`admin-console-tabs.ts`) — the latter only past
 * the admin gate (restored, signed in, admin), so a signed-out visitor on an admin URL is never
 * told which admin surfaces exist. Both rows draw the same marker one level apart
 * (`shared/tab-rail.ts`'s `TAB_RAIL_MARKER`), so section and tab read as one structure. The rail,
 * and the page under it, scroll with the page.
 *
 * <p><strong>Below `sm` the text rail gives way to the phone rail</strong> — CSS decides, both are
 * in the DOM: four equal slots of glyph over label, the first three destinations of the console's
 * table (Daily · Requests · Beach map, Operators · Email · Refunds) and a **More** button. Whenever
 * the current page is one of the secondaries, that slot wears the page's glyph, label and
 * `aria-current="page"` — the current page is never hidden inside a closed menu, which is what
 * answered the objection to an overflow menu — and otherwise reads `More`. It opens a bottom
 * sheet of the secondaries grouped as the desktop rail's dividers group them, plus the
 * cross-console row. The button's accessible name therefore follows the route. Escape, the
 * backdrop and a chosen row close the sheet onto the More button; a navigation that ends with it
 * open (Back, Forward) closes it too, and if a row held focus, focus lands on the More button once
 * the new page has rendered — or on the app shell's `<main>` when the destination has no phone rail.
 *
 * <p>Everything it renders it reads from the router and root singletons, so the routed page
 * publishes nothing: the venue id comes off the route chain (the app shell's walk hands it over),
 * the venue name through the `ConsoleVenueMap` snapshot the console's stats strip shares (so the
 * header's read costs no extra request; a superseded venue's late read is discarded by the epoch
 * guard — every console action is venue-scoped, so the row never names a venue the console is not
 * on), the badge from
 * `PendingRequestsStore`, the gate from `OperatorAuth`. `Your venue` stands in while the name read
 * is pending or failed.
 *
 * <p><strong>Below `sm` the row slides away on scroll-down past 64px and returns on scroll-up</strong>
 * — a phone keeps its viewport for the page; the `translate` is the whole mechanism, so `motion-reduce:`
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
    ConsolePalette,
    NgComponentOutlet,
    OperatorAccountChip,
    OperatorVenueSwitch,
    RouterLink,
    RouterLinkActive,
    SearchGlyph,
    TabRail,
    TabRailDivider,
    TabRailTab,
    TouchTarget,
  ],
  host: {
    class: 'contents',
    '(window:scroll)': 'onScroll()',
    '(document:keydown.escape)': 'dismissSheet()',
  },
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
        <div class="flex shrink-0 items-center gap-1 sm:gap-2">
          @if (paletteGate()) {
            <button
              appTouchTarget
              #searchButton
              type="button"
              [class]="cls.search"
              aria-label="Jump to a section or venue (⌘K)"
              [attr.aria-expanded]="palette()?.open() ?? false"
              data-testid="oc-search"
              (click)="palette()?.toggle(searchButton)"
            >
              <app-search-glyph />
              <kbd [class]="cls.keycap" aria-hidden="true">⌘K</kbd>
            </button>
          }
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

    @if (venueCurrent()) {
      <div [class]="cls.railBox">
        <nav
          appTabRail
          [class]="cls.rail"
          data-testid="oc-tabs"
          aria-label="Operator console sections"
        >
          @for (tab of tabs; track tab.path; let index = $index) {
            @if (index > 0 && tab.group !== tabs[index - 1].group) {
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

    @if (phoneNav(); as nav) {
      <nav [class]="cls.phoneRail" [attr.aria-label]="nav.label" data-testid="oc-phone-rail">
        @for (item of nav.primaries; track item.path) {
          <a
            appTouchTarget
            [routerLink]="item.link"
            routerLinkActive
            [routerLinkActiveOptions]="match"
            ariaCurrentWhenActive="page"
            [class]="cls.phoneSlot"
          >
            <ng-container *ngComponentOutlet="item.glyph" />
            <span>{{ item.short ?? item.label }}</span>
            @if (item.badge && requestsCount() > 0) {
              <span
                [class]="cls.badge + ' ' + cls.phoneBadge"
                data-testid="oc-phone-requests-badge"
                >{{ requestsCount() }}</span
              >
            }
          </a>
        }
        <button
          appTouchTarget
          #more
          type="button"
          [class]="cls.phoneSlot"
          [attr.aria-current]="nav.moreCurrent ? 'page' : null"
          [attr.aria-expanded]="sheetOpen()"
          data-testid="oc-more"
          (click)="toggleSheet()"
        >
          <ng-container *ngComponentOutlet="nav.moreCurrent?.glyph ?? moreGlyph" />
          <span>{{
            nav.moreCurrent ? (nav.moreCurrent.short ?? nav.moreCurrent.label) : 'More'
          }}</span>
        </button>
      </nav>
      @if (sheetOpen()) {
        <div
          [class]="cls.sheetBackdrop"
          data-testid="oc-more-backdrop"
          (click)="dismissSheet()"
          aria-hidden="true"
        ></div>
        <nav [class]="cls.sheet" aria-label="More (phone)" data-testid="oc-more-sheet">
          @for (group of nav.groups; track group.name) {
            <p [class]="cls.groupLabel">{{ group.name }}</p>
            @for (item of group.items; track item.path) {
              <a
                appTouchTarget
                [routerLink]="item.link"
                routerLinkActive
                [routerLinkActiveOptions]="match"
                ariaCurrentWhenActive="page"
                [class]="cls.sheetRow"
                data-testid="oc-more-row"
                (click)="activateRow()"
              >
                <ng-container *ngComponentOutlet="item.glyph" />
                <span class="flex min-w-0 flex-1 flex-col leading-tight">
                  <span>{{ item.label }}</span>
                  <span [class]="cls.hint">{{ item.hint }}</span>
                </span>
              </a>
            }
          }
        </nav>
      }
    }

    @if (paletteGate()) {
      <app-console-palette [rows]="paletteRows()" />
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
  private readonly owned = inject(OwnedVenues);
  private readonly venueMap = inject(ConsoleVenueMap);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly url = currentUrl(this.router);
  private readonly moreButton = viewChild<ElementRef<HTMLButtonElement>>('more');
  protected readonly palette = viewChild(ConsolePalette);
  private readonly focusAfterRender = focusMover();

  protected readonly cls = CLS;
  protected readonly tabs = VENUE_TABS;
  protected readonly match = TAB_RAIL_MATCH;
  protected readonly moreGlyph = MoreGlyph;
  protected readonly requestsCount = this.requests.count;
  /** The section row is translated away below `sm`. */
  protected readonly hidden = signal(false);
  /** The venue name from the shared snapshot; `undefined` while it loads or after a failed read. */
  protected readonly venueName = signal<string | undefined>(undefined);
  /** The More sheet is open. */
  protected readonly sheetOpen = signal(false);
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
  /** The URL's path alone — what an admin destination is matched against. */
  private readonly urlPath = computed(() => this.url().split(/[?#;]/)[0]);
  /** Sign-in carries the page as `returnUrl` — it outranks the venue-count landing rule. */
  protected readonly signInParams = computed(() => ({
    audience: 'operator',
    returnUrl: this.url(),
  }));

  /** The phone rail for the active console, or `undefined` where no rail renders. */
  protected readonly phoneNav = computed((): PhoneNav | undefined => {
    if (this.venueCurrent()) {
      const id = this.venueId();
      const tab = this.tabPath();
      return this.phoneNavOf(
        'Operator console sections (phone)',
        VENUE_TABS.map((t) => ({
          ...t,
          link: ['/operator', id!, t.path],
          current: t.path === tab,
        })),
        this.operator.isAdmin()
          ? {
              name: 'Platform',
              items: [
                {
                  path: '/admin',
                  label: 'Admin console',
                  glyph: AdminGlyph,
                  hint: ADMIN_CONSOLE_HINT,
                  group: 'Platform',
                  link: ['/admin'],
                  current: false,
                },
              ],
            }
          : undefined,
      );
    }
    if (this.section() === 'admin' && this.adminGate()) {
      const path = this.urlPath();
      return this.phoneNavOf(
        'Admin console sections (phone)',
        ADMIN_CONSOLE_TABS.map((t) => ({ ...t, link: [t.path], current: t.path === path })),
        {
          name: 'Operator',
          items: [
            {
              path: '/operator',
              label: 'Your venues',
              glyph: VenuesGlyph,
              hint: 'Back to the venue console',
              group: 'Operator',
              link: ['/operator'],
              current: false,
            },
          ],
        },
      );
    }
    return undefined;
  });

  /** Whether the palette and its trigger render: signed in, restored, and past the admin gate on admin. */
  protected readonly paletteGate = computed(
    () =>
      !this.operator.restoring() &&
      this.operator.signedIn() &&
      (this.section() !== 'admin' || this.operator.isAdmin()),
  );

  /** Everything the palette can jump to from here, in its listed order: this console's sections
   *  (the current one marked, Requests with its count), the owned venues on the open tab (the
   *  console's landing tab off it), the other console for an admin, the account page. */
  protected readonly paletteRows = computed((): PaletteRow[] => {
    const keep = this.tabPath() ?? 'beach-map';
    const rows: PaletteRow[] = [
      ...this.paletteSections(),
      ...(this.owned.venues() ?? []).map((venue): PaletteRow => ({
        key: `v:${venue.id}`,
        glyph: VenuesGlyph,
        label: venue.name,
        hint: `Open ${venue.beach}`,
        group: 'Venue',
        link: ['/operator', venue.id, keep],
        current: this.venueCurrent() && venue.id === this.venueId(),
      })),
    ];
    if (this.section() !== 'admin' && this.operator.isAdmin()) {
      rows.push({
        key: 'x:admin',
        glyph: AdminGlyph,
        label: 'Admin console',
        hint: ADMIN_CONSOLE_HINT,
        group: 'Platform',
        link: ['/admin'],
        current: false,
      });
    }
    rows.push({
      key: 'x:password',
      glyph: PrivacyGlyph,
      label: 'Change password',
      hint: 'Your operator account',
      group: 'Account',
      link: [PASSWORD_PATH],
      current: this.urlPath() === PASSWORD_PATH,
    });
    return rows;
  });

  /** The active console's sections as palette rows; none on a plain page. */
  private readonly paletteSections = computed((): PaletteRow[] => {
    const count = this.requestsCount();
    if (this.venueCurrent()) {
      const id = this.venueId();
      const tab = this.tabPath();
      return VENUE_TABS.map((t) => ({
        key: `s:${t.path}`,
        glyph: t.glyph,
        label: t.label,
        hint: t.hint,
        group: t.group,
        link: ['/operator', id!, t.path],
        current: t.path === tab,
        badge: t.badge && count > 0 ? count : undefined,
      }));
    }
    if (this.section() === 'admin' && this.adminGate()) {
      const path = this.urlPath();
      return ADMIN_CONSOLE_TABS.map((t) => ({
        key: `s:${t.path}`,
        glyph: t.glyph,
        label: t.label,
        hint: t.hint,
        group: t.group,
        link: [t.path],
        current: t.path === path,
      }));
    }
    return [];
  });

  constructor() {
    // Per session (the async /me restore resolves late) AND per venue.
    effect(() => {
      const id = this.venueCurrent() ? this.venueId() : undefined;
      const signedIn = this.operator.signedIn();
      untracked(() => this.loadName(signedIn ? id : undefined));
    });
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.closeSheetOnNavigation());
  }

  protected onScroll(): void {
    const y = window.scrollY;
    this.hidden.set(y > this.lastY && y > 64);
    this.lastY = y;
  }

  /** Open the sheet onto its first row, or close it back onto the More button. */
  protected toggleSheet(): void {
    this.sheetOpen.update((open) => !open);
    if (this.sheetOpen()) {
      this.focusAfterRender('oc-more-row', 'oc-more');
    } else {
      this.moreButton()?.nativeElement.focus();
    }
  }

  /** A navigation ended with the sheet open — Back, Forward, or a row's own link. The sheet closes;
   *  if one of its rows held focus, focus lands on the More button once the new page has rendered,
   *  or on the app shell's `<main>` when the destination has no phone rail (WCAG 2.4.3). */
  private closeSheetOnNavigation(): void {
    if (!this.sheetOpen()) {
      return;
    }
    const held = this.document.activeElement?.closest('[data-testid="oc-more-sheet"]') !== null;
    this.sheetOpen.set(false);
    if (held) {
      afterNextRender(
        () =>
          (
            this.moreButton()?.nativeElement ?? this.document.querySelector<HTMLElement>('main')
          )?.focus(),
        { injector: this.injector },
      );
    }
  }

  /** A row was chosen: close, and hand focus back to the More button the row's unmount would strand it from. */
  protected activateRow(): void {
    this.sheetOpen.set(false);
    this.moreButton()?.nativeElement.focus();
  }

  /** Escape or the backdrop: the same close, a no-op while closed so it never steals focus. */
  protected dismissSheet(): void {
    if (this.sheetOpen()) {
      this.activateRow();
    }
  }

  /** Sign out, then leave for the operator sign-in — see the class doc. */
  protected async onSignOut(): Promise<void> {
    this.document.querySelector<HTMLElement>('main')?.focus();
    await this.operator.signOut();
    this.venueMap.reset();
    this.requests.reset();
    await this.router.navigate(['/account/sign-in'], { queryParams: { audience: 'operator' } });
  }

  /** Split a console's destinations into the rail's slots and the sheet's groups, the
   *  cross-console row's group at the foot. */
  private phoneNavOf(
    label: string,
    items: readonly PhoneItem[],
    crossConsole: PhoneGroup | undefined,
  ): PhoneNav {
    const primaries = items.slice(0, PHONE_PRIMARIES);
    const groups: PhoneGroup[] = [];
    for (const item of items.slice(PHONE_PRIMARIES)) {
      const last = groups.at(-1);
      if (last?.name === item.group) {
        groups[groups.length - 1] = { name: last.name, items: [...last.items, item] };
      } else {
        groups.push({ name: item.group, items: [item] });
      }
    }
    if (crossConsole) {
      groups.push(crossConsole);
    }
    return {
      label,
      primaries,
      groups,
      moreCurrent: items.slice(PHONE_PRIMARIES).find((item) => item.current),
    };
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
