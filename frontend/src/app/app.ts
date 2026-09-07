import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { LegalFooter } from './shared/legal-footer';
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
import { CustomerAuth } from './core/customer-auth';
import { SignOutNotice } from './core/sign-out-notice';
import { ConsoleTheme } from './core/console-theme';
import { ThemeId, ThemeService } from './core/theme';
import { focusMover } from './shared/focus-after-render';
import { idParam } from './shared/parent-venue-id';
import {
  AVATAR,
  CHIP,
  CURRENT_POP_ROW,
  EXACT_PATH,
  POP_BACKDROP,
  POP_BUTTON,
  POP_ITEM,
  POP_SKIN,
  handleOf,
  initialOf,
} from './shared/popover-skin';
import { TouchTarget } from './shared/touch-target';

const POP = `absolute ${POP_SKIN}`;
const MOBILE_ITEM = `block w-full rounded-[14px] px-3.5 py-[13px] text-left text-[15.5px] font-semibold text-riv-pop-ink hover:bg-riv-pop-hover ${CURRENT_POP_ROW}`;

/** The shell's root box, with and without the phone tab bar's clearance: the bar is 61px tall
 *  (60px tabs + the top border) and pads itself by the home-indicator inset, so the page pads by
 *  both — otherwise the last 61px of every page sit under the bar. Two literals, not a
 *  concatenation: Tailwind generates only classes it can read in the source. `text-riv-ink`
 *  re-resolves the ink under the console routes' theme pin — `body` resolves it once under
 *  the document theme, so an inheriting element would keep a dark theme's white ink there. */
const SHELL = 'relative flex min-h-screen flex-col text-riv-ink';
const SHELL_WITH_TAB_BAR = `${SHELL} max-sm:pb-[calc(61px+env(safe-area-inset-bottom))]`;

/**
 * A bottom tab. The current tab is a SHAPE cue in full ink — a 3px bar at the top edge and a
 * 1.5px ring round the icon pill — plus the full-ink label: no tint the token set offers clears
 * WCAG 1.4.11's 3:1 against the bar (the 0.12 accent fill measured 1.10–1.22:1, the 0.18 chip fill
 * 1.15–1.36:1), and full-vs-soft ink alone reads 1.22–2.54:1. `flex`, so `appTouchTarget`'s floor
 * is live on the two `<a>`s; `group`, so the pill's ring keys on the tab's `aria-current`.
 */
const TAB =
  "group relative flex h-[60px] cursor-pointer flex-col items-center justify-center gap-[3px] text-[11px] font-semibold text-riv-ink-soft before:absolute before:top-0 before:h-[3px] before:w-9 before:rounded-b-full before:bg-current before:opacity-0 before:content-[''] aria-[current=page]:text-riv-ink aria-[current=page]:before:opacity-100";

/** Template skins, hoisted so each recipe exists once (the booking-view.ts `cls` idiom). */
const CLS = {
  backdrop: POP_BACKDROP,
  accountPop: `riv-account-pop top-[calc(100%+10px)] right-0 w-[236px] p-[7px] ${POP}`,
  themePop: `riv-theme-pop top-[calc(100%+10px)] right-0 w-[214px] p-[7px] ${POP}`,
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
  accountChip: `inline-flex items-center gap-2 py-1 pr-3 pl-1.5 font-semibold text-riv-ink ${CHIP}`,
  menuBtn: `inline-flex h-11 w-11 flex-col items-center justify-center gap-[4.5px] ${CHIP}`,
  menuBar: 'block h-0.5 w-[17px] rounded-[2px] bg-riv-ink',
  // The 1.5px ink-soft ring is the swatch's WCAG 1.4.11 boundary (5.4 / 5.5 / 11.6:1 on the three bars): the swatch alone reaches 1.0:1 against the bar (its white end on porcelain), and a white inset ring vanishes there too.
  swatchBtn:
    'grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full before:h-[22px] before:w-[22px] before:rounded-full before:bg-(image:--riv-swatch) before:shadow-[0_1px_3px_rgba(6,30,40,0.35)] before:ring-[1.5px] before:ring-riv-ink-soft before:[transition:scale_0.12s_ease] hover:before:scale-[1.12] motion-reduce:before:transition-none motion-reduce:hover:before:scale-100',
  avatar: AVATAR,
} as const;

