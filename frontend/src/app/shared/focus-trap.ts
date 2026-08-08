/**
 * Keep keyboard focus inside a modal container (a focus trap; modal a11y, WCAG 2.4.3 / 2.1.2). Wraps
 * Tab at the last focusable back to the first, and Shift+Tab at the first to the last. Shared by the
 * app's modals (the booking dialog, find-booking) — extracted so the a11y-critical logic lives
 * in ONE place and can't drift between copies.
 *
 * The selector excludes disabled controls; it deliberately does NOT filter on `offsetParent` — that
 * is null for a position:fixed subtree (the modal backdrop) and unavailable under jsdom, which would
 * silently disable the trap. The modals have no hidden focusables, so the selector is enough.
 *
 * @param container the modal panel/host whose focusable descendants form the trap
 * @param event     the keydown event (its default is prevented only when focus wraps)
 * @param backwards true for Shift+Tab (wrap first→last), false for Tab (wrap last→first)
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

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
