import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { LegalFooter } from './shared/legal-footer';
import { LegalMenuRows } from './shared/legal-menu-rows';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
  isActive,
} from '@angular/router';
import { filter } from 'rxjs';

import { FindBooking } from './booking/find-booking';
import { ConsoleSection, ConsoleShell } from './console-shell';
import { ThemeMenuRows } from './theme-menu-rows';
import { CustomerAuth } from './core/customer-auth';
import { SignOutNotice } from './core/sign-out-notice';
import { ConsoleTheme } from './core/console-theme';
import { focusMover } from './shared/focus-after-render';
import { idParam } from './shared/parent-venue-id';
import {
  AVATAR,
  CHIP,
  EXACT_PATH,
  MOBILE_ITEM,
  POP_BACKDROP,
  POP_BUTTON,
  POP_ITEM,
  POP_SKIN,
  handleOf,
  initialOf,
} from './shared/popover-skin';
import { EDGE_SLOT_RING } from './shared/tab-rail';
import { TouchTarget } from './shared/touch-target';

const POP = `absolute ${POP_SKIN}`;

/** The shell root, with and without clearance for the phone tab bar (61px + home-indicator inset).
 *  Two literals, not a concatenation: Tailwind generates only classes it can read in the source.
 *  `text-riv-ink` re-resolves ink under the console theme pin; ink inherited from `body` would not. */
const SHELL = 'relative flex min-h-screen flex-col text-riv-ink';
const SHELL_WITH_TAB_BAR = `${SHELL} max-sm:pb-[calc(61px+env(safe-area-inset-bottom))]`;

/**
 * A bottom tab; current = a full-ink SHAPE cue (top bar + icon-pill ring), as no token tint clears
 * WCAG 1.4.11's 3:1 on the bar. `flex` keeps `appTouchTarget`'s floor live; the ring is inset for the
 * edge-to-edge bar; `touch-manipulation` stops a fast second tap zooming, keeping pinch-zoom.
 */
const TAB = `group relative flex h-[60px] cursor-pointer touch-manipulation flex-col items-center justify-center gap-[3px] text-[11px] font-semibold text-riv-ink-soft before:absolute before:top-0 before:h-[3px] before:w-9 before:rounded-b-full before:bg-current before:opacity-0 before:content-[''] aria-[current=page]:text-riv-ink aria-[current=page]:before:opacity-100 ${EDGE_SLOT_RING}`;

/** Template skins, hoisted so each recipe exists once (the booking-view.ts `cls` idiom). */
const CLS = {
  backdrop: POP_BACKDROP,
  accountPop: `riv-account-pop top-[calc(100%+10px)] right-0 w-[236px] p-[7px] ${POP}`,
  // Above the bar, clearing the same inset the bar pads by; a 34px home indicator otherwise puts the last row under the bar.
  mobileMenu: `fixed inset-x-2.5 bottom-[calc(76px+env(safe-area-inset-bottom))] p-2 ${POP_SKIN}`,
  // Its own near-opaque token, not a second coat of the header glass: page prose stops bleeding through. z-20 like the header, rendered BEFORE it so the header's popover backdrops cover the bar.
  tabBar:
    'riv-tab-bar fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-riv-header-border bg-riv-tabbar-glass pb-[env(safe-area-inset-bottom)] backdrop-blur-[22px] backdrop-saturate-[1.7] sm:hidden',
  tab: TAB,
  tabIcon:
    'grid h-7 w-12 place-items-center rounded-full group-aria-[current=page]:ring-[1.5px] group-aria-[current=page]:ring-current [&_svg]:size-[21px]',
  popItem: POP_ITEM,
  popBtn: POP_BUTTON,
  mobileItem: MOBILE_ITEM,
  mobileBtn: `${MOBILE_ITEM} cursor-pointer`,
  // The current page carries full ink and an underline in that ink (an accent token would vanish on riviera's dark header glass): hover alone is invisible on a tablet.
  // inline-flex: appTouchTarget's min-height is a no-op on an inline <a>.
  navLink:
    'inline-flex cursor-pointer items-center hover:text-riv-ink aria-[current=page]:font-semibold aria-[current=page]:text-riv-ink aria-[current=page]:underline aria-[current=page]:decoration-2 aria-[current=page]:decoration-current aria-[current=page]:underline-offset-[7px]',
  // Every header disclosure trigger drops the double-tap — one is toggled open and shut in quick succession. Composed here, never on the shared CHIP.
  accountChip: `inline-flex touch-manipulation items-center gap-2 py-1 pr-3 pl-1.5 font-semibold text-riv-ink ${CHIP}`,
  menuBtn: `inline-flex h-11 w-11 touch-manipulation flex-col items-center justify-center gap-[4.5px] ${CHIP}`,
  menuBar: 'block h-0.5 w-[17px] rounded-[2px] bg-riv-ink',
  avatar: AVATAR,
} as const;