/** The phone tab bar's three sections: the bar lights the tab whose section the active route
 *  carries, not the tab whose path it matches (`/venues/3` is a Beaches page, `/booking/CODE` a
 *  bookings page). `account` lights only while signed in. */
export type TouristSection = 'beaches' | 'bookings' | 'account';

/**
 * The route data a tourist route may carry for the shell's phone chrome (`app.routes.ts`):
 * `section` places the route under a bottom tab; `tabBar: false` hides the bar altogether — the
 * payment page, where a thumb-reach exit under `Pay €45` was the objection that removed the
 * search-first header candidate. Read off the same root→leaf walk as the operator flags.
 */
export interface TouristRouteData {
  section?: TouristSection;
  tabBar?: false;
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
}

/** The chrome before the first navigation completes: the tourist header, footer and tab bar,
 *  with no tab lit. */
const PRE_NAVIGATION_CHROME: RouteChrome = {
  console: null,
  venueId: undefined,
  section: null,
  tabBar: true,
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
 * The Liquid Glass app shell: themed gradient background, the glass header (sticky from `sm` up,
 * scrolling away below it), the primary nav — inline in the header on desktop, a fixed three-tab
 * bottom bar below 640px, CSS decides and both live here — and the theme switcher. Every route
 * paints straight onto that background: `<main>` carries no surface of its own.
 */
@Component({
  selector: 'app-root',
  imports: [
    LegalFooter,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FindBooking,
    ConsoleShell,
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

  protected readonly themes = inject(ThemeService);
  /** The console's own porcelain-or-dark choice, pinned on this host under the console shell. */
  protected readonly consoleTheme = inject(ConsoleTheme);
  /** Customer session state for the header: sign-in/register links ↔ signed-in + sign-out. */
  protected readonly customerAuth = inject(CustomerAuth);
  /**
   * The "your sign-out may not have reached the server" warning. Rendered by the shell for
   * BOTH principal types — `SessionAuth` records into it, so an operator signing out of the console
   * raises the same banner without the console knowing about it.
   *
   * <p><strong>Deliberate styling deviation</strong> (`riviera-tailwind`: components consume
   * `--riv-*` tokens, never palette literals): the banner is a fixed solid white/`#b3261e` bar in
   * both themes rather than token-driven. It is a safety notice about a session that may still be
   * open on a shared device, so legibility outranks theme harmony; solid also keeps it clear of the
   * translucent-glass contrast rule. Measured 6.5:1, past AA.
   */
  protected readonly signOutNotice = inject(SignOutNotice);
  private readonly router = inject(Router);
  /** The navigation already in flight when the open overlay was raised; 0 when the router was idle. */
  private overlayNavId = 0;

  protected readonly menuOpen = signal(false);
  protected readonly themeOpen = signal(false);
  /**
   * The header popover: the account menu signed in (the tourist's entry point to
   * `/account/password`), the menu of Create an account + Find a booking signed out.
   *
   * <p><strong>A disclosure, deliberately not an ARIA `menu`.</strong> `role="menu"`/`menuitem`
   * would oblige roving `tabindex` + arrow-key navigation to be correct; the theme options were
   * downgraded off the sibling ARIA radio pattern for exactly that reason. This is a button with
   * `aria-expanded` revealing plain links — the same shape as `riv-theme-picker`.
   */
  protected readonly accountOpen = signal(false);
  /** The "Find a booking" glass modal — a shell-level, nav-triggered overlay. */
  protected readonly findOpen = signal(false);

  /** The phone sheet's trigger: the bar's third tab (`Menu` signed out, `Account` signed in). */
  private readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  /** Moves focus onto the sheet's first row once it has rendered — the open leg; `closeMenus()`
   *  hands it back to the tab, and a navigation that tears the sheet down lands `<main>` (WCAG 2.4.3). */
  private readonly focusAfterRender = focusMover();
  private readonly themeButton = viewChild<ElementRef<HTMLButtonElement>>('themeButton');
  /** The account popover's trigger: the account chip signed in, the round menu button signed out. */
  private readonly accountButton = viewChild<ElementRef<HTMLButtonElement>>('accountButton');
  private readonly menuTrigger = viewChild<ElementRef<HTMLButtonElement>>('menuTrigger');
  private readonly mainRef = viewChild<ElementRef<HTMLElement>>('mainEl');
  /** The control to hand focus back to when the find modal is dismissed: the persistent trigger of
   *  the popover or sheet whose row opened it, named by that row — the row itself is gone by then. */
  private findReturn: HTMLElement | null = null;

  protected readonly activeTheme = computed(
    () =>
      this.themes.options.find((option) => option.id === this.themes.theme()) ??
      this.themes.options[0],
  );
  /** The signed-in address; read only by the account chip and the sheet's identity block, which
   *  render signed in, when the principal name is defined. */
  private readonly address = computed(() => this.customerAuth.email() ?? '');
  protected readonly handle = computed(() => handleOf(this.address()));
  protected readonly initial = computed(() => initialOf(this.address()));

  /**
   * The active route's chrome flags, computed once per successful navigation from a SINGLE
   * root→leaf walk: `console` (every operator/admin surface — the venue console, the admin
   * console, the two plain operator pages — names its section, and the console shell replaces the
   * tourist header, so an admin is never shown the customer session's "Sign in / Register" while
   * signed in) with the `:venueId` beside it, and the tourist `section` / `tabBar` flags. A flag
   * sits on a PARENT route and is not inherited into a child snapshot, so the leaf-most value on
   * the chain wins. {@link PRE_NAVIGATION_CHROME} until the first navigation completes.
   *
   * <p>Keyed on `Router.lastSuccessfulNavigation()`; the `routerState` snapshot it walks is not a
   * signal, and reading it here is safe because the router assigns `routerState` before it
   * activates the routes (on `BeforeActivateRoutes`) and sets `lastSuccessfulNavigation` on the
   * line before it emits `NavigationEnd`, so this computed observes the same settled state a
   * `NavigationEnd` subscriber does. A skipped, cancelled or failed navigation sets neither, and
   * leaves the chrome where it was.
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
    while (route.firstChild) {
      route = route.firstChild;
      console = consoleOf(route.data['console']) ?? console;
      venueId = idParam(route.paramMap, 'venueId') ?? venueId;
      section = sectionOf(route.data['section']) ?? section;
      tabBar &&= route.data['tabBar'] !== false;
    }
    return { console, venueId, section, tabBar };
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

  /** Whether the auth card is the current page, by path alone — the same test `routerLinkActive`
   *  runs for the plain-path links, as a signal. */
  private readonly authPageActive = isActive('/account/sign-in', this.router, EXACT_PATH);

  /**
   * Which of the Sign in / Register pair is the current page, or neither. Both links target
   * `/account/sign-in` and differ only in `mode=register`, which `routerLinkActive` cannot key on
   * without also lighting Sign in under `?mode=register` (a subset match) or unlighting it under a
   * `returnUrl` (an exact one) — so the pair reads the query param itself, off the same settled
   * navigation {@link authPageActive} is computed from.
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
   * Wires the close-on-navigation rule: a navigation the user set off carries them away from the
   * page they opened an overlay on — a found booking code navigates to `/booking/:code`, so the find
   * modal must not linger over the detail view — and closes all four.
   *
   * <p>The ONE navigation that does not is the one already running when the overlay was opened.
   * The header is interactive before the first route's lazily loaded chunk has activated
   * (`provideRouter`'s default `enabledNonBlocking` initial navigation), so the `NavigationEnd`
   * closing that window is not something the user did and must not shut a menu they just opened.
   * That reasoning is about a navigation being ALREADY UNDER WAY, not about it being the first or
   * about where it lands: a guest who opens the theme picker while a nav link they clicked is still
   * loading keeps it open onto the destination too, deliberately.
   * Identity is the navigation id, not the url: a url comparison would also swallow a navigation
   * the guest DID start from inside the overlay onto the page they deep-linked to, which supersedes
   * the pending one under a new id and leaves {@link FindBooking} waiting on a close that never comes.
   * That id is why this rule reads the event stream while the shell's other route state
   * ({@link routeChrome}, {@link authLinkCurrent}) is computed from router signals: the skip
   * compares the id of EACH `NavigationEnd` against the one recorded at open, a per-event fact
   * that no router signal exposes.
   *
   * <p>The close performs no focus restore: the destination page takes focus, and restoring is only
   * for an on-page dismiss.
   *
   * <p><strong>Precondition of the skip:</strong> a skipped navigation must not destroy the open
   * overlay's markup or its trigger. The popovers render inside `app.html`'s
   * `@if (shellChrome() === 'tourist')`, so a destination under the console shell would tear
   * them out while their signals stayed true, stranding focus on `document.body`. No tourist-header
   * link targets such a route today. Adding the first one means closing the popovers on the chrome
   * switch, not relying on this rule. The sheet's trigger renders inside `@if (tabBar())`, and a
   * destination that hides the bar (a deep link to the pay page, whose chunk was still loading when
   * the sheet opened) IS reachable — so that case closes the sheet and lands focus on `<main>`
   * instead of skipping.
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
        this.themeOpen.set(false);
        this.accountOpen.set(false);
        // Land the keyboard/AT guest on the new page, not document.body (WCAG 2.4.3).
        if (overlayHeldFocus) {
          this.mainRef()?.nativeElement.focus();
        }
      });
  }

  /**
   * Record the navigation already under way, if any, as a header control changes an overlay's
   * state; `0` when the router is idle, an id no navigation carries (they start at 1).
   *
   * <p>The three toggles call this on the lowering half too, which is inert: navigation ids are
   * monotonic per `Router`, so a value recorded while nothing is open can never equal a LATER
   * `NavigationEnd`'s id, and the close it would skip is a no-op anyway.
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
    this.themeOpen.set(false);
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
    this.themeOpen.set(false);
    this.accountOpen.set(false);
    this.menuOpen.update((open) => !open);
    if (this.menuOpen()) {
      const authRow = this.customerAuth.signedIn()
        ? 'nav-account-link-mobile'
        : 'nav-signin-mobile';
      this.focusAfterRender(authRow, 'find-open-mobile');
    }
  }

  protected toggleThemePicker(): void {
    this.notePendingNavigation();
    this.menuOpen.set(false);
    this.accountOpen.set(false);
    this.themeOpen.update((open) => !open);
  }

  /** Toggle the account/menu popover; only one header popover is open at a time. */
  protected toggleAccountMenu(): void {
    this.notePendingNavigation();
    this.menuOpen.set(false);
    this.themeOpen.set(false);
    this.accountOpen.update((open) => !open);
  }

  protected selectTheme(id: ThemeId): void {
    this.themes.select(id);
    this.closeMenus();
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
    if (this.themeOpen()) {
      this.themeOpen.set(false);
      this.themeButton()?.nativeElement.focus();
    }
    if (this.accountOpen()) {
      this.accountOpen.set(false);
      (this.accountButton() ?? this.menuTrigger())?.nativeElement.focus();
    }
  }
}
