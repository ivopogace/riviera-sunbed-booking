import { afterNextRender, ElementRef, inject, Injector } from '@angular/core';

/**
 * A focus mover for the calling component: moves focus to a `data-testid`'d element inside its own
 * host, once the render that creates that element has landed.
 *
 * <p>Every confirm-before-destroy surface needs this for the same reason — activating a control that
 * the activation itself destroys strands keyboard and AT focus on `<body>` (WCAG 2.4.3) — so the
 * choreography lives in ONE place and cannot drift between copies, the rule `trapFocusWithin`
 * already follows. Call it in an injection context (a field initializer); the mover it returns can
 * be called from anywhere and no-ops when the target is absent.
 *
 * <p>The phases are split rather than passing a bare callback, which Angular runs in
 * `mixedReadWrite` — a phase its own docs say never to use when the work divides, and warn costs DOM
 * reflows. Here it divides exactly: finding the element is a read, focusing it is a write.
 */
export function hostFocusMover(): (testId: string) => void {
  const host = inject<ElementRef<HTMLElement>>(ElementRef);
  const injector = inject(Injector);
  return (testId) =>
    afterNextRender(
      {
        earlyRead: () => host.nativeElement.querySelector<HTMLElement>(`[data-testid="${testId}"]`),
        write: (target) => target?.focus(),
      },
      { injector },
    );
}