/** The phone tab bar's three sections: the bar lights the tab whose section the active route
 *  carries, not the tab whose path it matches (`/venues/3` is a Beaches page, `/booking/CODE` a
 *  bookings page). `account` lights only while signed in. */
export type TouristSection = 'beaches' | 'bookings' | 'account';

/**
 * Route data for the shell's phone chrome (`app.routes.ts`), read off the root→leaf chain:
 * `section` puts the route under a bottom tab; `tabBar: false` hides the bar; `footer: false` drops
 * the footer on an edge-to-edge route — which then must keep the tab bar, whose menu sheet is its
 * only phone reach to Privacy/Terms. `wide: true` (opt-in: any route on the chain) lifts the 1080px
 * cap via bare `data-wide:`, compiling to `&[data-wide]` — bind the attribute on the SAME element
 * as the utility; the ancestor form `in-data-wide:` only ties on specificity.
 */
export interface TouristRouteData {
  section?: TouristSection;
  tabBar?: false;
  footer?: false;
  wide?: true;
}

/** The active route's chrome flags — see {@link App.routeChrome}. */
interface RouteChrome {
  /** The leaf-most `data.console` on the chain, or `null` on a route outside the console shell. */
  console: ConsoleSection | null;
  /** The leaf-most `:venueId` on the chain that is a positive integer, for the console shell. */
  venueId: number | undefined;
  /** The leaf-most `data.section` on the chain, or `null` on a route outside every section. */
  section: TouristSection | null;
  /** `false` when any route on the chain carries `data.tabBar: false`. */
  tabBar: boolean;
  /** `false` when any route on the chain carries `data.footer: false`. */
  footer: boolean;
  /** `true` when any route on the chain carries `data.wide: true`. */
  wide: boolean;
}

/** The chrome before the first navigation completes: the tourist header, footer and tab bar,
 *  with no tab lit. */
const PRE_NAVIGATION_CHROME: RouteChrome = {
  console: null,
  venueId: undefined,
  section: null,
  tabBar: true,
  footer: true,
  wide: false,
};

/** Narrows an untyped `data.section` to a {@link TouristSection}; anything else is no section. */
function sectionOf(data: unknown): TouristSection | null {
  return data === 'beaches' || data === 'bookings' || data === 'account' ? data : null;
}

/** Narrows an untyped `data.console` to a {@link ConsoleSection}; anything else is no console. */
function consoleOf(data: unknown): ConsoleSection | null {
  return data === 'venue' || data === 'admin' || data === 'plain' ? data : null;
}

/**
 * The Liquid Glass app shell: gradient background, glass header (sticky from `sm` up), the primary
 * nav (inline on desktop, a three-tab bottom bar below 640px; CSS decides) and the theme switcher.
 * Every route paints straight onto the background: `<main>` carries no surface of its own.
 */
