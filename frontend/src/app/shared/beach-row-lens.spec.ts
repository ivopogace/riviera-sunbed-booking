import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import {
  BeachLensCell,
  BeachRowLens,
  BeachRowLensRow,
  BeachRowLensTilesDef,
} from './beach-row-lens';

/**
 * A made-up operator vocabulary, nothing the tourist map knows: the lens must take any state keys,
 * any summary text and several open rows, or the Daily view's reuse (#1807) becomes a rewrite.
 */
type DeckState = 'idle' | 'flagged' | 'sold';

interface DeckRow extends BeachRowLensRow {
  readonly seats: readonly { readonly no: number; readonly state: DeckState }[];
}

const DECK_LOOKS: Record<DeckState | 'cursor', string> = {
  idle: 'text-riv-card-ink',
  flagged: 'text-riv-accent-ink after:border-current',
  sold: 'text-riv-error-ink',
  cursor: 'text-riv-accent-ink',
};

function deckRow(
  code: string,
  states: readonly DeckState[],
  extra: Partial<BeachRowLensRow> = {},
): DeckRow {
  const sold = states.filter((s) => s === 'sold').length;
  return {
    code,
    zoneStart: false,
    band: null,
    cells: states.map((state) => ({ state })),
    note: `${sold} sold`,
    summary: `${sold} sold, ${states.length - sold} to go`,
    label: `Deck ${code}: ${sold} sold`,
    closeLabel: `Fold deck ${code}`,
    panTo: null,
    seats: states.map((state, i) => ({ no: i + 1, state })),
    ...extra,
  };
}

/** Three zones: A alone under its own band, B + C sharing one, D with no band at all. */
function deck(): DeckRow[] {
  return [
    deckRow('A', ['sold', 'idle', 'idle', 'flagged', 'idle', 'idle'], {
      zoneStart: true,
      band: { title: 'Upper deck', note: '1 of 6 sold' },
    }),
    deckRow('B', ['idle', 'sold', 'sold'], {
      zoneStart: true,
      band: { title: 'Lower deck', note: '2 of 5 sold' },
    }),
    deckRow('C', ['idle', 'idle']),
    deckRow('D', ['idle', 'idle', 'idle', 'idle', 'idle'], { zoneStart: true, note: null }),
  ];
}

@Component({
  imports: [BeachRowLens, BeachRowLensTilesDef, BeachLensCell],
  template: `
    <app-beach-row-lens
      label="Deck plan"
      frameTestid="deck-frame"
      [looks]="looks"
      [(open)]="open"
      [multiOpen]="multiOpen()"
      [panAgain]="panAgain()"
      focusOnOpen="button:not([disabled])"
    >
      <ul lensLegend data-testid="deck-legend">
        <li><span appBeachLensCell [look]="looks.sold"></span>Sold</li>
      </ul>
      <ng-template [appBeachRowLensTiles]="rows()" let-row let-i="index">
        <ul [attr.data-deck]="row.code" [attr.data-index]="i">
          @for (seat of row.seats; track seat.no) {
            <li>
              <button type="button" [disabled]="seat.state === 'sold'">{{ seat.no }}</button>
            </li>
          }
        </ul>
      </ng-template>
      <p lensHint>Open a deck.</p>
      <p lensFooter data-testid="deck-footer">Footer</p>
      <p lensEmpty data-testid="deck-empty">No decks</p>
    </app-beach-row-lens>
  `,
})
class DeckHost {
  readonly looks = DECK_LOOKS;
  readonly rows = signal<readonly DeckRow[]>(deck());
  readonly open = signal<readonly string[]>([]);
  readonly multiOpen = signal(false);
  readonly panAgain = signal(0);
}

