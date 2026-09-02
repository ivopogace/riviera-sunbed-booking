import { afterNextRender, Component, ElementRef, input, output, viewChild } from '@angular/core';

import { BusyAction } from './busy-action';
import { TouchTarget } from './touch-target';

/** Which ink the confirm button carries — the three the operator console ships. */
export type ConfirmTone = 'destructive' | 'primary' | 'warn';

const CONFIRM_BUTTON: Record<ConfirmTone, string> = {
  destructive:
    'rounded-[10px] bg-riv-solid-fill-danger px-4 py-1.5 text-[12.5px] font-bold text-white aria-disabled:opacity-60',
  primary:
    'rounded-[10px] bg-riv-solid-fill-brand px-4 py-1.5 text-[12.5px] font-bold text-white aria-disabled:opacity-60',
  warn: 'rounded-[10px] bg-riv-solid-fill-warn px-4 py-1.5 text-[12.5px] font-bold text-white aria-disabled:opacity-60',
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
 * RV-FE-9 in `riviera-review-overlay`. `headline` is plain text too, for the same reason —
 * an optional bold lead sentence ahead of `message`, never markup.
 */
@Component({
  imports: [TouchTarget, BusyAction],
  selector: 'app-confirm-panel',
  host: {
    role: 'alertdialog',
    '[attr.aria-label]': 'label()',
    '[attr.data-testid]': 'panelTestId()',
    class: 'mt-3 block rounded-[12px] border border-riv-warn-edge/60 bg-riv-warn-fill px-3 py-2.5',
  },
  template: `
    <p class="text-[12.5px] font-semibold leading-[1.45] text-riv-warn-ink">
      @if (headline(); as h) {
        <strong>{{ h }}</strong>
      }
      {{ message() }}
    </p>
    <div class="mt-2 flex flex-wrap gap-2">
      <button
        appTouchTarget
        #confirmButton
        type="button"
        [class]="confirmClass()"
        [attr.data-testid]="confirmTestId()"
        [appBusy]="busy()"
        (click)="confirmed.emit()"
      >
        {{ confirmLabel() }}
      </button>
      <button
        appTouchTarget
        type="button"
        class="rounded-[10px] border border-riv-card-border px-4 py-1.5 text-[12.5px] font-semibold text-riv-card-ink aria-disabled:opacity-60"
        [attr.data-testid]="cancelTestId()"
        [appBusy]="busy()"
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
  /** An optional bold lead sentence, rendered before `message` — plain text, never markup. */
  readonly headline = input<string>();
  /** The warning shown above the actions — what confirming will destroy. */
  readonly message = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly tone = input<ConfirmTone>('destructive');
  /** True while the caller's write is in flight — blocks both actions (neither is safe mid-write). */
  readonly busy = input(false);
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