@Component({
  selector: 'app-root',
  imports: [
    LegalFooter,
    LegalMenuRows,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FindBooking,
    ConsoleShell,
    ThemeMenuRows,
    TouchTarget,
  ],
  templateUrl: './app.html',
  host: {
    '(document:keydown.escape)': 'closeMenus()',
    // Pins the subtree to the operator's console theme on every console route, whatever tourist theme is selected.
    '[attr.data-riv-theme]': "shellChrome() === 'console' ? consoleTheme.theme() : null",
  },
})
export class App {
  protected readonly cls = CLS;
  protected readonly exactPath = EXACT_PATH;

  /** The console's own porcelain-or-dark choice, pinned on this host under the console shell. */
  protected readonly consoleTheme = inject(ConsoleTheme);
  /** Customer session state for the header: sign-in/register links ↔ signed-in + sign-out. */
  protected readonly customerAuth = inject(CustomerAuth);
  /**
   * The "your sign-out may not have reached the server" warning, shown here for BOTH principal types.
   * A deliberate exception to tokens: a solid white/`#b3261e` bar in every theme (6.5:1) — a
   * shared-device safety notice outranks theme harmony and stays clear of the glass contrast rule.
   */
  protected readonly signOutNotice = inject(SignOutNotice);
  private readonly router = inject(Router);
  /** The navigation already in flight when the open overlay was raised; 0 when the router was idle. */
  private overlayNavId = 0;

  protected readonly menuOpen = signal(false);
  /**
   * The header popover: the account menu signed in, Create an account + Find a booking signed out.
   * A disclosure (a button with `aria-expanded` revealing plain links), not an ARIA `menu`, which
   * would oblige roving `tabindex` + arrow-key navigation.
   */
  protected readonly accountOpen = signal(false);
  /** The "Find a booking" glass modal — a shell-level, nav-triggered overlay. */
  protected readonly findOpen = signal(false);

  /** The phone sheet's trigger: the bar's third tab (`Menu` signed out, `Account` signed in). */
  private readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  /** Moves focus onto the sheet's first row once it has rendered — the open leg; `closeMenus()`
   *  hands it back to the tab, and a navigation that tears the sheet down lands `<main>` (WCAG 2.4.3). */
  private readonly focusAfterRender = focusMover();
  /** The account popover's trigger: the account chip signed in, the round menu button signed out. */
  private readonly accountButton = viewChild<ElementRef<HTMLButtonElement>>('accountButton');
  private readonly menuTrigger = viewChild<ElementRef<HTMLButtonElement>>('menuTrigger');
  private readonly mainRef = viewChild<ElementRef<HTMLElement>>('mainEl');
  /** The control to hand focus back to when the find modal is dismissed: the persistent trigger of
   *  the popover or sheet whose row opened it, named by that row — the row itself is gone by then. */
  private findReturn: HTMLElement | null = null;

  /** The signed-in address; read only by the account chip and the sheet's identity block, which
   *  render signed in, when the principal name is defined. */
  private readonly address = computed(() => this.customerAuth.email() ?? '');
  protected readonly handle = computed(() => handleOf(this.address()));
  protected readonly initial = computed(() => initialOf(this.address()));

  /**
   * The active route's chrome flags from ONE root→leaf walk per successful navigation; a flag on a
   * parent route is not inherited into child snapshots, so the walk takes the leaf-most value. Keyed
   * on `lastSuccessfulNavigation()`, set once `routerState` has settled; a failed nav changes nothing.
   */
  private readonly routeChrome = computed((): RouteChrome => {
    if (this.router.lastSuccessfulNavigation() === null) {
      return PRE_NAVIGATION_CHROME;
    }
    let route = this.router.routerState.snapshot.root;
    let console = consoleOf(route.data['console']);
    let venueId = idParam(route.paramMap, 'venueId');
    let section = sectionOf(route.data['section']);
    let tabBar = route.data['tabBar'] !== false;
    let footer = route.data['footer'] !== false;
    let wide = route.data['wide'] === true;
    while (route.firstChild) {
      route = route.firstChild;
      console = consoleOf(route.data['console']) ?? console;
      venueId = idParam(route.paramMap, 'venueId') ?? venueId;
      section = sectionOf(route.data['section']) ?? section;
      tabBar &&= route.data['tabBar'] !== false;
      footer &&= route.data['footer'] !== false;
      wide ||= route.data['wide'] === true;
    }
    return { console, venueId, section, tabBar, footer, wide };
  });

