import { inject, Service, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { readStorage, writeStorage } from '../shared/safe-storage';

/**
 * PROTOTYPE — throwaway. Six shapes for the operator/admin console navigation, switchable on every
 * operator and admin route via `?variant=` and the floating bottom bar (`prototype-switcher.ts`):
 * `current` is the shipped chrome as the baseline; `b` to `f` are the candidates, `g` the decided shape after the grill. Nothing in
 * `prototype-console-nav/` ships — the winning shape is rebuilt test-first through `riviera-sdlc`.
 */
export type ConsoleNavVariantKey = 'current' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g';

export interface ConsoleNavVariantOption {
  readonly key: ConsoleNavVariantKey;
  readonly name: string;
}

export const CONSOLE_NAV_VARIANTS: readonly ConsoleNavVariantOption[] = [
  { key: 'current', name: 'Shipped chrome — pill strips (baseline)' },
  { key: 'b', name: 'Tab rail — underlined text tabs on one baseline' },
  { key: 'c', name: 'Sidebar — grouped sections, venue switcher, bottom bar on phone' },
  { key: 'd', name: 'One shell — section bar above a tab rail, two chromes become one' },
  { key: 'e', name: 'Palette — the page title is the nav, ⌘K to jump' },
  { key: 'f', name: 'Ranked rail — primary tabs, the rest under a current-aware More' },
  { key: 'g', name: 'Decided — D as answered: icons + More below sm, ⌘K, porcelain/dark' },
];

const STORAGE_KEY = 'riviera-prototype-console-nav-variant';

function isKey(value: string | null | undefined): value is ConsoleNavVariantKey {
  return CONSOLE_NAV_VARIANTS.some((option) => option.key === value);
}

/**
 * The selected variant. `?variant=<key>` on any URL selects it; the choice is remembered in storage
 * so the real nav links (which drop the query) keep the variant across navigations.
 */
@Service()
export class PrototypeConsoleNavVariant {
  private readonly router = inject(Router);
  private readonly current = signal<ConsoleNavVariantKey>(storedVariant());

  readonly options = CONSOLE_NAV_VARIANTS;
  readonly variant = this.current.asReadonly();

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        const fromUrl = this.router.parseUrl(event.urlAfterRedirects).queryParamMap.get('variant');
        if (isKey(fromUrl)) {
          this.apply(fromUrl);
        }
      });
  }

  select(key: ConsoleNavVariantKey): void {
    this.apply(key);
    const tree = this.router.parseUrl(this.router.url);
    tree.queryParams = { ...tree.queryParams, variant: key };
    void this.router.navigateByUrl(tree, { replaceUrl: true });
  }

  cycle(step: 1 | -1): void {
    const index = CONSOLE_NAV_VARIANTS.findIndex((option) => option.key === this.current());
    const next = (index + step + CONSOLE_NAV_VARIANTS.length) % CONSOLE_NAV_VARIANTS.length;
    this.select(CONSOLE_NAV_VARIANTS[next].key);
  }

  private apply(key: ConsoleNavVariantKey): void {
    this.current.set(key);
    writeStorage(STORAGE_KEY, key);
  }
}

function storedVariant(): ConsoleNavVariantKey {
  const stored = readStorage(STORAGE_KEY);
  return isKey(stored) ? stored : 'current';
}
