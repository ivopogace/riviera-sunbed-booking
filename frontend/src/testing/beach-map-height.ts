import { expect } from 'vitest';

/**
 * Pins one surface's half of the beach-map height contract: the canvas's `[data-map-row]`
 * wrapper owns the fixed row height (`h-[var(--riv-tile)]`, pinned in the canvas's own
 * spec), so every cell matched by `cellSelector` — and every element between it and that
 * wrapper — must fill the canvas-owned row via `h-full`, never a height mechanism of its
 * own. A per-surface fixed height or aspect-ratio is a second sizing mechanism, which iOS
 * WebKit resolves a couple px apart from the rails' — the drift class the canvas-owned
 * height exists to make unrepresentable. Chromium CI renders both identically, which is
 * why the pin asserts the class contract instead of rendered geometry.
 */
export function expectCellsFillCanvasRow(host: HTMLElement, cellSelector: string): void {
  const cells = Array.from(host.querySelectorAll<HTMLElement>(cellSelector));
  expect(cells.length).toBeGreaterThan(0);
  for (const cell of cells) {
    let el: HTMLElement | null = cell;
    while (el !== null && !('mapRow' in el.dataset)) {
      expect(el.classList.contains('h-full')).toBe(true);
      expect(el.classList.contains('h-[var(--riv-tile)]')).toBe(false);
      expect(el.classList.contains('aspect-square')).toBe(false);
      el = el.parentElement;
    }
    // Reaching the document root instead means the cell rendered outside a canvas row.
    expect(el).not.toBeNull();
  }
}