  /** The console section the active route belongs to, `plain` when it carries none — read only
   *  while {@link shellChrome} is `console`. */
  protected readonly consoleSection = computed(() => this.routeChrome().console ?? 'plain');
  /** The venue the console shell is on, off the route chain. */
  protected readonly consoleVenueId = computed(() => this.routeChrome().venueId);
  /** The bottom tab the active route belongs to, `null` outside every section (legal pages) and
   *  before the first navigation. The Account tab reads it together with the signed-in state. */
  protected readonly tabSection = computed(() => this.routeChrome().section);

  /** Whether the phone tab bar renders: the tourist chrome, on a route not flagged `tabBar: false`. */
  protected readonly tabBar = computed(
    () => this.shellChrome() === 'tourist' && this.routeChrome().tabBar,
  );

  /** Whether the shared footer renders: every route but one flagged `footer: false`. */
  protected readonly footer = computed(() => this.routeChrome().footer);

  /** Whether the shell's chrome runs to the window's edges: a route flagged `data.wide`. Bound
   *  as a bare `data-wide` attribute on each element whose cap it lifts. */
  protected readonly wide = computed(() => this.routeChrome().wide);

  /** Whether the auth card is the current page, by path alone — the same test `routerLinkActive`
   *  runs for the plain-path links, as a signal. */
  private readonly authPageActive = isActive('/account/sign-in', this.router, EXACT_PATH);

  /**
   * Which of the Sign in / Register pair is current, or neither. Both target `/account/sign-in` and
   * differ only in `mode=register`, which `routerLinkActive` can't key on without mis-lighting Sign
   * in — so this reads the query param off the settled navigation.
   */
  protected readonly authLinkCurrent = computed((): 'signin' | 'register' | null => {
    if (!this.authPageActive()) {
      return null;
    }
    const mode = this.router.lastSuccessfulNavigation()?.finalUrl?.queryParamMap.get('mode');
    return mode === 'register' ? 'register' : 'signin';
  });

  /** The Account tab is current on the account section while signed in; signed out the same
   *  URLs (the sign-in card, the reset flow) belong to no tab. */
  protected readonly accountTabCurrent = computed(
    () => this.tabSection() === 'account' && this.customerAuth.signedIn(),
  );
  /** The third tab's accessible name: auth-neutral `Menu` until the restore settles or signed out. */
  protected readonly menuTabLabel = computed(() =>
    this.customerAuth.signedIn() ? `Account: ${this.customerAuth.email()}` : 'Menu',
  );
  /** The shell root's classes: the tab bar's clearance only while the bar renders (AC 4 / AC 6). */
  protected readonly shellClass = computed(() => (this.tabBar() ? SHELL_WITH_TAB_BAR : SHELL));

  /** Which chrome the shell renders: the tourist header (default) or the console shell
   *  (`data.console`); the background and footer are shared by both. */
  protected readonly shellChrome = computed((): 'console' | 'tourist' =>
    this.routeChrome().console === null ? 'tourist' : 'console',
  );

