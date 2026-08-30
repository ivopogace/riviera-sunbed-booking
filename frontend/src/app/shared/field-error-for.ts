import { Directive, effect, input } from '@angular/core';

let nextFieldErrorId = 0;

function nextFieldErrorElementId(): string {
  nextFieldErrorId += 1;
  return `riv-field-error-${nextFieldErrorId}`;
}

/**
 * Associates an inline field error with the control it belongs to: while this element is in the
 * DOM, the control names it through `aria-describedby` and carries `aria-invalid="true"`.
 *
 * <p>Applied to the ERROR element, taking the control's template reference, so the association's
 * lifetime is the error's own — `@if` removing the error removes the reference with it, and a stale
 * `aria-describedby` cannot be written. A dangling reference is only an axe *incomplete*, which
 * `expectNoAxeViolations` does not fail on, so this is structure rather than a test.
 *
 * <p>The directive is the sole writer of `aria-invalid` in this app; pre-existing
 * `aria-describedby` tokens are preserved and kept first, so a hint reads before the error.
 */
@Directive({
  selector: '[appFieldErrorFor]',
  host: { '[attr.id]': 'id' },
})
export class FieldErrorFor {
  readonly control = input.required<HTMLElement>({ alias: 'appFieldErrorFor' });

  protected readonly id = nextFieldErrorElementId();

  constructor() {
    effect((onCleanup) => {
      const control = this.control();
      const before = control.getAttribute('aria-describedby');
      control.setAttribute('aria-describedby', before ? `${before} ${this.id}` : this.id);
      control.setAttribute('aria-invalid', 'true');
      onCleanup(() => {
        const rest = (control.getAttribute('aria-describedby') ?? '')
          .split(/\s+/)
          .filter((token) => token && token !== this.id);
        if (rest.length) {
          control.setAttribute('aria-describedby', rest.join(' '));
        } else {
          control.removeAttribute('aria-describedby');
        }
        control.removeAttribute('aria-invalid');
      });
    });
  }
}
