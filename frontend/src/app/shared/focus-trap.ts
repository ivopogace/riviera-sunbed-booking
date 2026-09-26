/**
 * Every modal's focus trap (WCAG 2.4.3 / 2.1.2): Tab wraps last→first, Shift+Tab first→last.
 * Skips disabled and `tabindex="-1"`, or a roving tabindex's parked members let Tab escape. Never
 * filter on `offsetParent` (null in `fixed` modals, jsdom); a hidden focusable lets Tab escape too.
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
