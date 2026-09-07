import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { LegalFooter } from './shared/legal-footer';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  IsActiveMatchOptions,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
  isActive,
} from '@angular/router';
import { filter } from 'rxjs';

import { FindBooking } from './booking/find-booking';
import { CustomerAuth } from './core/customer-auth';
import { SignOutNotice } from './core/sign-out-notice';
import { ThemeId, ThemeService } from './core/theme';
import { OperatorChrome } from './operator/operator-chrome';
import { TouchTarget } from './shared/touch-target';

/** The near-opaque popover surface (account menu, theme picker, mobile sheet) — themed via the
 *  `--riv-pop-*` family: light in porcelain/riviera, slate in the dark theme. */
const POP =
  'absolute z-40 animate-[riv-pop_0.2s_ease] rounded-[18px] border border-riv-pop-border bg-riv-pop-surface text-riv-pop-ink shadow-riv-pop backdrop-blur-[28px] backdrop-saturate-[1.8] motion-reduce:animate-none';
/** The current page's row takes the hover fill plus the popover accent ink, on the desktop popover
 *  and the sheet alike: it has to read on touch, where `hover:` never fires (Tailwind v4 compiles
 *  it under `@media (hover: hover)`). */
const CURRENT_POP_ROW =
  'aria-[current=page]:bg-riv-pop-hover aria-[current=page]:text-riv-pop-accent';
const POP_ITEM = `block w-full rounded-xl px-2.5 py-[9px] text-[14px] font-semibold text-riv-pop-ink [transition:background_0.12s_ease] hover:bg-riv-pop-hover ${CURRENT_POP_ROW}`;
const MOBILE_ITEM = `block w-full rounded-[14px] px-3.5 py-[13px] text-left text-[15.5px] font-semibold text-riv-pop-ink hover:bg-riv-pop-hover ${CURRENT_POP_ROW}`;

/** The chip glass the desktop menu button and the account chip share, inner highlight included. */
const CHIP =
  'cursor-pointer rounded-full border border-riv-chip-border bg-riv-chip-bg shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] backdrop-blur-[10px] [transition:filter_0.15s_ease] hover:brightness-[0.96] motion-reduce:transition-none';

/** Template skins, hoisted so each recipe exists once (the booking-view.ts `cls` idiom). */
const CLS = {
  backdrop: 'fixed inset-0 z-30 bg-[rgba(6,30,40,0.2)]',
  accountPop: `riv-account-pop top-[calc(100%+10px)] right-0 w-[236px] p-[7px] ${POP}`,
  themePop: `riv-theme-pop top-[calc(100%+10px)] right-0 w-[214px] p-[7px] ${POP}`,
  mobileMenu: `top-[calc(100%+8px)] right-3 left-3 p-2 ${POP}`,
  popItem: POP_ITEM,
  popBtn: `${POP_ITEM} cursor-pointer text-left`,
  mobileItem: MOBILE_ITEM,
  mobileBtn: `${MOBILE_ITEM} cursor-pointer`,
  // The current page carries full ink and an underline in that ink (an accent token would vanish on riviera's dark header glass): hover alone is invisible on a tablet.
  // inline-flex: appTouchTarget's min-height is a no-op on an inline <a>.
  navLink:
    'inline-flex cursor-pointer items-center hover:text-riv-ink aria-[current=page]:font-semibold aria-[current=page]:text-riv-ink aria-[current=page]:underline aria-[current=page]:decoration-2 aria-[current=page]:decoration-current aria-[current=page]:underline-offset-[7px]',
  accountChip: `inline-flex items-center gap-2 py-1 pr-3 pl-1.5 font-semibold text-riv-ink ${CHIP}`,
  menuBtn: `inline-flex h-11 w-11 flex-col items-center justify-center gap-[4.5px] ${CHIP}`,
  menuBar: 'block h-0.5 w-[17px] rounded-[2px] bg-riv-ink',
  // The 1.5px ink-soft ring is the swatch's WCAG 1.4.11 boundary (5.4 / 5.5 / 11.6:1 on the three bars): the swatch alone sits at 1.0–2.8:1 against the bar, and a white inset ring vanishes on porcelain.
  swatchBtn:
    'grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full before:h-[22px] before:w-[22px] before:rounded-full before:bg-(image:--riv-swatch) before:shadow-[0_1px_3px_rgba(6,30,40,0.35)] before:ring-[1.5px] before:ring-riv-ink-soft before:[transition:scale_0.12s_ease] hover:before:scale-[1.12] motion-reduce:before:transition-none motion-reduce:hover:before:scale-100',
  // The solid-fill family, not the CTA gradient: nothing in the bar may outweigh the page's primary button.
  avatar:
    'inline-flex shrink-0 items-center justify-center rounded-full bg-riv-solid-fill-brand font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]',
} as const;

/** The part of the address before the `@`: the chip's visible label. */
function handleOf(email: string | undefined): string {
  return email?.split('@')[0] ?? '';
}

/** The avatar's initial, `?` for an address that is somehow empty. */
function initialOf(email: string | undefined): string {
  const first = email?.trim().charAt(0) ?? '';
  return (first === '' ? '?' : first).toUpperCase();
}

