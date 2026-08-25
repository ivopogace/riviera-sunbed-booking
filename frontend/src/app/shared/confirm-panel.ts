import { afterNextRender, Component, ElementRef, input, output, viewChild } from '@angular/core';

import { TouchTarget } from './touch-target';

/** Which ink the confirm button carries — the two the operator console already ships. */
export type ConfirmTone = 'destructive' | 'primary';

const CONFIRM_BUTTON: Record<ConfirmTone, string> = {
  destructive: 'rounded-[10px] bg-[#a3160e] px-4 py-1.5 text-[12.5px] font-bold text-white',
  primary: 'rounded-[10px] bg-[#0a5f74] px-4 py-1.5 text-[12.5px] font-bold text-white',
};

/**
 * The operator console's confirm-before-destroy panel: an amber `alertdialog` card carrying a
 * warning, a toned confirm button and a Cancel. The admin console's confirmations are a different
 * surface — bare, reason-collecting, keyed per row — and use `ConfirmWithReason` instead.
 *
 * <p><strong>Keep the `@if` outside this component</strong>: it is created and destroyed with the
 * confirmation, which is what lets it focus its own confirm button on the way in (WCAG 2.4.3).
 * Focus back **out** is the caller's, via `focusMover()` — this component is gone by then.
 *
 * <p>Why two components rather than one with a variant, and why no projected content:
 * `docs/plans/shared-confirm-panel.md`.
 */
@Component({
  imports: [TouchTarget],
  selector: 'app-confirm-panel',
  host: {
    role: 'alertdialog',
    '[attr.aria-label]': 'label()',
    '[attr.data-testid]': 'panelTestId()',
    class: 'mt-3 block rounded-[12px] border border-[#e0a03a]/60 bg-[#fff4e0] px-3 py-2.5',
  },
  template: `
    <p class="text-[12.5px] font-semibold leading-[1.45] text-[#7a4a08]">{{ message() }}</p>
    <div class="mt-2 flex flex-wrap gap-2">
      <button
        appTouchTarget
        #confirmButton
        type="button"
        [class]="confirmClass()"
        [attr.data-testid]="confirmTestId()"
        (click)="confirmed.emit()"
      >
        {{ confirmLabel() }}
      </button>
      <button
        appTouchTarget
        type="button"
        class="rounded-[10px] border border-riv-card-border px-4 py-1.5 text-[12.5px] font-semibold text-riv-card-ink"
        [attr.data-testid]="cancelTestId()"
        (click)="cancelled.emit()"
      >
        Cancel
      </button>
    </div>
  `,
})
export class ConfirmPanel {
  /** The dialog's accessible name. */
  readonly label = input.required<string>();
  /** The warning shown above the actions — what confirming will destroy. */
  readonly message = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly tone = input<ConfirmTone>('destructive');
  readonly panelTestId = input.required<string>();
  readonly confirmTestId = input.required<string>();
  readonly cancelTestId = input.required<string>();

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly confirmButton =
    viewChild.required<ElementRef<HTMLButtonElement>>('confirmButton');

  protected confirmClass(): string {
    return CONFIRM_BUTTON[this.tone()];
  }

  constructor() {
    afterNextRender({ write: () => this.confirmButton().nativeElement.focus() });
  }
}
