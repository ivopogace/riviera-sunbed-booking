import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { FindBooking } from './booking/find-booking';
import { CustomerAuth } from './core/customer-auth';
import { SignOutNotice } from './core/sign-out-notice';
import { ThemeId, ThemeService } from './core/theme';
import { OperatorChrome } from './operator/operator-chrome';

/**
 * The Liquid Glass app shell: themed gradient background, sticky glass header with
 * responsive nav (inline on desktop, hamburger menu below 640px — CSS decides, both live here),
 * and the theme switcher. Routes not yet restyled to glass carry `data.legacySurface`, which
 * wraps <main> in an opaque light panel so their pre-redesign styling stays legible;
 * each restyle slice removes its route's flag.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, FindBooking, OperatorChrome],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    '(document:keydown.escape)': 'closeMenus()',
    // Pins the subtree porcelain on operator-chrome routes, whatever tourist theme is selected.
    '[attr.data-riv-theme]': "shellChrome() === 'operator' ? 'porcelain' : null",
  },
})
export class App {
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
  private readonly accountButton = viewChild<ElementRef<HTMLButtonElement>>('accountButton');
  private readonly findButton = viewChild<ElementRef<HTMLButtonElement>>('findButton');
  private readonly mainRef = viewChild<ElementRef<HTMLElement>>('mainEl');
  /** The control to hand focus back to when the find modal is dismissed (desktop trigger or, when
   *  opened from the mobile menu, the persistent hamburger button — the mobile item collapses). */
  private findReturn: HTMLElement | null = null;

  protected readonly activeTheme = computed(
    () =>
      this.themes.options.find((option) => option.id === this.themes.theme()) ??
      this.themes.options[0],
  );

  /**
   * The active route's chrome flags, computed once per navigation from a SINGLE root→leaf walk:
   * `legacySurface` (the leaf still renders pre-redesign styling → opaque compat panel),
   * `chromeless` (the operator console, `/operator/:venueId`, owns a full-bleed porcelain
   * shell → all shell chrome is suppressed) and `operatorChrome` (every OTHER operator/admin
   * surface → the shared porcelain operator header/footer replace the tourist ones, so an admin is
   * never shown the customer session's "Sign in / Register" while signed in). The console flag sits
   * on a PARENT route and is not inherited into a child snapshot, so both flags are OR-ed across
   * the whole chain; `legacySurface` is a leaf-only flag. Defaults (pre-navigation): legacy compat
   * on, tourist chrome shown.
   */
  private readonly routeChrome = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => {
        let route = this.router.routerState.snapshot.root;
        let chromeless = route.data['operatorConsole'] === true;
        let operatorChrome = route.data['operatorChrome'] === true;
        while (route.firstChild) {
          route = route.firstChild;
          chromeless ||= route.data['operatorConsole'] === true;
          operatorChrome ||= route.data['operatorChrome'] === true;
        }
        return { legacySurface: route.data['legacySurface'] === true, chromeless, operatorChrome };
      }),
    ),
    { initialValue: { legacySurface: true, chromeless: false, operatorChrome: false } },
  );

  /** True while the current route still renders pre-redesign styling (default true pre-navigation). */
  protected readonly legacySurface = computed(() => this.routeChrome().legacySurface);

  /** Which chrome the shell renders: the tourist header/footer (default), the shared operator
   *  header/footer, or none at all (the console brings its own). */
  protected readonly shellChrome = computed(() => {
    const { chromeless, operatorChrome } = this.routeChrome();
    if (chromeless) {
      return 'none';
    }
    return operatorChrome ? 'operator' : 'tourist';
  });

  constructor() {
    // Any successful navigation closes the shell overlays — in particular, a found booking code
    // navigates to /booking/:code, so the find modal must not linger over the detail view. No focus
    // restore here: the destination page takes focus (restore is only for an on-page dismiss).
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
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

  /** Open the find-a-booking modal, closing any open nav popover and recording the focus-return
   *  target (the desktop trigger, or the hamburger when opened from the collapsing mobile menu). */
  protected openFind(fromMobile: boolean): void {
    this.findReturn =
      (fromMobile ? this.menuButton() : this.findButton())?.nativeElement ?? null;
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
    this.themeOpen.set(false);
    this.accountOpen.set(false);
    this.menuOpen.update((open) => !open);
  }

  protected toggleThemePicker(): void {
    this.menuOpen.set(false);
    this.accountOpen.set(false);
    this.themeOpen.update((open) => !open);
  }

  /** Toggle the signed-in account menu; only one header popover is open at a time. */
  protected toggleAccountMenu(): void {
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

  /** Closes whichever surface is open and hands focus back to its trigger (AC-3). */
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
      this.accountButton()?.nativeElement.focus();
    }
  }
}
