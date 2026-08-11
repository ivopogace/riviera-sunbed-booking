import { afterNextRender, ElementRef, inject, Injector } from '@angular/core';

/**
 * Build a `(testId, fallbackTestId?) => void` that moves keyboard focus onto the calling component's
 * own `[data-testid="…"]` element once the next render has committed.
 *
 * <p>Confirm-before-destroy surfaces destroy the element just activated, stranding focus on `<body>`
 * unless it is moved deliberately (WCAG 2.4.3). The target rarely exists yet when the transition is
 * decided, so the lookup runs in `earlyRead` and the `focus()` in `write`.
 *
 * <p>Focus always lands somewhere — primary, else `fallbackTestId`, else the component host — and
 * whatever it lands on is made focusable first, so a landmark missing its own `tabindex="-1"` cannot
 * silently swallow the move. Must be called from an injection context, like `parentVenueId(route)`.
 */
export function focusMover(): (testId: string, fallbackTestId?: string) => void {
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
          target.focus();
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
