/** PROTOTYPE — throwaway. Every state the variants carry lives in the URL so any screen is linkable. */
import { inject, Injectable, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export type Variant = 'a' | 'b' | 'c' | 'd';
export const VARIANTS: readonly { key: Variant; name: string }[] = [
  { key: 'a', name: 'Wide chart + shelf' },
  { key: 'b', name: 'Coast spine' },
  { key: 'c', name: 'Bay by bay' },
  { key: 'd', name: 'Thumb sheet (mobile-first)' },
];

export interface ProtoParams {
  readonly variant: Variant;
  readonly date: string;
  readonly beach: string;
  readonly venue: string | null;
  /** D's sheet: `peek` (map first), `half` (list over the map), `full` (list only). */
  readonly sheet: 'peek' | 'half' | 'full';
  /** C's current bay, a catalogue code. */
  readonly bay: string;
  /** B's spine: `coast` (the whole coast) or a beach the camera has flown to. */
  readonly zoomed: string;
}

const DEFAULT_DATE = '2026-07-18';

@Injectable()
export class ProtoState {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly params = signal<ProtoParams>(this.read(this.route.snapshot.queryParamMap));

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((map) => this.params.set(this.read(map)));
  }

  private read(map: { get(name: string): string | null }): ProtoParams {
    const variant = (map.get('variant') ?? 'a').toLowerCase();
    const sheet = map.get('sheet') ?? 'peek';
    return {
      variant: (['a', 'b', 'c', 'd'].includes(variant) ? variant : 'a') as Variant,
      date: map.get('date') ?? DEFAULT_DATE,
      beach: map.get('beach') ?? '',
      venue: map.get('venue'),
      sheet: sheet === 'half' || sheet === 'full' ? sheet : 'peek',
      bay: map.get('bay') ?? 'DHERMI',
      zoomed: map.get('zoomed') ?? 'coast',
    };
  }

  /** Merge into the query string; `null` removes a key. Replaces history so back stays the page before. */
  set(patch: Partial<Record<keyof ProtoParams, string | null>>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: patch,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
