import { Directive, effect, input } from '@angular/core';

let nextFieldErrorId = 0;

function nextFieldErrorElementId(): string {
  nextFieldErrorId += 1;
  return `riv-field-error-${nextFieldErrorId}`;
}

/**
 * Associates an inline field error with the control it belongs to: while this element is in the
 * DOM, the control names it through `aria-describedby` and — unless `appFieldErrorForInvalidValue`
 * says the value itself is fine — carries `aria-invalid="true"`.
 *
 * <p>Applied to the ERROR element, taking the control's template reference, so the association's
 * lifetime is the error's own — `@if` removing the error removes the reference with it, and a stale
 * `aria-describedby` cannot be written. A dangling reference is only an axe *incomplete*, which
 * `expectNoAxeViolations` does not fail on, so this is structure rather than a test. Placement
 * gives that guarantee only while the control outlives the error, which every call site satisfies
 * by declaring the ref in the same view (or the enclosing `@for` body).
 *
 * <p>The directive is the sole writer of `aria-invalid` in this app; pre-existing
 * `aria-describedby` tokens are preserved and kept first, so a hint reads before the error.
 *
 * <p>Three limits, worth knowing before widening its use:
 *
 * <p>- `aria-invalid` is not reference-counted. No control carries two error elements today; if one
 * ever does, the first to unmount clears the mark while the other is still showing. Refcount it
 * then, rather than pre-building for a shape that does not exist.
 *
 * <p>- Preserving a pre-existing `aria-describedby` works for a **static** attribute. This writes
 * imperatively, so an Angular `[attr.aria-describedby]` binding on the same control (today only
 * `auth/auth-page.ts`) would drop the error token whenever Angular re-evaluated it.
 *
 * <p>- Generated ids are process-monotonic and never reset, and `isolate: false` (ADR-0014) shares
 * this module across every spec file in a worker — so a literal id is not reproducible. Read
 * `error.id` back instead of asserting `riv-field-error-N`.
 */
@Directive({
  selector: '[appFieldErrorFor]',
  host: { '[attr.id]': 'id' },
})
export class FieldErrorFor {
  readonly control = input.required<HTMLElement>({ alias: 'appFieldErrorFor' });

  /**
   * Whether this error means the control's own value is wrong — the ARIA21 condition for
   * `aria-invalid`. Default `true`, which is right for a validation error. Bind it `false` for an
   * error that reports a failed *write* (a 403, an expired session): the entered value is fine, so
   * the control is described but never marked invalid.
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
