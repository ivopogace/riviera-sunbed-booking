import { Directive, ElementRef, inject, input } from '@angular/core';

/**
 * The posture for a control whose own activation started the write it is now waiting on:
 * `<button [appBusy]="saving()" (click)="save()">`.
 *
 * <p>It replaces `[disabled]="saving()"`, which cannot be used here. A browser runs the unfocusing
 * steps the instant a focused element is disabled, so the control the user just pressed loses focus
 * to `<body>` for the whole request — on a slow connection, seconds in which Tab jumps to the top of
 * the document and Shift+Tab leaves the app entirely (WCAG 2.4.3). `aria-disabled` announces the
 * same unavailable state without touching focus or the tab order.
 *
 * <p>**For buttons only.** `aria-disabled` is an announcement, so inertness comes from consuming the
 * activating click — which covers a button's pointer, Enter and Space, but never a text field's
 * typing or a form submitted by Enter. Use the native `[disabled]` on inputs and keep the
 * re-entrancy guard in every submit handler.
 *
 * <p>Carries no styling: each consumer keeps its own dim utility under the `aria-disabled:` variant.
 * Why a capture-phase listener, and the full sweep: `docs/plans/confirm-focus-busy-posture.md`.
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
