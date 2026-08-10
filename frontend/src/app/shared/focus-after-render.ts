import { afterNextRender, ElementRef, inject, Injector } from '@angular/core';

/**
 * Build a `(testId, fallbackTestId?) => void` that moves keyboard focus onto the calling component's
 * own `[data-testid="…"]` element once the next render has committed.
 *
 * <p>Confirm-before-destroy surfaces destroy the element that was just activated, which strands
 * keyboard and AT focus on `<body>` unless it is moved deliberately (WCAG 2.4.3). Because the
 * target usually does not exist yet when the transition is decided, the lookup runs in
 * `earlyRead` — against the committed DOM — and the `focus()` in `write`.
 *
 * <p>Focus always lands somewhere: the primary target, else the optional `fallbackTestId`, else the
 * component host. A caller aims at an element a concurrent render can remove, so a missed target is
 * a real race and not a caller error — and silently doing nothing there is indistinguishable from
 * the bug this helper exists to fix. Whatever it lands on is made programmatically focusable first,
 * so naming a landmark that forgot its own `tabindex="-1"` cannot reintroduce that silence.
 *
 * <p>Must be called from an injection context (a field initializer or constructor); it captures
 * the host and injector once, mirroring `parentVenueId(this.route)`.
 */
export function focusMover(): (testId: string, fallbackTestId?: string) => void {
  const host: ElementRef<HTMLElement> = inject(ElementRef);
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