/** `routerLinkActive` matching for the header's plain-path links: the path alone, so Beaches (`/`)
 *  does not stay lit on every page and a `returnUrl` does not unlight Your account. */
const EXACT_PATH: IsActiveMatchOptions = {
  paths: 'exact',
  queryParams: 'ignored',
  fragment: 'ignored',
  matrixParams: 'ignored',
};

/** The active route's chrome flags — see {@link App.routeChrome}. */
interface RouteChrome {
  chromeless: boolean;
  operatorChrome: boolean;
}

/** The chrome before the first navigation completes: the tourist header and footer. */
const PRE_NAVIGATION_CHROME: RouteChrome = {
  chromeless: false,
  operatorChrome: false,
};

/**
 * The Liquid Glass app shell: themed gradient background, sticky glass header with
 * responsive nav (inline on desktop, hamburger menu below 640px — CSS decides, both live here),
 * and the theme switcher. Every route paints straight onto that background: `<main>` carries no
 * surface of its own.
 */
@Component({
  selector: 'app-root',
  imports: [
    LegalFooter,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FindBooking,
    OperatorChrome,
    TouchTarget,
  ],
  templateUrl: './app.html',
  host: {
    '(document:keydown.escape)': 'closeMenus()',
    // Pins the subtree porcelain on operator-chrome routes, whatever tourist theme is selected.
    '[attr.data-riv-theme]': "shellChrome() === 'operator' ? 'porcelain' : null",
  },
})
export class App {
  protected readonly cls = CLS;
  protected readonly exactPath = EXACT_PATH;

  protected readonly themes = inject(ThemeService);
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
   * The signed-in account menu — the tourist's entry point to `/account/password`.
   *
   * <p><strong>A disclosure, deliberately not an ARIA `menu`.</strong> `role="menu"`/`menuitem`
   * would oblige roving `tabindex` + arrow-key navigation to be correct; the theme options were
   * downgraded off the sibling ARIA radio pattern for exactly that reason. This is a button with
   * `aria-expanded` revealing plain links — the same shape as `riv-theme-picker`.
   */
  protected readonly accountOpen = signal(false);
  /** The "Find a booking" glass modal — a shell-level, nav-triggered overlay. */
  protected readonly findOpen = signal(false);

  private readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
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
  protected readonly handle = computed(() => handleOf(this.customerAuth.email()));
  protected readonly initial = computed(() => initialOf(this.customerAuth.email()));

  /**
   * The active route's chrome flags, computed once per successful navigation from a SINGLE
   * root→leaf walk: `chromeless` (the operator console, `/operator/:venueId`, owns a full-bleed
   * porcelain shell → all shell chrome is suppressed) and `operatorChrome` (every OTHER
   * operator/admin surface → the shared porcelain operator header/footer replace the tourist ones,
   * so an admin is never shown the customer session's "Sign in / Register" while signed in). The
   * console flag sits on a PARENT route and is not inherited into a child snapshot, so both flags
   * are OR-ed across the whole chain. {@link PRE_NAVIGATION_CHROME} until the first navigation
   * completes.
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
    let chromeless = route.data['operatorConsole'] === true;
    let operatorChrome = route.data['operatorChrome'] === true;
    while (route.firstChild) {
      route = route.firstChild;
      chromeless ||= route.data['operatorConsole'] === true;
      operatorChrome ||= route.data['operatorChrome'] === true;
    }
    return { chromeless, operatorChrome };
  });

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

  /** Which chrome the shell renders: the tourist header/footer (default), the shared operator
   *  header/footer, or none at all (the console brings its own). */
  protected readonly shellChrome = computed(() => {
    const { chromeless, operatorChrome } = this.routeChrome();
    if (chromeless) {
      return 'none';
    }
    return operatorChrome ? 'operator' : 'tourist';
  });

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
   * overlay's markup. The three popovers render inside `app.html`'s
   * `@if (shellChrome() === 'tourist')`, so a destination on operator or admin chrome would tear
   * them out while their signals stayed true, stranding focus on `document.body`. No tourist-header
   * link targets such a route today. Adding the first one means closing the popovers on the chrome
   * switch, not relying on this rule.
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
          return;
        }
        // Both overlays hold focus in markup this navigation destroys (find modal, account menu).
        const overlayHeldFocus = this.findOpen() || this.accountOpen();
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

  /** Dismiss (ESC / backdrop / close button) — hide the modal and restore focus to its trigger. */
  protected dismissFind(): void {
    this.findOpen.set(false);
    this.findReturn?.focus();
  }

  protected toggleMenu(): void {
    this.notePendingNavigation();
    this.themeOpen.set(false);
    this.accountOpen.set(false);
    this.menuOpen.update((open) => !open);
  }

  protected toggleThemePicker(): void {
    this.notePendingNavigation();
    this.menuOpen.set(false);
    this.accountOpen.set(false);
    this.themeOpen.update((open) => !open);
  }

  /** Toggle the signed-in account menu; only one header popover is open at a time. */
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
