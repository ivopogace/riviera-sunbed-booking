import { expect } from 'vitest';

/**
 * Pins the beach-map height mechanism for one canvas surface: every row-code rail cell
 * and every tile/cell matched by `cellSelector` must size from the identical fixed
 * `h-[var(--riv-tile)]` declaration, never an aspect-ratio-derived height. iOS WebKit
 * resolves the two mechanisms a couple px apart per row, and the rail and tile columns
 * are independent flex stacks, so the difference compounds down a tall map — while
 * CI's Chromium renders both identically, which is why the pin asserts the class
 * contract instead of rendered geometry.
 */
export function expectCellsMatchRailHeight(host: HTMLElement, cellSelector: string): void {
  const rails = Array.from(host.querySelectorAll<HTMLElement>('[data-testid="row-code"]')).map(
    (chip) => chip.parentElement!,
  );
  const cells = Array.from(host.querySelectorAll<HTMLElement>(cellSelector));
  expect(rails.length).toBeGreaterThan(0);
  expect(cells.length).toBeGreaterThan(0);
  for (const cell of [...rails, ...cells]) {
    expect(cell.classList.contains('h-[var(--riv-tile)]')).toBe(true);
    expect(cell.classList.contains('aspect-square')).toBe(false);
  }
}
