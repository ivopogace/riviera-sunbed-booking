import { Directive, effect, input } from '@angular/core';

let nextFieldErrorId = 0;

function nextFieldErrorElementId(): string {
  nextFieldErrorId += 1;
  return `riv-field-error-${nextFieldErrorId}`;
}

/**
 * Put on an inline field error, bound to its control's template ref: while the error is in the DOM,
 * the control lists it in `aria-describedby` after any existing hint and, unless
 * `appFieldErrorForInvalidValue` is false, carries `aria-invalid` (sole writer). Declare the ref in
 * the same view or `@for` body so the control outlives the error. Limits: `aria-invalid` is not
 * ref-counted (two errors on one control need that); an `[attr.aria-describedby]` binding on the
 * control drops the token; ids are process-monotonic, so read `error.id` back. Rules: RV-FE-11.
 */
@Directive({
  selector: '[appFieldErrorFor]',
  host: { '[attr.id]': 'id' },
})
export class FieldErrorFor {
  readonly control = input.required<HTMLElement>({ alias: 'appFieldErrorFor' });

  /**
   * Whether the error means the control's own value is wrong (ARIA21's `aria-invalid` condition).
   * Default `true`, for a validation error; bind `false` for a failed *write* (a 403, an expired
   * session): the control is then described but never marked invalid.
   */
  readonly appFieldErrorForInvalidValue = input(true);

  protected readonly id = nextFieldErrorElementId();

  constructor() {
    effect((onCleanup) => {
      const control = this.control();
      const marksValueInvalid = this.appFieldErrorForInvalidValue();
      const before = control.getAttribute('aria-describedby');
      control.setAttribute('aria-describedby', before ? `${before} ${this.id}` : this.id);
      if (marksValueInvalid) {
        control.setAttribute('aria-invalid', 'true');
      }
      onCleanup(() => {
        const rest = (control.getAttribute('aria-describedby') ?? '')
          .split(/\s+/)
          .filter((token) => token && token !== this.id);
        if (rest.length) {
          control.setAttribute('aria-describedby', rest.join(' '));
        } else {
          control.removeAttribute('aria-describedby');
        }
        if (marksValueInvalid) {
          control.removeAttribute('aria-invalid');
        }
      });
    });
  }
}
