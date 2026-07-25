import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { FindBooking } from './booking/find-booking';
import { CustomerAuth } from './core/customer-auth';
import { SignOutNotice } from './core/sign-out-notice';
import { ThemeId, ThemeService } from './core/theme';

/**
 * The Liquid Glass app shell (issue #134): themed gradient background, sticky glass header with
 * responsive nav (inline on desktop, hamburger menu below 640px — CSS decides, both live here),
 * and the theme switcher. Routes not yet restyled to glass carry `data.legacySurface`, which
 * wraps <main> in an opaque light panel so their pre-redesign styling stays legible (plan R-1);
 * each restyle slice (T2–T5, operator epic) removes its route's flag.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, FindBooking],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '(document:keydown.escape)': 'closeMenus()' },
})
export class App {
  protected readonly themes = inject(ThemeService);
  /** Customer session state for the header (S2 #111): sign-in/register links ↔ signed-in + sign-out. */
  protected readonly customerAuth = inject(CustomerAuth);
  /**
   * The "your sign-out may not have reached the server" warning (#128). Rendered by the shell for
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
  /** The "Find a booking" glass modal (issue #148) — a shell-level, nav-triggered overlay. */
  protected readonly findOpen = signal(false);

  private readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  private readonly themeButton = viewChild<ElementRef<HTMLButtonElement>>('themeButton');
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
   * `legacySurface` (the leaf still renders pre-redesign styling → opaque compat panel) and
   * `chromeless` (the operator console, `/operator/**` #170, owns a full-bleed porcelain shell → the
   * tourist header/nav/footer + themed background are suppressed). `operatorConsole` sits on the
   * console's PARENT route and is not inherited into a child snapshot, so it is OR-ed across the
   * whole chain; `legacySurface` is a leaf-only flag. Defaults (pre-navigation): legacy compat on,
   * chrome shown.
   */
  private readonly routeChrome = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => {
        let route = this.router.routerState.snapshot.root;
        let chromeless = route.data['operatorConsole'] === true;
        while (route.firstChild) {
          route = route.firstChild;
          chromeless ||= route.data['operatorConsole'] === true;
        }
        return { legacySurface: route.data['legacySurface'] === true, chromeless };
      }),
    ),
    { initialValue: { legacySurface: true, chromeless: false } },
  );

  /** True while the current route still renders pre-redesign styling (default true pre-navigation). */
  protected readonly legacySurface = computed(() => this.routeChrome().legacySurface);

  /** True on the operator console — its porcelain shell replaces the tourist chrome (default false). */
  protected readonly hideShellChrome = computed(() => this.routeChrome().chromeless);

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
        const wasFindOpen = this.findOpen();
        this.findOpen.set(false);
        this.menuOpen.set(false);
        this.themeOpen.set(false);
        // A find that succeeded navigated away, destroying the modal that held focus; move focus to
        // the main content region so a keyboard/AT guest lands on the new page rather than
        // document.body (WCAG 2.4.3 — review finding [4]).
        if (wasFindOpen) {
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
    this.findOpen.set(true);
  }

  /** Dismiss (ESC / backdrop / close button) — hide the modal and restore focus to its trigger. */
  protected dismissFind(): void {
    this.findOpen.set(false);
    this.findReturn?.focus();
  }

  protected toggleMenu(): void {
    this.themeOpen.set(false);
    this.menuOpen.update((open) => !open);
  }

  protected toggleThemePicker(): void {
    this.menuOpen.set(false);
    this.themeOpen.update((open) => !open);
  }

  protected selectTheme(id: ThemeId): void {
    this.themes.select(id);
    this.closeMenus();
  }

  /** Sign the customer out (S2 #111) — clears the session server-side; closes the mobile menu first. */
  protected async signOut(): Promise<void> {
    this.menuOpen.set(false);
    await this.customerAuth.signOut();
  }

  /** Retry a sign-out the server never confirmed (#128); the banner clears only if it confirms now. */
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
  }
}
