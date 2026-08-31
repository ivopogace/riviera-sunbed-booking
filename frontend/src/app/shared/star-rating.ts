import { Component, ElementRef, computed, input, model, viewChildren } from '@angular/core';
import { FormValueControl, ValidationError, WithOptionalFieldTree } from '@angular/forms/signals';

import { FieldErrorFor } from './field-error-for';
import { TouchTarget } from './touch-target';

/** The rating scale — 1..5 stars, the range the backend's `review_stars_check` also bounds. */
const STARS = [1, 2, 3, 4, 5] as const;

/**
 * A 1–5 star input with full WAI-ARIA radiogroup semantics, usable as a Signal Forms field.
 *
 * Implementing {@link FormValueControl} is what makes `[formField]="form.stars"` work: the `value`
 * model is two-way-bound by the `Field` directive, so this control only ever *displays* state and
 * proposes changes — validation lives in the form schema, never here. That also makes it a drop-in
 * field for a richer review form later, rather than a widget the panel has to wire by hand.
 *
 * Keyboard follows the radiogroup pattern rather than the button-list default, cloned from
 * {@link SegmentedControl}: **roving tabindex** (exactly one stop in the page's tab order — the
 * checked star, or the first when none is), arrows move the selection *and* the focus with wrapping,
 * and `Home`/`End` jump to the extremes. Any other key is left to the browser, so `Tab` still
 * leaves the group.
 *
 * Selection is conveyed by a filled ★ against an outline ☆, never by colour alone (WCAG 1.4.1), and
 * each star carries its own accessible name ("4 stars"), so a screen-reader user hears what they are
 * choosing rather than a position. Styling is token-first Tailwind on the host of each star.
 *
 * The optional `invalid`/`errors` inputs are part of the `FormValueControl` contract — the
 * `Field` directive auto-wires them from the schema's `required` rule, no plumbing needed beyond
 * declaring them (angular.dev v22 Custom Controls guide). `submitAttempted` is this component's
 * own addition, mirroring the gate every sibling field on the review form already uses: the
 * error shows only once a submit has been tried, never on first render of an empty group.
 */
@Component({
  imports: [FieldErrorFor, TouchTarget],
  selector: 'app-star-rating',
  template: `
    <div class="flex flex-col gap-1.5">
      <div class="star-rating flex gap-1" role="radiogroup" [attr.aria-label]="label()" #radiogroup>
        @for (row of rows(); track row.stars) {
          <button
            appTouchTarget
            #starButton
            type="button"
            role="radio"
            [class]="starClasses"
            [attr.aria-checked]="row.chosen"
            [attr.aria-label]="row.label"
            [tabIndex]="row.tabStop ? 0 : -1"
            [attr.data-testid]="'star-' + row.stars"
            (click)="select(row.stars)"
            (keydown)="onKeydown($event)"
          >
            <span aria-hidden="true">{{ row.selected ? '★' : '☆' }}</span>
          </button>
        }
      </div>
      @if (submitAttempted() && invalid()) {
        <span
          [appFieldErrorFor]="radiogroup"
          class="text-[12px] font-semibold text-riv-error-ink"
          role="alert"
          data-testid="star-rating-error"
          >{{ errors()[0].message }}</span
        >
      }
    </div>
  `,
})
export class StarRating implements FormValueControl<number | null> {
  /**
   * The chosen rating, or `null` while none is. A `model()` because that is the contract the
   * `Field` directive binds to — the schema decides whether `null` is acceptable.
   */
  readonly value = model<number | null>(null);
  /** Accessible name for the radiogroup (axe requires one). */
  readonly label = input.required<string>();
  /** Whether the field is currently invalid — bound automatically by the `Field` directive. */
  readonly invalid = input(false);
  /** The schema's validation errors for this field — bound automatically by the `Field` directive. */
  readonly errors = input<readonly WithOptionalFieldTree<ValidationError>[]>([]);
  /** Whether the caller's form has had a submit attempt — gates the inline error, like every sibling field. */
  readonly submitAttempted = input(false);

  private readonly starButtons = viewChildren<ElementRef<HTMLButtonElement>>('starButton');

  /**
   * One `[class]` binding owns each star's whole list — mixing a static `class` with a dynamic one
   * lets the dynamic binding replace the static (the `segmented-control` lesson). The state classes
   * are deliberately absent: the glyph carries selection, so the skin never has to.
   */
  protected readonly starClasses =
    'star cursor-pointer border-0 bg-transparent px-1 font-[inherit] text-[30px] leading-none text-riv-accent-ink [transition:transform_0.12s_ease] hover:scale-110 motion-reduce:transition-none motion-reduce:hover:scale-100 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-riv-accent-ink';

  protected readonly rows = computed(() => {
    const selected = this.value();
    return STARS.map((stars) => ({
      stars,
      // Filled cumulatively, so the glyphs read as a rating…
      selected: selected !== null && stars <= selected,
      // …but exactly ONE radio is checked, or a reader announces the first filled star instead.
      chosen: stars === selected,
      // No selection yet ⇒ the first star is the group's single tab stop (APG radiogroup).
      tabStop: selected === null ? stars === STARS[0] : stars === selected,
      label: stars === 1 ? '1 star' : `${stars} stars`,
    }));
  });

  /**
   * Bound on each star rather than on the group wrapper: arrow keys only ever arrive while a star
   * has focus, and a keydown handler on a non-focusable `<div>` is an a11y-lint error
   * (`interactive-supports-focus`) — correctly so, since a keyboard user could never reach it.
   */
  protected onKeydown(event: KeyboardEvent): void {
    const count = STARS.length;
    const chosen = this.value();
    // Nothing chosen has no index, so each direction names its own entry point, then wraps.
    const current = chosen === null ? null : chosen - 1;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = current === null ? 0 : (current + 1) % count;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = current === null ? count - 1 : (current - 1 + count) % count;
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
    this.select(STARS[next]);
  }

  protected select(stars: number): void {
    if (stars !== this.value()) {
      this.value.set(stars);
    }
    // Focus follows selection in a radiogroup — also on click, which Safari does not focus.
    this.starButtons()[stars - 1]?.nativeElement.focus();
  }
}
