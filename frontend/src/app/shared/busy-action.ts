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
 * <p>Because `aria-disabled` is only an announcement, this also has to make the control inert, which
 * it does by consuming the activating click ahead of the host's own handler. **That covers pointer
 * clicks and Enter/Space on the control itself, which a button reports as a click — it does not
 * cover submitting a form with Enter from a text field, which never reaches the button.** A busy
 * submit button therefore still needs the re-entrancy guard in its own submit handler; this
 * directive narrows that duty rather than retiring it.
 *
 * <p>Deliberately carries **no styling**: the dim values in use genuinely differ across the app
 * (`opacity-50`/`-60`/`-65`), so each consumer keeps its own utility with the `aria-disabled:`
 * variant. Rationale and the full sweep: `docs/plans/confirm-focus-busy-posture.md`.
 */
@Directive({
  selector: '[appBusy]',
  host: { '[attr.aria-disabled]': 'appBusy() || null' },
})
export class BusyAction {
  readonly appBusy = input(false);

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    // Native, not a host binding: Angular coalesces same-element listeners into one native
    // listener and walks its own chain, which stopImmediatePropagation cannot break.
    host.addEventListener('click', (event) => this.blockWhileBusy(event), { capture: true });
  }

  private blockWhileBusy(event: Event): void {
    if (this.appBusy()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
}
