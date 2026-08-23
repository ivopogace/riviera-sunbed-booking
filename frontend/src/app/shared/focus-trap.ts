/**
 * Keep keyboard focus inside a modal container (a focus trap; modal a11y, WCAG 2.4.3 / 2.1.2). Wraps
 * Tab at the last focusable back to the first, and Shift+Tab at the first to the last. Shared by the
 * app's four modals (the booking dialog, find-booking, the payout statement and the availability
 * calendar) — extracted so the a11y-critical logic lives in ONE place and can't drift between
 * copies.
 *
 * The selector excludes what the browser will not tab to: disabled controls, and anything held at
 * `tabindex="-1"`. The second exclusion is what makes the trap safe around a **roving tabindex** —
 * a grid or toolbar parks its inactive members at `-1`, and a selector matching them by tag would
 * make the trap's "last focusable" an element Tab never reaches, so Tab from the real last one
 * would escape the dialog instead of wrapping.
 *
 * <p>It deliberately does NOT filter on `offsetParent` — that is null for a position:fixed subtree
 * (the modal backdrop) and unavailable under jsdom, which would silently disable the trap. The
 * modals have no hidden focusables, so the selector is enough.
 *
 * @param container the modal panel/host whose focusable descendants form the trap
 * @param event     the keydown event (its default is prevented only when focus wraps)
 * @param backwards true for Shift+Tab (wrap first→last), false for Tab (wrap last→first)
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
]
  .map((candidate) => `${candidate}:not([tabindex="-1"])`)
  .join(', ');

export function trapFocusWithin(container: HTMLElement, event: Event, backwards: boolean): void {
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (focusable.length === 0) {
    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1)!; // non-null: guarded by the length check above
  const active = container.ownerDocument.activeElement;
  if (backwards && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!backwards && active === last) {
    event.preventDefault();
    first.focus();
  }
}