  /**
   * Closes every overlay on each `NavigationEnd` except the one already in flight when it opened
   * (matched by id, not url — hence the event stream). A skipped nav must not tear out the overlay's
   * markup: a first header link to a console route must close the popovers on that chrome switch.
   */
  constructor() {
    // The navigation an overlay was opened during is not the user leaving the page.
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        if (event.id === this.overlayNavId) {
          if (this.menuOpen() && !this.tabBar()) {
            this.menuOpen.set(false);
            this.mainRef()?.nativeElement.focus();
          }
          return;
        }
        // These overlays hold focus in markup this navigation destroys (find modal, account menu, sheet).
        const overlayHeldFocus = this.findOpen() || this.accountOpen() || this.menuOpen();
        this.findOpen.set(false);
        this.menuOpen.set(false);
        this.accountOpen.set(false);
        // Land the keyboard/AT guest on the new page, not document.body (WCAG 2.4.3).
        if (overlayHeldFocus) {
          this.mainRef()?.nativeElement.focus();
        }
      });
  }

  /**
   * Record the navigation already under way as a header control changes an overlay's state; `0`
   * when idle (ids start at 1). Inert on the closing half: ids are monotonic per `Router`.
   */
  private notePendingNavigation(): void {
    this.overlayNavId = this.router.currentNavigation()?.id ?? 0;
  }

  /** Open the find-a-booking modal, closing the popover or sheet it was opened from and recording
   *  `trigger` — that surface's persistent control — as the focus-return target. */
  protected openFind(trigger: HTMLElement): void {
    this.notePendingNavigation();
    this.findReturn = trigger;
    this.menuOpen.set(false);
    this.accountOpen.set(false);
    this.findOpen.set(true);
  }

  /** The sheet's `Find a booking` row: the sheet and the tab bar sit in sibling control-flow
   *  blocks, so the tab's template reference is out of the row's reach and the class resolves it. */
  protected openFindFromSheet(): void {
    const tab = this.menuButton()?.nativeElement;
    if (tab) {
      this.openFind(tab);
    }
  }

  /** Dismiss (ESC / backdrop / close button) — hide the modal and restore focus to its trigger. */
  protected dismissFind(): void {
    this.findOpen.set(false);
    this.findReturn?.focus();
  }

  /** Toggle the phone sheet; opening moves focus onto its first row — the auth row, or `Find a
   *  booking` while the restore still hides the auth group. */
  protected toggleMenu(): void {
    this.notePendingNavigation();
    this.accountOpen.set(false);
    this.menuOpen.update((open) => !open);
    if (this.menuOpen()) {
      const authRow = this.customerAuth.signedIn()
        ? 'nav-account-link-mobile'
        : 'nav-signin-mobile';
      this.focusAfterRender(authRow, 'find-open-mobile');
    }
  }

  /** Toggle the account/menu popover; only one header popover is open at a time. */
  protected toggleAccountMenu(): void {
    this.notePendingNavigation();
    this.menuOpen.set(false);
    this.accountOpen.update((open) => !open);
  }

  /** Sign the customer out — clears the session server-side; closes the menus first. */
  protected async signOut(): Promise<void> {
    this.menuOpen.set(false);
    this.accountOpen.set(false);
    // Sign-out unmounts the control that was clicked without navigating, so nothing else would
    // catch focus — park it on main rather than let it strand on document.body (WCAG 2.4.3).
    this.mainRef()?.nativeElement.focus();
    await this.customerAuth.signOut();
  }

  /** Retry a sign-out the server never confirmed; the banner clears only if it confirms now. */
  protected async retrySignOut(): Promise<void> {
    await this.signOutNotice.retry();
  }

  protected dismissSignOutNotice(): void {
    this.signOutNotice.dismiss();
  }

  /** Closes whichever surface is open and hands focus back to its trigger. */
  protected closeMenus(): void {
    if (this.menuOpen()) {
      this.menuOpen.set(false);
      this.menuButton()?.nativeElement.focus();
    }
    if (this.accountOpen()) {
      this.accountOpen.set(false);
      (this.accountButton() ?? this.menuTrigger())?.nativeElement.focus();
    }
  }
}
