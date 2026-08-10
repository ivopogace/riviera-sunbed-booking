import {
  afterNextRender,
  Component,
  ElementRef,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';

/**
 * The admin console's confirm-before-destroy panel: a prompt, the optional grounds the audit trail
 * records (ADR-0013), and an outlined destructive action beside a way out.
 *
 * <p>It is deliberately **bare** — no card of its own. Both callers already sit inside a row or slot
 * card, so bringing a surface would double the framing; the host is `block w-full` so it occupies
 * exactly the flow position the markup it replaced did.
 *
 * <p><strong>The caller keeps the `@if` outside</strong>, so this is created and destroyed with the
 * confirmation and can focus its own confirm button on the way in (WCAG 2.4.3). Focus **out** is the
 * caller's, via `focusMover()` — by then this component is gone.
 *
 * <p>The operator console's confirmations are a different surface — an amber card, no reason field —
 * and use `ConfirmPanel` instead.
 */
@Component({
  selector: 'app-confirm-with-reason',
  host: {
    role: 'alertdialog',
    '[attr.aria-label]': 'label()',
    '[attr.data-testid]': 'panelTestId()',
    class: 'block w-full',
  },
  template: `
    <p class="text-[14px] text-(--riv-card-ink)" [attr.data-testid]="promptTestId()">
      {{ prompt() }}
    </p>
    <label
      [attr.for]="reasonId()"
      class="mt-2 block text-[13.5px] font-semibold text-(--riv-card-ink)"
      >Reason (optional)</label
    >
    <input
      type="text"
      maxlength="500"
      [attr.id]="reasonId()"
      [attr.data-testid]="reasonId()"
      [value]="reason()"
      [placeholder]="reasonPlaceholder()"
      (input)="onTyped($event)"
      class="mt-1 w-full rounded-[10px] border border-(--riv-field-border) bg-white/70 px-3 py-2 text-[14px] text-(--riv-card-ink)"
    />
    <div class="mt-2 flex flex-wrap items-center gap-2">
      <button
        #confirmButton
        type="button"
        [attr.data-testid]="confirmTestId()"
        [disabled]="busy()"
        (click)="confirmed.emit()"
        class="rounded-[10px] border border-[#b3261e] px-4 py-2 text-[14px] font-semibold text-[#b3261e] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {{ confirmLabel() }}
      </button>
      <button
        type="button"
        [attr.data-testid]="cancelTestId()"
        (click)="cancelled.emit()"
        class="rounded-[10px] px-3 py-2 text-[14px] font-semibold text-(--riv-card-ink-soft)"
      >
        {{ cancelLabel() }}
      </button>
    </div>
  `,
})
export class ConfirmWithReason {
  /** The dialog's accessible name. */
  readonly label = input.required<string>();
  /** The question put to the admin — what confirming will destroy, and that it is final. */
  readonly prompt = input.required<string>();
  readonly promptTestId = input.required<string>();
  /** One id for the field's `id`, its label's `for` and its test hook — all three are the same today. */
  readonly reasonId = input.required<string>();
  readonly reasonPlaceholder = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly cancelLabel = input.required<string>();
  readonly panelTestId = input.required<string>();
  readonly confirmTestId = input.required<string>();
  readonly cancelTestId = input.required<string>();
  /** True while the caller's write is in flight — disables the destructive action, never the way out. */
  readonly busy = input(false);

  /** The grounds, owned by the caller: it clears them per open and sends them with the write. */
  readonly reason = model.required<string>();

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly confirmButton =
    viewChild.required<ElementRef<HTMLButtonElement>>('confirmButton');

  protected onTyped(event: Event): void {
    this.reason.set((event.target as HTMLInputElement).value);
  }

  constructor() {
    afterNextRender({ write: () => this.confirmButton().nativeElement.focus() });
  }
}
