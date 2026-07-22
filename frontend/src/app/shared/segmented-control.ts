import { Component, ElementRef, computed, input, model, viewChildren } from '@angular/core';

/** One choice in a {@link SegmentedControl}. `description` is rendered by the `card` variant only. */
export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
  readonly testId?: string;
}

/**
 * A reusable single-choice segmented control with full WAI-ARIA radiogroup semantics (S9 #277).
 * Two visual variants over one behaviour:
 *
 * - `pill` — the compact tab strip (label only), used for the sign-in audience switch.
 * - `card` — the taller side-by-side option cards with a blurb and a selected-state tick, used for
 *   the "I want to" role picker in register mode.
 *
 * Keyboard follows the radiogroup pattern rather than the button-list default: **roving tabindex**
 * (exactly one stop in the page's tab order — the checked option), arrows move the selection *and*
 * the focus, wrapping at both ends, with `Home`/`End` jumping to the extremes. Any other key is left
 * to the browser, so `Tab` still leaves the group. That is why this is a component and not two
 * hand-rolled button rows: the keyboard contract is the part that is easy to get subtly wrong, and
 * it is pinned once in `segmented-control.spec.ts` instead of per consumer.
 *
 * Styling is Tailwind on the host of each option (no `@apply` — sharing happens here, at the
 * component layer). Colours come from the `--riv-*` card tokens so the control is theme-agnostic;
 * the selected pill's solid white fill and the card variant's accent tint are the two literals, and
 * every ink/fill pair is composited in the consumer's `*.contrast.spec.ts`.
 */
@Component({
  selector: 'app-segmented-control',
  template: `
    <div [class]="groupClasses()" role="radiogroup" [attr.aria-label]="label()">
      @for (row of rows(); track row.option.value; let i = $index) {
        <button
          #optionButton
          type="button"
          role="radio"
          [class]="row.classes"
          [attr.aria-checked]="row.selected"
          [tabIndex]="row.selected ? 0 : -1"
          [attr.data-testid]="row.option.testId ?? null"
          (click)="select(i)"
          (keydown)="onKeydown($event)"
        >
          @if (variant() === 'card') {
            <span class="flex items-center gap-2 text-[14.5px] font-bold">
              {{ row.option.label }}
              @if (row.selected) {
                <span
                  data-riv-check
                  aria-hidden="true"
                  class="ml-auto text-[15px] text-(--riv-accent-ink)"
                  >&#10003;</span
                >
              }
            </span>
            <span class="mt-1 block text-[12px] leading-[1.35] text-(--riv-card-ink-faint)">{{
              row.option.description
            }}</span>
          } @else {
            {{ row.option.label }}
          }
        </button>
      }
    </div>
  `,
})
export class SegmentedControl<T extends string> {
  readonly options = input.required<readonly SegmentedOption<T>[]>();
  /** Two-way selected value — the control never owns the selection, it only proposes changes. */
  readonly value = model.required<T>();
  readonly variant = input<'pill' | 'card'>('pill');
  /** Accessible name for the radiogroup (axe requires one). */
  readonly label = input.required<string>();

  private readonly optionButtons = viewChildren<ElementRef<HTMLButtonElement>>('optionButton');

  /**
   * The host owns each option's whole class list via one `[class]` binding — mixing a static host
   * `class` with a dynamic one would have the dynamic binding replace the static (the `amenity-chip`
   * lesson), so the inert `segmented-option` marker class travels inside the computed string.
   */
  protected readonly rows = computed(() => {
    const selectedValue = this.value();
    return this.options().map((option) => {
      const selected = option.value === selectedValue;
      return { option, selected, classes: this.optionClasses(selected) };
    });
  });

  protected readonly groupClasses = computed(() =>
    this.variant() === 'pill'
      ? 'segmented-control flex gap-[6px] rounded-[14px] bg-(--riv-card-track) p-1'
      : 'segmented-control flex gap-2',
  );

  /**
   * Bound on each radio rather than on the group wrapper: arrow keys only ever arrive while one of
   * the radios has focus, and a keydown handler on a non-focusable `<div>` is an a11y-lint error
   * (`interactive-supports-focus`) — correctly so, since a keyboard user could never reach it.
   */
  protected onKeydown(event: KeyboardEvent): void {
    const count = this.options().length;
    if (count === 0) {
      return;
    }
    // -1 (value matches no option) behaves as "before the first", so the first arrow lands on 0.
    const current = this.rows().findIndex((row) => row.selected);
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (current + 1) % count;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (current - 1 + count) % count;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      default:
        return; // Tab, Escape, typing — the browser keeps its default behaviour
    }
    event.preventDefault();
    this.select(next);
  }

  protected select(index: number): void {
    const option = this.options()[index];
    if (!option) {
      return;
    }
    if (option.value !== this.value()) {
      this.value.set(option.value);
    }
    // Focus follows selection in a radiogroup — also on click, which Safari does not focus.
    this.optionButtons()[index]?.nativeElement.focus();
  }

  private optionClasses(selected: boolean): string {
    const base =
      'segmented-option flex-1 cursor-pointer font-[inherit] transition-[background,box-shadow,border-color] duration-150 motion-reduce:transition-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-(--riv-accent-ink)';
    if (this.variant() === 'pill') {
      return (
        `${base} rounded-[11px] border-0 py-[9px] text-[13.5px] ` +
        (selected
          ? 'font-bold text-(--riv-accent-ink) bg-white shadow-[0_4px_12px_rgba(7,42,58,0.16)]'
          // ink-soft, not faint: the track tint drops 0.72 to 4.38:1 on the darkest riviera stop.
          : 'font-semibold text-(--riv-card-ink-soft) bg-transparent')
      );
    }
    // 1.5px in BOTH states (design thickens only the selected): constant width, no reflow on switch.
    return (
      `${base} rounded-[18px] border-[1.5px] px-[15px] py-3.5 text-left text-(--riv-card-ink) shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] ` +
      (selected
        ? 'bg-[rgba(43,184,212,0.16)] border-[rgba(14,138,168,0.75)]'
        : 'bg-[rgba(255,255,255,0.5)] border-[rgba(255,255,255,0.7)]')
    );
  }
}
