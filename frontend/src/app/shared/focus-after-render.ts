import { afterNextRender, ElementRef, inject, Injector } from '@angular/core';

/**
 * Build a `(testId) => void` that moves keyboard focus onto the calling component's own
 * `[data-testid="…"]` element once the next render has committed.
 *
 * <p>Confirm-before-destroy surfaces destroy the element that was just activated, which strands
 * keyboard and AT focus on `<body>` unless it is moved deliberately (WCAG 2.4.3). Because the
 * target usually does not exist yet when the transition is decided, the lookup runs in
 * `earlyRead` — against the committed DOM — and the `focus()` in `write`. A test id that matches
 * nothing is a no-op, so a caller may aim at an element a later state removes.
 *
 * <p>Must be called from an injection context (a field initializer or constructor); it captures
 * the host and injector once, mirroring `parentVenueId(this.route)`.
 */
export function focusMover(): (testId: string) => void {
  const host: ElementRef<HTMLElement> = inject(ElementRef);
  const injector = inject(Injector);
  return (testId: string) =>
    afterNextRender(
      {
        earlyRead: () => host.nativeElement.querySelector<HTMLElement>(`[data-testid="${testId}"]`),
        write: (target) => target?.focus(),
      },
      { injector },
    );
}
