import { inject, Service, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { readStorage, writeStorage } from '../shared/safe-storage';

/**
 * PROTOTYPE — throwaway. Four variants of the tourist header on every tourist route, switchable via
 * `?variant=` and the floating bottom bar (`prototype-switcher.ts`): `current` is the shipped header
 * as the baseline; `b` to `h` are the candidates. Nothing in `prototype-header/` ships: the
 * winning variant is rebuilt test-first into `app.html`, and this folder goes with the spike branch.
 */
export type HeaderVariantKey = 'current' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';

export interface HeaderVariantOption {
  readonly key: HeaderVariantKey;
  readonly name: string;
}

export const HEADER_VARIANTS: readonly HeaderVariantOption[] = [
  { key: 'current', name: 'Shipped header (baseline)' },
  { key: 'b', name: 'Pill tabs — segmented nav, no hamburger' },
  { key: 'c', name: 'App bar — bottom tabs on mobile' },
  { key: 'd', name: 'Editorial — centred wordmark, condenses on scroll' },
  { key: 'e', name: 'Floating capsule — no bar, glass island' },
  { key: 'f', name: 'Search-first — the header is the search' },
  { key: 'g', name: 'Side rail — vertical nav, no top bar' },
  { key: 'h', name: 'Two destinations — bottom tabs, find in the account menu' },
];

const STORAGE_KEY = 'riviera-prototype-header-variant';

function isKey(value: string | null | undefined): value is HeaderVariantKey {
  return HEADER_VARIANTS.some((option) => option.key === value);
}

/**
 * The selected header variant. `?variant=<key>` on any URL selects it; the choice is remembered in
 * storage so the real nav links (which drop the query) keep the variant across navigations.
 */
@Service()
export class PrototypeHeaderVariant {
  private readonly router = inject(Router);
  private readonly current = signal<HeaderVariantKey>(storedVariant());

  readonly options = HEADER_VARIANTS;
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

  select(key: HeaderVariantKey): void {
    this.apply(key);
    const tree = this.router.parseUrl(this.router.url);
    tree.queryParams = { ...tree.queryParams, variant: key };
    void this.router.navigateByUrl(tree, { replaceUrl: true });
  }

  cycle(step: 1 | -1): void {
    const index = HEADER_VARIANTS.findIndex((option) => option.key === this.current());
    const next = (index + step + HEADER_VARIANTS.length) % HEADER_VARIANTS.length;
    this.select(HEADER_VARIANTS[next].key);
  }

  private apply(key: HeaderVariantKey): void {
    this.current.set(key);
    writeStorage(STORAGE_KEY, key);
  }
}

function storedVariant(): HeaderVariantKey {
  const stored = readStorage(STORAGE_KEY);
  return isKey(stored) ? stored : 'current';
}
