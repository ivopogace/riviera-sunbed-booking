import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

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
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '(document:keydown.escape)': 'closeMenus()' },
})
export class App {
  protected readonly themes = inject(ThemeService);
  private readonly router = inject(Router);

  protected readonly menuOpen = signal(false);
  protected readonly themeOpen = signal(false);

  private readonly menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  private readonly themeButton = viewChild<ElementRef<HTMLButtonElement>>('themeButton');

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