describe('BeachRowLens', () => {
  let fixture: ComponentFixture<DeckHost>;
  let host: HTMLElement;

  const all = (testid: string): HTMLElement[] => [
    ...host.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`),
  ];
  const closedRow = (code: string): HTMLElement =>
    all('lens-row').find((el) => el.dataset['lensRow'] === code)!;
  const openRow = (code: string): HTMLElement | undefined =>
    all('lens-open').find((el) => el.dataset['lensOpen'] === code);
  const settle = async (): Promise<void> => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  /** jsdom lays nothing out: give one element the scroll geometry a real overflow would. */
  function geometry(el: HTMLElement, clientWidth: number, scrollWidth: number): void {
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
    Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  }

  beforeEach(async () => {
    fixture = TestBed.createComponent(DeckHost);
    host = fixture.nativeElement as HTMLElement;
    await settle();
  });

  describe('the overview', () => {
    it('draws every row as one button, named by the surface and collapsed', () => {
      const rows = all('lens-row');
      expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual([
        'Deck A: 1 sold',
        'Deck B: 2 sold',
        'Deck C: 0 sold',
        'Deck D: 0 sold',
      ]);
      for (const row of rows) {
        expect(row.tagName).toBe('BUTTON');
        expect(row.getAttribute('aria-expanded')).toBe('false');
      }
    });

    it('draws a cell per set in the surface’s own states, none of them pressable', () => {
      const cells = [...closedRow('A').querySelectorAll<HTMLElement>('[data-testid="lens-cell"]')];
      expect(cells.map((c) => c.dataset['state'])).toEqual([
        'sold',
        'idle',
        'idle',
        'flagged',
        'idle',
        'idle',
      ]);
      expect(cells[0].className).toContain('text-riv-error-ink');
      expect(cells[3].className).toContain('after:border-current');
      expect(host.querySelectorAll('[data-lens-cells] button, [data-lens-cells] a')).toHaveLength(
        0,
      );
    });

    it('puts every row on the widest row’s column grid', () => {
      const grids = all('lens-row').map(
        (row) =>
          row.querySelector<HTMLElement>('[data-lens-cells] > span')!.style.gridTemplateColumns,
      );
      expect(new Set(grids)).toEqual(new Set(['repeat(6, minmax(12px, 1fr))']));
    });

    it('hides cells, bands and the chevron from assistive technology', () => {
      expect(closedRow('A').querySelector('[data-lens-cells]')!.getAttribute('aria-hidden')).toBe(
        'true',
      );
      for (const band of all('lens-band')) {
        expect(band.closest('[aria-hidden="true"]')).not.toBeNull();
      }
      expect(
        closedRow('A').querySelector('app-chevron-down-icon')!.getAttribute('aria-hidden'),
      ).toBe('true');
    });

    it('draws a band where a zone starts with one, and none elsewhere', () => {
      expect(all('lens-band-title').map((b) => b.textContent.trim())).toEqual([
        'Upper deck',
        'Lower deck',
      ]);
      expect(all('lens-band-note').map((b) => b.textContent.trim())).toEqual([
        '· 1 of 6 sold',
        '· 2 of 5 sold',
      ]);
    });

    it('shows a row’s note in its empty columns only where the row leaves three', () => {
      const notes = all('lens-row').map(
        (row) => row.querySelector('[data-testid="lens-row-note"]')?.textContent?.trim() ?? null,
      );
      // A fills the grid, B leaves three, C four, D one column (and has no note).
      expect(notes).toEqual([null, '2 sold', '0 sold', null]);
      expect(
        closedRow('B').querySelector<HTMLElement>('[data-testid="lens-row-note"]')!.style
          .gridColumn,
      ).toBe('4 / -1');
    });

    it('draws a ring in the colour a cell carries', async () => {
      fixture.componentInstance.rows.update((rows) => [
        { ...rows[0], cells: rows[0].cells.map((c, i) => (i === 1 ? { ...c, ring: 'red' } : c)) },
        ...rows.slice(1),
      ]);
      await settle();

      const ringed = [...host.querySelectorAll<HTMLElement>('[data-ring]')];
      expect(ringed).toHaveLength(1);
      expect(ringed[0].style.outline).toBe('1.5px solid red');
    });

    it('shows the surface’s hint while no row is open', () => {
      expect(all('lens-hint')[0].textContent).toContain('Open a deck.');
    });

    it('projects the legend above the rows and the footer below', () => {
      const legend = host.querySelector('[data-testid="deck-legend"]')!;
      const lens = host.querySelector('[data-testid="row-lens"]')!;
      const footer = host.querySelector('[data-testid="deck-footer"]')!;
      expect(legend.compareDocumentPosition(lens) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(lens.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(host.querySelector('[data-testid="deck-empty"]')).toBeNull();
    });

    it('renders only the empty slot when there are no rows', async () => {
      fixture.componentInstance.rows.set([]);
      await settle();

      expect(host.querySelector('[data-testid="deck-empty"]')).not.toBeNull();
      expect(host.querySelector('[data-testid="row-lens"]')).toBeNull();
      expect(host.querySelector('[data-testid="deck-legend"]')).toBeNull();
    });

    it('has no vertical scroller of its own', () => {
      const lens = host.querySelector('[data-testid="row-lens"]')!;
      expect(lens.className).not.toMatch(/overflow-y-auto|max-h-/);
    });
  });

  describe('the open row', () => {
    it('opens the tapped row with the surface’s tiles, typed to its own row', async () => {
      closedRow('B').click();
      await settle();

      const open = openRow('B')!;
      expect(open.getAttribute('role')).toBe('group');
      expect(open.getAttribute('aria-label')).toBe('Deck B: 2 sold');
      const tiles = open.querySelector('ul')!;
      expect(tiles.dataset['deck']).toBe('B');
      expect(tiles.dataset['index']).toBe('1');
      expect(tiles.querySelectorAll('button')).toHaveLength(3);
      expect(fixture.componentInstance.open()).toEqual(['B']);
    });

    it('moves focus to the first tile the surface’s selector matches', async () => {
      closedRow('B').click();
      await settle();

      // B1 is free; A's first seat is sold, so its first match is the second tile.
      expect(document.activeElement?.textContent?.trim()).toBe('1');
      closedRow('A').click();
      await settle();
      expect(document.activeElement?.textContent?.trim()).toBe('2');
    });

    it('focuses the tile the row pans to, which is the one in view', async () => {
      fixture.componentInstance.rows.update((rows) => [
        { ...rows[0], panTo: { index: 4, align: 'center' } },
        ...rows.slice(1),
      ]);
      await settle();

      closedRow('A').click();
      await settle();

      expect(document.activeElement?.textContent.trim()).toBe('5');
    });

    it('opening another row closes the first', async () => {
      closedRow('B').click();
      await settle();
      closedRow('C').click();
      await settle();

      expect(all('lens-open').map((el) => el.dataset['lensOpen'])).toEqual(['C']);
      expect(closedRow('B')).toBeDefined();
    });

    it('keeps several rows open when the surface asks for it', async () => {
      fixture.componentInstance.multiOpen.set(true);
      closedRow('B').click();
      await settle();
      closedRow('D').click();
      await settle();

      expect(all('lens-open').map((el) => el.dataset['lensOpen'])).toEqual(['B', 'D']);
      expect(fixture.componentInstance.open()).toEqual(['B', 'D']);
    });

    it('opens the rows the surface sets, with no tap', async () => {
      fixture.componentInstance.open.set(['C']);
      await settle();

      expect(openRow('C')).toBeDefined();
      expect(all('lens-hint')).toHaveLength(0);
    });

    it('the close control closes the row, shows the hint and hands focus to its button', async () => {
      closedRow('B').click();
      await settle();
      const close = openRow('B')!.querySelector<HTMLElement>('[data-testid="lens-close"]')!;
      expect(close.getAttribute('aria-expanded')).toBe('true');
      expect(close.getAttribute('aria-label')).toBe('Fold deck B');

      close.click();
      await settle();

      expect(all('lens-open')).toHaveLength(0);
      expect(all('lens-hint')).toHaveLength(1);
      expect(document.activeElement).toBe(closedRow('B'));
      expect(fixture.componentInstance.open()).toEqual([]);
    });

    it('a row alone under its band carries the band in its head; a sharing row its own summary', async () => {
      fixture.componentInstance.open.set(['A']);
      await settle();
      const head = openRow('A')!.querySelector('[data-testid="lens-band-title"]');
      expect(head?.textContent?.trim()).toBe('Upper deck');
      // The band is not drawn twice: only B+C's still sits above a row.
      expect(all('lens-band')).toHaveLength(2);

      fixture.componentInstance.open.set(['C']);
      await settle();
      expect(
        openRow('C')!.querySelector('[data-testid="lens-open-summary"]')!.textContent.trim(),
      ).toBe('0 sold, 2 to go');
      expect(all('lens-band')).toHaveLength(2);
    });

    it('pans to the tile the row names only when that tile is out of view', async () => {
      const panTo = { index: 4, align: 'start' } as const;
      fixture.componentInstance.rows.update((rows) => [{ ...rows[0], panTo }, ...rows.slice(1)]);
      // The opening pan runs in the same render that inserts the row: stub the geometry it reads.
      const offsets = vi
        .spyOn(HTMLElement.prototype, 'offsetLeft', 'get')
        .mockImplementation(function (this: HTMLElement) {
          return this.tagName === 'LI' ? [...this.parentElement!.children].indexOf(this) * 50 : 0;
        });
      const widths = vi
        .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
        .mockImplementation(function (this: HTMLElement) {
          return this.tagName === 'LI' ? 44 : 0;
        });
      const clients = vi
        .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
        .mockImplementation(function (this: HTMLElement) {
          return this.dataset['lensPan'] === undefined ? 0 : 200;
        });
      try {
        fixture.componentInstance.open.set(['A']);
        await settle();
        // Tile 5 spans 200–244px, past the 200px viewport: the row starts on it.
        expect(openRow('A')!.querySelector<HTMLElement>('[data-lens-pan]')!.scrollLeft).toBe(200);

        fixture.componentInstance.open.set([]);
        await settle();
        fixture.componentInstance.rows.update((rows) => [
          { ...rows[0], panTo: { index: 2, align: 'start' } },
          ...rows.slice(1),
        ]);
        fixture.componentInstance.open.set(['A']);
        await settle();
        // Tile 3 spans 100–144px, in view from position 1: no pan.
        expect(openRow('A')!.querySelector<HTMLElement>('[data-lens-pan]')!.scrollLeft).toBe(0);
      } finally {
        offsets.mockRestore();
        widths.mockRestore();
        clients.mockRestore();
      }
    });
  });

  describe('a row the surface opens again', () => {
    it('pans afresh when the surface asks, and not when rows or the open list merely change', async () => {
      const offsets = vi
        .spyOn(HTMLElement.prototype, 'offsetLeft', 'get')
        .mockImplementation(function (this: HTMLElement) {
          return this.tagName === 'LI' ? [...this.parentElement!.children].indexOf(this) * 50 : 0;
        });
      const widths = vi
        .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
        .mockImplementation(function (this: HTMLElement) {
          return this.tagName === 'LI' ? 44 : 0;
        });
      const clients = vi
        .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
        .mockImplementation(function (this: HTMLElement) {
          return this.dataset['lensPan'] === undefined ? 0 : 200;
        });
      const withPanTo = (index: number): void =>
        fixture.componentInstance.rows.update((rows) => [
          { ...rows[0], panTo: { index, align: 'start' } },
          ...rows.slice(1),
        ]);
      const pan = (): HTMLElement => openRow('A')!.querySelector<HTMLElement>('[data-lens-pan]')!;
      try {
        withPanTo(4);
        fixture.componentInstance.open.set(['A']);
        await settle();
        expect(pan().scrollLeft).toBe(200);

        // The same row object list with a new target, the row still open: a pick toggling.
        withPanTo(5);
        await settle();
        expect(pan().scrollLeft).toBe(200);

        // An equal list in a new array is no request either: the user's scroll stays.
        fixture.componentInstance.open.set(['A']);
        await settle();
        expect(pan().scrollLeft).toBe(200);

        // The surface asks (a read for other days): the row pans to the new target.
        fixture.componentInstance.panAgain.update((n) => n + 1);
        await settle();
        expect(pan().scrollLeft).toBe(250);

        // Back to position 1 when the new target shows from there, or the row names none.
        withPanTo(1);
        fixture.componentInstance.panAgain.update((n) => n + 1);
        await settle();
        expect(pan().scrollLeft).toBe(0);
        pan().scrollLeft = 120;
        fixture.componentInstance.rows.update((rows) => [
          { ...rows[0], panTo: null },
          ...rows.slice(1),
        ]);
        fixture.componentInstance.panAgain.update((n) => n + 1);
        await settle();
        expect(pan().scrollLeft).toBe(0);
      } finally {
        offsets.mockRestore();
        widths.mockRestore();
        clients.mockRestore();
      }
    });
  });

  describe('a beach wider than the overview', () => {
    /** Every closed row 280px wide over 560px of columns: 14 of the 28 "columns" in view. */
    async function overflow(): Promise<HTMLElement[]> {
      const wide = Array.from({ length: 28 }, (): DeckState => 'idle');
      fixture.componentInstance.rows.set([
        deckRow('A', wide),
        deckRow('B', wide),
        deckRow('C', wide),
      ]);
      await settle();
      const scrollers = [...host.querySelectorAll<HTMLElement>('[data-lens-cells]')];
      for (const scroller of scrollers) {
        geometry(scroller, 280, 560);
      }
      scrollers[0].dispatchEvent(new Event('scroll'));
      fixture.componentInstance.rows.update((rows) => [...rows]);
      await settle();
      return [...host.querySelectorAll<HTMLElement>('[data-lens-cells]')];
    }

    it('shows no position bar or swipe hint while the overview fits', () => {
      expect(all('lens-position')).toHaveLength(0);
      expect(all('lens-swipe-hint')).toHaveLength(0);
    });

    it('shows the position bar and the swipe hint once it overflows', async () => {
      await overflow();

      expect(all('lens-position')[0].getAttribute('aria-hidden')).toBe('true');
      expect(all('lens-position-text')[0].textContent.trim()).toBe('1–14 of 28');
      const thumb = all('lens-position-thumb')[0];
      expect(thumb.style.left).toBe('0%');
      expect(thumb.style.width).toBe('50%');
      expect(all('lens-swipe-hint')).toHaveLength(1);
      expect(all('lens-row-note')).toHaveLength(0);
    });

    it('panning one closed row moves every closed row and the position bar with it', async () => {
      const scrollers = await overflow();

      scrollers[1].scrollLeft = 140;
      scrollers[1].dispatchEvent(new Event('scroll'));
      await settle();

      expect(scrollers.map((s) => s.scrollLeft)).toEqual([140, 140, 140]);
      expect(all('lens-position-text')[0].textContent.trim()).toBe('8–21 of 28');
      expect(all('lens-position-thumb')[0].style.left).toBe('25%');
    });

    it('takes a moved row’s own scroll event for an echo, not for the finger', async () => {
      const scrollers = await overflow();
      scrollers[1].scrollLeft = 140;
      scrollers[1].dispatchEvent(new Event('scroll'));

      // The finger moves on before row A's echo of 140 is delivered.
      scrollers[1].scrollLeft = 160;
      scrollers[0].dispatchEvent(new Event('scroll'));

      expect(scrollers[1].scrollLeft).toBe(160);

      // A real scroll of row A still drives every row.
      scrollers[0].scrollLeft = 90;
      scrollers[0].dispatchEvent(new Event('scroll'));
      expect(scrollers.map((s) => s.scrollLeft)).toEqual([90, 90, 90]);
    });

    it('keeps the hidden overview scrollers out of the tab order', async () => {
      const scrollers = await overflow();
      expect(scrollers.map((s) => s.getAttribute('tabindex'))).toEqual(['-1', '-1', '-1']);
    });

    it('leaves the overview where it is while an open row has no measured width', async () => {
      const scrollers = await overflow();
      scrollers[0].scrollLeft = 140;
      scrollers[0].dispatchEvent(new Event('scroll'));

      // jsdom gives the open row's pan no scroll width: there is no tile pitch to follow by.
      fixture.componentInstance.open.set(['A']);
      await settle();
      openRow('A')!
        .querySelector<HTMLElement>('[data-lens-pan]')!
        .dispatchEvent(new Event('scroll'));
      await settle();

      expect(all('lens-position-text')[0].textContent.trim()).toBe('8–21 of 28');
    });

    it('the overview follows the open row’s pan', async () => {
      await overflow();
      fixture.componentInstance.open.set(['A']);
      await settle();
      const scrollers = [...host.querySelectorAll<HTMLElement>('[data-lens-cells]')];
      for (const scroller of scrollers) {
        geometry(scroller, 280, 560);
      }
      const pan = openRow('A')!.querySelector<HTMLElement>('[data-lens-pan]')!;
      geometry(pan, 300, 1400);

      // Centre of the open row's view at 1000px of 1400 = column 20 of 28.
      pan.scrollLeft = 850;
      pan.dispatchEvent(new Event('scroll'));
      await settle();

      // Column 20 at a 20px pitch sits at 400px; centred in a 280px view, the offset is 260.
      expect(scrollers.map((s) => s.scrollLeft)).toEqual([260, 260]);
      expect(all('lens-position-text')[0].textContent.trim()).toBe('14–27 of 28');

      // At the open row's far end the overview is at its own end: only the leading edge fades.
      pan.scrollLeft = 1100;
      pan.dispatchEvent(new Event('scroll'));
      await settle();
      expect(scrollers.map((s) => s.scrollLeft)).toEqual([280, 280]);
      expect(scrollers[0].className).toContain('linear-gradient(90deg,transparent,black_20px)]');
    });
  });
});
