import { DestroyRef, inject, Signal, signal } from '@angular/core';

/** Tailwind's `sm` boundary as a media query, so a signal and a `max-sm:` utility flip together. */
export const BELOW_SM = '(width < 40rem)';

/**
 * True while the viewport is below `sm`. Injection context only. Where `matchMedia` is missing
 * (jsdom) it stays false, so a unit spec renders the wide layout unless it stubs the query.
 */
export function belowSm(): Signal<boolean> {
  const below = signal(false);
  if (typeof globalThis.matchMedia !== 'function') {
    return below.asReadonly();
  }
  const query = globalThis.matchMedia(BELOW_SM);
  below.set(query.matches);
  const onChange = (event: MediaQueryListEvent): void => below.set(event.matches);
  query.addEventListener('change', onChange);
  inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
  return below.asReadonly();
}
