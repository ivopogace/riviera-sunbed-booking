import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { FindBooking } from './booking/find-booking';
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
  private readonly router = inject(Router);

  protected readonly menuOpen = signal(false);
  protected readonly themeOpen = signal(false);
  /** The "Find a booking" glass modal (issue #148) — a shell-level, nav-triggered overlay. */
  protected readonly findOpen = signal(false);

  private readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  private readonly themeButton = viewChild<ElementRef<HTMLButtonElement>>('themeButton');
  private readonly findButton = viewChild<ElementRef<HTMLButtonElement>>('findButton');
  /** The control to hand focus back to when the find modal is dismissed (desktop trigger or, when
   *  opened from the mobile menu, the persistent hamburger button — the mobile item collapses). */
  private findReturn: HTMLElement | null = null;

  protected readonly activeTheme = computed(
    () =>
      this.themes.options.find((option) => option.id === this.themes.theme()) ??
      this.themes.options[0],
  );

  /** True while the current route still renders pre-redesign styling (default true pre-navigation). */
  protected readonly legacySurface = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => {
        let route = this.router.routerState.snapshot.root;
        while (route.firstChild) {
          route = route.firstChild;
        }
        return route.data['legacySurface'] === true;
      }),
    ),
    { initialValue: true },
  );

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
        this.findOpen.set(false);
        this.menuOpen.set(false);
        this.themeOpen.set(false);
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
