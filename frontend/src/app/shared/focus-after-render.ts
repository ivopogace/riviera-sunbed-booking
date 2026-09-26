import { afterNextRender, ElementRef, inject, Injector } from '@angular/core';

/**
 * Build a `(testId, fallbackTestId?) => void` that, after the next render, focuses the component's
 * `[data-testid]` element (else fallback, else host), made focusable first. Injection context only;
 * `preventScroll` keeps a scroller from undoing it. Rationale: RESPONSIBILITIES.md §Frontend.
 */
export function focusMover(options?: {
  readonly preventScroll?: boolean;
}): (testId: string, fallbackTestId?: string) => void {
  const host = inject<ElementRef<HTMLElement>>(ElementRef);
  const injector = inject(Injector);
  return (testId: string, fallbackTestId?: string) =>
    afterNextRender(
      {
        earlyRead: () => landingSpot(host.nativeElement, testId, fallbackTestId),
        write: (target) => {
          // A landmark is usually a <p>/<span>/host: focusable only once it says so.
          if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) {
            target.tabIndex = -1;
          }
          target.focus({ preventScroll: options?.preventScroll ?? false });
        },
      },
      { injector },
    );
}

function landingSpot(host: HTMLElement, testId: string, fallbackTestId?: string): HTMLElement {
  return byTestId(host, testId) ?? (fallbackTestId ? byTestId(host, fallbackTestId) : null) ?? host;
}

function byTestId(host: HTMLElement, testId: string): HTMLElement | null {
  return host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}
