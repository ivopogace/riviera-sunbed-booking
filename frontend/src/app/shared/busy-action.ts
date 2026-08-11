import { Directive, ElementRef, inject, input } from '@angular/core';

/**
 * The posture for a control whose own activation started the write it is now waiting on:
 * `<button [appBusy]="saving()" (click)="save()">`.
 *
 * <p>It replaces `[disabled]="saving()"`, which blurs the pressed control to `<body>` for the whole
 * request (WCAG 2.4.3); `aria-disabled` announces the same state without touching focus.
 *
 * <p>**For buttons only** — inertness comes from consuming the activating click, which a text field's
 * typing and a form's Enter-submit never reach. An input keeps the native `[disabled]` **when a button
 * starts the write**; a control that starts its own write needs a different lock, which varies by
 * control kind — see the carve-out in `frontend/.claude/CLAUDE.md`. Every submit handler keeps its
 * re-entrancy guard. Carries no styling; each consumer keeps its own `aria-disabled:` utility.
 * Why a capture-phase listener: `docs/plans/confirm-focus-busy-posture.md`.
 */
@Directive({
  selector: '[appBusy]',
  host: { '[attr.aria-disabled]': 'appBusy() || null' },
})
export class BusyAction {
  readonly appBusy = input(false);

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    host.addEventListener('click', (event) => this.blockWhileBusy(event), { capture: true });
  }

  private blockWhileBusy(event: Event): void {
    if (this.appBusy()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
}
