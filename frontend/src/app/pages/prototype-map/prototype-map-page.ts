import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { PROTOTYPE_PINS, PROTOTYPE_VENUES } from './fixture';
import { VariantA } from './variant-a-canvas';
import { VariantB } from './variant-b-ledger';
import { VariantC } from './variant-c-wall';
import { VariantD } from './variant-d-pocket';

type Variant = 'a' | 'b' | 'c' | 'd';

const VARIANTS: readonly Variant[] = ['a', 'b', 'c', 'd'];
const DEFAULT_DATE = '2026-07-15';

function isVariant(value: string | null): value is Variant {
  return (VARIANTS as readonly string[]).includes(value ?? '');
}

/**
 * PROTOTYPE — spike branch only (issue: riviera-map desktop-placement design question), never
 * shipped. `/prototype/map-desktop?variant=<a|b|c|d>&venue=<id>&date=<iso>` — every screen state
 * is seedable from the URL. Four variants answer "where does the riviera map belong on Discover,
 * and what is the page FOR" with genuinely different layouts; `README.md` beside this file is the
 * write-up. The floating switcher is deliberately ugly — it is a review tool, not part of any
 * variant's design language.
 */
@Component({
  selector: 'app-prototype-map-page',
  imports: [VariantA, VariantB, VariantC, VariantD],
  host: { class: 'block' },
  template: `
    <div class="min-h-screen w-full">
      @switch (variant()) {
        @case ('a') {
          <app-variant-a
            [venues]="venues"
            [pins]="pins"
            [date]="date()"
            [selected]="selected()"
            (venueSelected)="onSelect($event)"
          />
        }
        @case ('b') {
          <app-variant-b
            [venues]="venues"
            [pins]="pins"
            [date]="date()"
            [selected]="selected()"
            (venueSelected)="onSelect($event)"
          />
        }
        @case ('c') {
          <app-variant-c
            [venues]="venues"
            [pins]="pins"
            [date]="date()"
            [selected]="selected()"
            (venueSelected)="onSelect($event)"
          />
        }
        @case ('d') {
          <app-variant-d
            [venues]="venues"
            [pins]="pins"
            [date]="date()"
            [selected]="selected()"
            (venueSelected)="onSelect($event)"
          />
        }
      }
    </div>

    <!-- Deliberately ugly review tool — not part of any variant's design language (spike brief). -->
    <nav
      style="position:fixed;bottom:8px;left:8px;z-index:9999;background:#ff0;border:4px dashed #f0f;
        padding:6px 8px;font-family:'Comic Sans MS',cursive;font-size:13px;display:flex;gap:6px;
        box-shadow:0 0 0 2px #000;"
      aria-label="Prototype variant switcher"
      data-testid="variant-switcher"
    >
      @for (letter of variants; track letter) {
        <a
          [href]="hrefFor(letter)"
          [style.background]="letter === variant() ? '#0f0' : '#fff'"
          style="color:#000;text-decoration:underline;padding:2px 6px;border:2px solid #000;"
          >VARIANT {{ letter.toUpperCase() }}</a
        >
      }
    </nav>
  `,
})
export class PrototypeMapPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly venues = PROTOTYPE_VENUES;
  protected readonly pins = PROTOTYPE_PINS;
  protected readonly variants = VARIANTS;

  protected readonly variant = signal<Variant>('a');
  protected readonly date = signal(DEFAULT_DATE);
  protected readonly selected = signal<string | null>(null);

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const variantParam = params.get('variant');
      this.variant.set(isVariant(variantParam) ? variantParam : 'a');
      this.date.set(params.get('date') ?? DEFAULT_DATE);
      this.selected.set(params.get('venue'));
    });
  }

  protected onSelect(id: string | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { venue: id },
      queryParamsHandling: 'merge',
    });
  }

  protected hrefFor(letter: Variant): string {
    const params = new URLSearchParams(window.location.search);
    params.set('variant', letter);
    return `?${params.toString()}`;
  }
}
