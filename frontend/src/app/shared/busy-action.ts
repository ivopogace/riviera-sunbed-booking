import { Directive, ElementRef, inject, input } from '@angular/core';

/**
 * For a button whose own click started the write it awaits: `[appBusy]="saving()"`, never
 * `[disabled]`, which blurs focus to `<body>` (WCAG 2.4.3); `aria-disabled` says it without moving
 * focus. **Buttons only**: it consumes the activating click, which typing and Enter-submit never
 * reach (other controls: the carve-out in `frontend/.claude/CLAUDE.md`). Handlers keep their
 * re-entrancy guard; consumers keep their `aria-disabled:` styling. A native capture listener:
 * Angular coalesces a host listener with the consumer's, so its `stopImmediatePropagation` can't.
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
