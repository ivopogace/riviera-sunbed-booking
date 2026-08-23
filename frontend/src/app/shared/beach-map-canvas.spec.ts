import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BeachMapCanvas, BeachMapCanvasRow, BeachMapRowDef } from './beach-map-canvas';

/** A canvas row enriched with the host's own tile data, as each surface's rows are. */
interface TestRow extends BeachMapCanvasRow {
  readonly seats: readonly string[];
}

function row(
  code: string,
  priceLabel: string | null,
  zoneStart: boolean,
  seats: readonly string[],
): TestRow {
  return { code, priceLabel, zoneStart, tileCount: seats.length, seats };
}

/** Two price zones: A alone, then B+C sharing a price; D is an unpriced row (no chip ever). */
const ROWS: readonly TestRow[] = [
  row('A', '€35.00', true, ['1', '2']),
  row('B', '€20.00', true, ['1', '2', '3']),
  row('C', '€20.00', false, ['1', '2']),
  row('D', null, true, ['1']),
];

@Component({
  imports: [BeachMapCanvas, BeachMapRowDef],
  template: `
    <app-beach-map-canvas
      label="Beach map — Miramar"
      frameTestid="test-frame"
      viewportTestid="test-pan"
      [viewportTabindex]="0"
      viewportLabel="Beach map"
      [dragPan]="dragPan()"
      [railCodes]="railCodes()"
      [priceChips]="priceChips()"
      [loading]="loading()"
      [fitWidth]="fitWidth()"
      [rowRailInteractive]="rowRailInteractive()"
      [rowRailLabel]="rowRailLabel()"
      (rowRailFill)="rowFills.push($event)"
      [colHeaderInteractive]="colHeaderInteractive()"
      [colHeaderLabel]="colHeaderLabel()"
      (colHeaderFill)="colFills.push($event)"
      [zoomControl]="zoomControl()"
    >
      <ng-template [appBeachMapRow]="rows()" let-row let-i="index">
        <ul class="set-row" [attr.data-row]="row.code">
          @for (seat of row.seats; track seat) {
            <li>
              <button type="button" (click)="taps.push(row.code + seat)">{{ seat }}</button>
            </li>
          }
        </ul>
      </ng-template>
      <ul canvasLegend data-testid="legend-note">
        <li>Available</li>
      </ul>
      <p canvasFooter data-testid="footer-note">Projected footer.</p>
      <p canvasEmpty data-testid="empty-note">Nothing here yet.</p>
    </app-beach-map-canvas>
  `,
})
class CanvasHost {
  readonly rows = signal<readonly TestRow[]>(ROWS);
  readonly dragPan = signal(true);
  readonly railCodes = signal<'letters' | 'labels' | 'capped-labels'>('letters');
  readonly priceChips = signal<'amounts' | 'capped-phrases'>('amounts');
  readonly loading = signal(false);
  readonly fitWidth = signal(false);
  readonly taps: string[] = [];
  readonly rowRailInteractive = signal(false);
  readonly rowRailLabel = signal<((index: number) => string) | null>(
    (i: number) => `Fill row ${i}`,
  );
  readonly rowFills: number[] = [];
  readonly colHeaderInteractive = signal(false);
  readonly colHeaderLabel = signal<((index: number) => string) | null>(
    (i: number) => `Fill column ${i}`,
  );
  readonly colFills: number[] = [];
  readonly zoomControl = signal(false);
}

/**
 * The operator shape: the same canvas with NO `canvasLegend` content, which is how the layout
 * editor, the Daily view and the per-set editor render it. The legend slot must emit nothing at
 * all here — the sea banner's `mb-3.5` and the wash's `-mt-3.5` still have to meet each other
 * (#701, R-4).
 */
@Component({
  imports: [BeachMapCanvas, BeachMapRowDef],
  template: `
    <app-beach-map-canvas frameTestid="test-frame" viewportTestid="test-pan">
      <ng-template [appBeachMapRow]="rows()" let-row>
        <ul class="set-row" [attr.data-row]="row.code"></ul>
      </ng-template>
    </app-beach-map-canvas>
  `,
})
class LegendlessCanvasHost {
  readonly rows = signal<readonly TestRow[]>(ROWS);
}

/**
 * jsdom ships no `ResizeObserver`, so the canvas's resize re-measure has no seam to drive
 * without one. This stub records the elements it was handed and exposes each instance's
 * callback, letting a spec fire a resize deliberately. Installed and **restored** per test
 * (`isolate` is false — one jsdom per worker, so a leaked global would reach later files).
 */
class StubResizeObserver {
  static instances: StubResizeObserver[] = [];
  readonly observed: Element[] = [];
  disconnected = false;

  constructor(private readonly callback: () => void) {
    StubResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.push(target);
  }

  disconnect(): void {
    this.disconnected = true;
  }

  fire(): void {
    this.callback();
  }
}

describe('BeachMapCanvas (#672)', () => {
  let previousResizeObserver: unknown;

  beforeEach(() => {
    previousResizeObserver = (globalThis as Record<string, unknown>)['ResizeObserver'];
    StubResizeObserver.instances = [];
    (globalThis as Record<string, unknown>)['ResizeObserver'] = StubResizeObserver;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>)['ResizeObserver'] = previousResizeObserver;
    // Each stub closes over a component instance — a retained array pins them for the worker's life.
    StubResizeObserver.instances = [];
  });

  function render(): {
    host: HTMLElement;
    component: CanvasHost;
    detect: () => void;
    fixture: ComponentFixture<CanvasHost>;
  } {
    const fixture = TestBed.createComponent(CanvasHost);
    fixture.detectChanges();
    return {
      host: fixture.nativeElement as HTMLElement,
      component: fixture.componentInstance,
      detect: () => fixture.detectChanges(),
      fixture,
    };
  }

  function viewport(host: HTMLElement): HTMLElement {
    const el = host.querySelector<HTMLElement>('[data-testid="test-pan"]');
    expect(el).toBeTruthy();
    return el!;
  }

  /** The price rail's column — the element whose width pulls the tile viewport's right edge in. */
  function priceColumn(host: HTMLElement): HTMLElement {
    const column = host.querySelector<HTMLElement>(
      '[data-testid="price-col"], [data-testid="price-col-placeholder"]',
    );
    expect(column).toBeTruthy();
    return column!;
  }

  /** The left rail's column — the element whose width slides the tile grid when it changes. */
  function railColumn(host: HTMLElement): HTMLElement {
    const chip = host.querySelector<HTMLElement>(
      '[data-testid="row-code"], [data-testid="row-code-placeholder"]',
    );
    expect(chip).toBeTruthy();
    return chip!.parentElement!.parentElement!;
  }

  function rowGrid(host: HTMLElement): HTMLElement {
    const el = viewport(host).querySelector<HTMLElement>('[data-map-grid]');
    expect(el).toBeTruthy();
    return el!;
  }

  /**
   * Seed the tile grid's CONTENT width — what the gate must answer on. `padded` adds the
   * 16px-a-side `.pannable` puts on the grid, which lands in `scrollWidth` on top of `content`:
   * that sum is what a gate reading the raw `scrollWidth` would wrongly compare.
   */
  function seedGridWidth(host: HTMLElement, content: number, padded = false): void {
    const grid = rowGrid(host);
    const pad = padded ? 16 : 0;
    Object.defineProperty(grid, 'scrollWidth', { value: content + 2 * pad, configurable: true });
    grid.style.paddingLeft = `${pad}px`;
    grid.style.paddingRight = `${pad}px`;
  }

  function washScroller(host: HTMLElement): HTMLElement {
    const el = host.querySelector<HTMLElement>('[data-riv-scroller]');
    expect(el).toBeTruthy();
    return el!;
  }

  /** jsdom measures 0 — seed a vertical overflow on the wash scroller through the DOM seam. */
  function seedVerticalOverflow(wash: HTMLElement): void {
    Object.defineProperty(wash, 'scrollHeight', { value: 800 });
    Object.defineProperty(wash, 'clientHeight', { value: 500 });
  }

  /** Drag the viewport by `dx`/`dy` pixels (mousedown → mousemove → mouseup). */
  function drag(el: HTMLElement, dx: number, dy = 0): void {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 200 }));
    el.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 100 + dx, clientY: 200 + dy }),
    );
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }

  it('renders the frame chrome, the rails and the projected tile rows in row order', () => {
    const { host } = render();
    const frame = host.querySelector('[data-testid="test-frame"]');
    expect(frame).toBeTruthy();
    expect(frame?.getAttribute('aria-label')).toBe('Beach map — Miramar');
    expect(host.textContent).toContain('Facing the sea');
    expect(host.textContent).toContain('Promenade');
    const codes = Array.from(host.querySelectorAll('[data-testid="row-code"]')).map(
      (e) => e.textContent,
    );
    expect(codes).toEqual(['A', 'B', 'C', 'D']);
    const rows = Array.from(host.querySelectorAll('ul.set-row')).map((u) =>
      u.getAttribute('data-row'),
    );
    expect(rows).toEqual(['A', 'B', 'C', 'D']);
    // The projected rows live inside the pan viewport; the rails do not.
    expect(viewport(host).querySelectorAll('ul.set-row').length).toBe(4);
    expect(viewport(host).querySelector('[data-testid="row-code"]')).toBeNull();
  });

  it('leaves rail labels uncapped by default — operator surfaces render them whole (#724)', () => {
    const { host } = render();
    expect(host.querySelector('[data-testid="row-code"] .truncate')).toBeNull();
  });

  it('caps rail labels with an ellipsis when the surface opts in (#724)', () => {
    const { component, host, detect } = render();
    component.railCodes.set('capped-labels');
    detect();
    const inner = host.querySelector('[data-testid="row-code"] .truncate')!;
    expect(inner).toBeTruthy();
    expect(inner.classList.contains('max-w-12')).toBe(true);
    expect(inner.classList.contains('sm:max-w-[96px]')).toBe(true);
    expect(inner.textContent).toBe('A');
  });

  it('reserves the same rail width loading and loaded, for either label vocabulary (#749)', () => {
    const { component, host, detect } = render();
    for (const codes of ['labels', 'capped-labels'] as const) {
      component.railCodes.set(codes);
      component.loading.set(false);
      detect();
      // A minimum, not the #724 cap: the cap-sized rail costs the desktop map its fits-whole margin.
      const loaded = railColumn(host).className;
      expect(loaded, codes).toContain('min-w-[54px]');

      component.loading.set(true);
      detect();
      expect(railColumn(host).className, codes).toBe(loaded);
      const chip = host.querySelector('[data-testid="row-code-placeholder"]')!;
      expect(chip.classList.contains('w-[54px]'), codes).toBe(true);
    }
  });

  it('caps only the tourist rail, so operator labels stay whole (#724, #749)', () => {
    const { component, host, detect } = render();
    component.railCodes.set('labels');
    detect();
    expect(host.querySelector('[data-testid="row-code"] .truncate')).toBeNull();
    expect(railColumn(host).className).toContain('min-w-[54px]');
  });

  it('reserves nothing for a letters rail, so the editor surfaces are unchanged (#749)', () => {
    const { component, host, detect } = render();
    const loaded = railColumn(host).className;
    expect(loaded).not.toContain('w-[');

    component.loading.set(true);
    detect();
    expect(railColumn(host).className).toBe(loaded);
    const chip = host.querySelector('[data-testid="row-code-placeholder"]')!;
    // The letter chip's own min-w-6 — a grid letter's placeholder matches its real chip exactly.
    expect(chip.classList.contains('min-w-6')).toBe(true);
    expect(chip.className).not.toContain('w-[');
  });

  it('reserves the same price-rail width loading and loaded (#751)', () => {
    const { component, host, detect } = render();
    component.priceChips.set('capped-phrases');
    detect();
    // The 92px phone cap as a MINIMUM: a desktop chip still widens past it, a bare price does not.
    const loaded = priceColumn(host).className;
    expect(loaded).toContain('min-w-[92px]');

    component.loading.set(true);
    detect();
    expect(priceColumn(host).className).toBe(loaded);
  });

  it('an amounts price rail reserves nothing, so the operator surfaces are unchanged (#751)', () => {
    const { component, host, detect } = render();
    const loaded = priceColumn(host).className;
    expect(loaded).not.toContain('w-[');

    component.loading.set(true);
    detect();
    expect(priceColumn(host).className).toBe(loaded);
    // The cell's own floor is what sizes this rail, and it is untouched by the reservation.
    expect(priceColumn(host).firstElementChild!.className).toContain('min-w-[52px]');
  });

  it('sizes every row wrapper and rail cell from the identical fixed --riv-tile height (#685)', () => {
    const { host } = render();
    const railCells = Array.from(
      host.querySelectorAll<HTMLElement>('[data-testid="row-code"]'),
    ).map((chip) => chip.parentElement!);
    const priceCells = Array.from(host.querySelector('[data-testid="price-col"]')!.children);
    const rowWraps = Array.from(viewport(host).querySelectorAll<HTMLElement>('[data-map-row]'));
    expect(railCells.length).toBe(4);
    expect(priceCells.length).toBe(4);
    expect(rowWraps.length).toBe(4);
    for (const el of [...railCells, ...priceCells, ...rowWraps]) {
      expect(el.classList.contains('h-[var(--riv-tile)]')).toBe(true);
      expect(el.classList.contains('aspect-square')).toBe(false);
    }
  });

  it('renders the price chip once per zone, and never for a null priceLabel', () => {
    const { host } = render();
    const prices = Array.from(host.querySelectorAll('[data-testid="row-price"]')).map((e) =>
      e.textContent?.trim(),
    );
    // A starts zone 1, B starts zone 2 (C continues it), D is zoneStart but unpriced.
    expect(prices).toEqual(['€35.00', '€20.00']);
  });

  it('marks the zone gap on non-first zone starts across all three columns', () => {
    const { host } = render();
    const railCells = host.querySelectorAll('[data-testid="row-code"]');
    const priceCol = host.querySelector('[data-testid="price-col"]');
    const rowWraps = viewport(host).querySelectorAll('[data-map-row]');
    expect(rowWraps.length).toBe(4);
    const gapped = (list: ArrayLike<Element>, i: number): boolean =>
      list[i].classList.contains('mt-3') || !!list[i].closest('.mt-3');
    // Row A (first) and row C (inside zone 2) carry no gap; B and D (new zones) do.
    for (const list of [railCells, rowWraps, priceCol!.children]) {
      expect(gapped(list, 0)).toBe(false);
      expect(gapped(list, 1)).toBe(true);
      expect(gapped(list, 2)).toBe(false);
      expect(gapped(list, 3)).toBe(true);
    }
  });

  it('suppresses the pointer click that ends a drag-pan, once, and never a keyboard activation', () => {
    const { host, component } = render();
    const vp = viewport(host);
    const button = vp.querySelector<HTMLButtonElement>('button')!;

    // A drag past the 6px threshold: the release click (detail > 0) must be swallowed.
    drag(vp, 40);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(component.taps).toEqual([]);

    // The suppression is consume-once: the next genuine click activates.
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(component.taps).toEqual(['A1']);

    // A keyboard activation (detail 0) right after a pan is never swallowed.
    drag(vp, 40);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(component.taps).toEqual(['A1', 'A1']);
  });

  it('does not suppress a click after a sub-threshold micro-drag', () => {
    const { host, component } = render();
    const vp = viewport(host);
    drag(vp, 3);
    vp.querySelector<HTMLButtonElement>('button')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 1 }),
    );
    expect(component.taps).toEqual(['A1']);
  });

  it('pans the viewport on drag', () => {
    const { host } = render();
    const vp = viewport(host);
    vp.scrollLeft = 50;
    vp.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }));
    vp.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 60 }));
    expect(vp.scrollLeft).toBe(90);
    vp.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('suppresses the click after a mostly-vertical drag, once, and never a keyboard activation', () => {
    const { host, component } = render();
    const vp = viewport(host);
    seedVerticalOverflow(washScroller(host));
    const button = vp.querySelector<HTMLButtonElement>('button')!;

    // A vertical drag past the 6px threshold: the release click must be swallowed, once.
    drag(vp, 0, 40);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(component.taps).toEqual([]);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(component.taps).toEqual(['A1']);

    // A keyboard activation (detail 0) right after a vertical pan is never swallowed.
    drag(vp, 0, 40);
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(component.taps).toEqual(['A1', 'A1']);
  });

  it('pans the wash scroller vertically on drag when it overflows, leaving scrollLeft alone', () => {
    const { host } = render();
    const vp = viewport(host);
    const wash = washScroller(host);
    seedVerticalOverflow(wash);
    wash.scrollTop = 50;
    vp.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100, clientY: 200 }));
    vp.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 100, clientY: 160 }));
    expect(wash.scrollTop).toBe(90);
    expect(vp.scrollLeft).toBe(0);
    vp.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  it('on a map without vertical overflow, a vertical drag neither scrolls nor suppresses', () => {
    const { host, component } = render();
    const vp = viewport(host);
    const wash = washScroller(host);
    drag(vp, 0, 40);
    expect(wash.scrollTop).toBe(0);
    vp.querySelector<HTMLButtonElement>('button')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 1 }),
    );
    expect(component.taps).toEqual(['A1']);
  });

  it('gives a dragPan-off viewport a themed scrollbar, the only pointer route left to off-screen columns', () => {
    const { host, component, detect } = render();
    const vp = viewport(host);
    expect(vp.classList.contains('scrollbar-none')).toBe(true);

    component.dragPan.set(false);
    detect();
    expect(vp.classList.contains('scrollbar-none')).toBe(false);
    expect(vp.className).toContain('scrollbar-thin');
    expect(vp.className).toContain('scrollbar-thumb-(--riv-accent-ink)');
    expect(vp.className).toContain('scrollbar-track-transparent');
    // A stable gutter would reserve an inline-end strip this overflow-y-hidden box can never use.
    expect(vp.className).not.toContain('scrollbar-gutter');
  });

  it('with dragPan off, a drag neither pans nor suppresses the following click', () => {
    const { host, component, detect } = render();
    component.dragPan.set(false);
    detect();
    const vp = viewport(host);
    seedVerticalOverflow(washScroller(host));
    vp.scrollLeft = 50;
    drag(vp, -40, 40);
    expect(vp.scrollLeft).toBe(50);
    expect(washScroller(host).scrollTop).toBe(0);
    vp.querySelector<HTMLButtonElement>('button')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 1 }),
    );
    expect(component.taps).toEqual(['A1']);
  });

  it('carries the viewport contract: testid, tabindex, accessible name and a named-region role', () => {
    const { host } = render();
    const vp = viewport(host);
    expect(vp.getAttribute('tabindex')).toBe('0');
    expect(vp.getAttribute('aria-label')).toBe('Beach map');
    // aria-label is prohibited on role=generic — a labelled viewport must be a named region (#674 F-4).
    expect(vp.getAttribute('role')).toBe('region');
  });

  it('the pan hint is one plain line, no decorative glyph', async () => {
    const { host, component, detect, fixture } = render();
    seedGridWidth(host, 500);
    Object.defineProperty(viewport(host), 'clientWidth', { value: 100, configurable: true });
    component.rows.set([...ROWS]);
    detect();
    await fixture.whenStable();
    detect();

    const hint = host.querySelector('[data-testid="scroll-hint"]')!;
    expect(hint.textContent?.trim()).toBe('Drag or swipe to see the whole beach.');
    expect(hint.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('names the overflow gesture per surface, never instructing the paint drag', async () => {
    const { host, component, detect, fixture } = render();
    // jsdom measures 0 — give the viewport a real overflow through the DOM measurement seam.
    const vp = viewport(host);
    seedGridWidth(host, 500);
    Object.defineProperty(vp, 'clientWidth', { value: 100, configurable: true });
    component.rows.set([...ROWS]);
    detect();
    await fixture.whenStable();
    detect();
    expect(host.querySelector('[data-testid="scroll-hint"]')?.textContent?.trim()).toBe(
      'Drag or swipe to see the whole beach.',
    );

    component.dragPan.set(false);
    detect();
    // #674 F-3 suppressed this outright; the wording, not the hint, was what named the wrong gesture.
    expect(host.querySelector('[data-testid="scroll-hint"]')?.textContent?.trim()).toBe(
      'Scroll, or drag the scrollbar, to see the whole beach.',
    );
  });

  it('shows the pan hint on vertical-only overflow, over a wash that has the bar it names', async () => {
    const { host, component, detect, fixture } = render();
    const wash = washScroller(host);
    seedVerticalOverflow(wash);
    component.rows.set([...ROWS]);
    detect();
    await fixture.whenStable();
    detect();
    expect(host.querySelector('[data-testid="scroll-hint"]')).toBeTruthy();

    component.dragPan.set(false);
    detect();
    expect(host.querySelector('[data-testid="scroll-hint"]')?.textContent?.trim()).toBe(
      'Scroll, or drag the scrollbar, to see the whole beach.',
    );
    // The wash is the scroller that overflows here, so it is the one that must carry the bar.
    expect(wash.className).toContain('scrollbar-thin');
    expect(wash.classList.contains('scrollbar-none')).toBe(false);
  });

  it('re-measures the pan overflow when the viewport resizes (#700)', async () => {
    const { host, detect, fixture } = render();
    const vp = viewport(host);
    await fixture.whenStable();
    detect();
    expect(host.querySelector('[data-testid="scroll-hint"]')).toBeNull();

    // The canvas observes the pan viewport itself — the element whose width the resize changes.
    const observer = StubResizeObserver.instances.at(-1)!;
    expect(observer.observed).toContain(vp);

    // A narrower viewport: rows are unchanged, so only the observer can notice the overflow.
    seedGridWidth(host, 500);
    Object.defineProperty(vp, 'clientWidth', { value: 100, configurable: true });
    observer.fire();
    detect();
    expect(host.querySelector('[data-testid="scroll-hint"]')).toBeTruthy();

    // ...and widening it back retires the hint, rather than leaving a cue that now lies.
    Object.defineProperty(vp, 'clientWidth', { value: 500, configurable: true });
    observer.fire();
    detect();
    expect(host.querySelector('[data-testid="scroll-hint"]')).toBeNull();
  });

  it('gates on the grid, not the padding .pannable adds to it, so the hint never sticks (#700)', async () => {
    const { host, detect, fixture } = render();
    const vp = viewport(host);
    await fixture.whenStable();
    detect();
    const observer = StubResizeObserver.instances.at(-1)!;

    // Narrow first, so the hint is on; the grid is seeded unpadded, which is the harder case.
    seedGridWidth(host, 520);
    Object.defineProperty(vp, 'clientWidth', { value: 400, configurable: true });
    observer.fire();
    detect();
    expect(host.querySelector('[data-testid="scroll-hint"]')).toBeTruthy();

    // Widen into the band: the 520px grid fits 540, but the padded 552 the old gate read does not.
    seedGridWidth(host, 520, true);
    Object.defineProperty(vp, 'clientWidth', { value: 540, configurable: true });
    observer.fire();
    detect();
    expect(host.querySelector('[data-testid="scroll-hint"]')).toBeNull();
  });

  it('re-measures the vertical axis on resize too, and disconnects the observer on teardown (#700)', async () => {
    const { host, detect, fixture } = render();
    const wash = washScroller(host);
    await fixture.whenStable();
    detect();
    expect(host.querySelector('[data-testid="scroll-hint"]')).toBeNull();

    // A width change also rescales --riv-tile, so rows can outgrow the wash cap with no row change.
    const observer = StubResizeObserver.instances.at(-1)!;
    seedVerticalOverflow(wash);
    observer.fire();
    detect();
    expect(host.querySelector('[data-testid="scroll-hint"]')).toBeTruthy();

    expect(observer.disconnected).toBe(false);
    fixture.destroy();
    expect(observer.disconnected).toBe(true);
  });

  it('states no row name, no price and no pan hint while loading (#749)', () => {
    const { host, component, detect } = render();
    component.loading.set(true);
    detect();

    // The three testids named live chrome; a placeholder that leaks them is queryable as the real thing.
    expect(host.querySelectorAll('[data-testid="row-code"]').length).toBe(0);
    expect(host.querySelector('[data-testid="price-col"]')).toBeNull();
    expect(host.querySelector('[data-testid="row-price"]')).toBeNull();

    // Both rails still render — it is their CONTENT that is fabricated, never their column.
    const placeholders = Array.from(host.querySelectorAll('[data-testid="row-code-placeholder"]'));
    expect(placeholders.length).toBe(ROWS.length);
    for (const chip of placeholders) {
      expect(chip.textContent?.trim()).toBe('');
    }
    expect(host.querySelector('[data-testid="price-col-placeholder"]')?.children.length).toBe(
      ROWS.length,
    );
  });

  it('offers no gesture its inert container cannot accept while loading (#749)', async () => {
    const { host, component, detect, fixture } = render();
    component.loading.set(true);
    detect();
    seedGridWidth(host, 500);
    Object.defineProperty(viewport(host), 'clientWidth', { value: 100, configurable: true });
    seedVerticalOverflow(washScroller(host));
    component.rows.set([...ROWS]);
    detect();
    await fixture.whenStable();
    detect();

    // Both overflow axes are real here; the instruction to act on them is what a skeleton cannot mean.
    expect(host.querySelector('[data-testid="scroll-hint"]')).toBeNull();
    // Its line is not reserved either: whether the LOADED map needs one is what a placeholder cannot know.
    expect(host.querySelector('[data-testid="scroll-hint-placeholder"]')).toBeNull();
    expect(viewport(host).classList.contains('cursor-grab')).toBe(false);
    // The edge fade reports a measured fact rather than inviting an action, so it stays.
    expect(viewport(host).classList.contains('pannable')).toBe(true);
  });

  it('projects the footer slot below the viewport and hides it with the grid when empty', () => {
    const { host, component, detect } = render();
    expect(host.querySelector('[data-testid="footer-note"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="empty-note"]')).toBeNull();

    component.rows.set([]);
    detect();
    expect(host.querySelector('[data-testid="empty-note"]')).toBeTruthy();
    expect(host.querySelector('[data-testid="footer-note"]')).toBeNull();
    expect(host.querySelector('[data-testid="row-code"]')).toBeNull();
    expect(host.querySelector('[data-testid="test-pan"]')).toBeNull();
    // The frame chrome stays either way.
    expect(host.textContent).toContain('Facing the sea');
  });

  /** The frame's own children, in render order: banner, whatever the canvas projected, promenade. */
  function frameChildren(host: HTMLElement): readonly Element[] {
    const frame = host.querySelector('[data-testid="test-frame"]');
    expect(frame).toBeTruthy();
    return [...frame!.children];
  }

  /** Index of the frame child holding the sea banner — the legend band's anchor. */
  function bannerIndex(children: readonly Element[]): number {
    const index = children.findIndex((el) => el.textContent?.includes('Facing the sea'));
    expect(index).toBeGreaterThanOrEqual(0);
    return index;
  }

  it('projects the legend slot above the wash, and drops it with the grid (#701)', () => {
    const { host, component, detect } = render();
    const children = frameChildren(host);
    const banner = bannerIndex(children);
    const band = children[banner + 1];
    // The whole point of #701: decode the colours BEFORE reading the tiles.
    expect(band.querySelector('[data-testid="legend-note"]')).toBeTruthy();
    expect(children[banner + 2].matches('[data-riv-scroller]')).toBe(true);

    // A legend with no tiles to decode is noise — it goes with the grid.
    component.rows.set([]);
    detect();
    expect(host.querySelector('[data-testid="legend-note"]')).toBeNull();
  });

  it("publishes the wash's sea stop as --riv-map-sea, which the wash itself reads (#701)", () => {
    const { host } = render();
    const canvas = host.querySelector<HTMLElement>('app-beach-map-canvas')!;
    expect(canvas.style.getPropertyValue('--riv-map-sea').trim()).toBe('#cfeef6');
    // Projected content sits on the same ground only while the wash reads the property, not a copy.
    expect(washScroller(host).className).toContain('var(--riv-map-sea)');
  });

  it('leaves --riv-tile at the default viewport-relative clamp when fitWidth is off (#709)', async () => {
    const { host, component, detect, fixture } = render();
    Object.defineProperty(viewport(host), 'clientWidth', { value: 200, configurable: true });
    component.rows.set([...ROWS]);
    detect();
    await fixture.whenStable();
    detect();
    const canvas = host.querySelector<HTMLElement>('app-beach-map-canvas')!;
    expect(canvas.style.getPropertyValue('--riv-tile').trim()).toBe('clamp(47px, 11vw, 56px)');
  });

  it('fits the tile size to the measured viewport width when fitWidth is on (#709)', async () => {
    const { host, component, detect, fixture } = render();
    component.fitWidth.set(true);
    // 4 tiles, 3 gaps of 6px: (312 - 18) / 4 = 73.5 → floored to 73, clamped to the 56px ceiling.
    Object.defineProperty(viewport(host), 'clientWidth', { value: 312, configurable: true });
    component.rows.set([row('A', null, true, ['1', '2', '3', '4'])]);
    detect();
    await fixture.whenStable();
    detect();
    const canvas = host.querySelector<HTMLElement>('app-beach-map-canvas')!;
    expect(canvas.style.getPropertyValue('--riv-tile').trim()).toBe('56px');
  });

  it('never fits a tile below the 44px touch-target floor, however tight the viewport (#709)', async () => {
    const { host, component, detect, fixture } = render();
    component.fitWidth.set(true);
    // 4 tiles, 3 gaps: (100 - 18) / 4 ≈ 20.5 — well under the floor.
    Object.defineProperty(viewport(host), 'clientWidth', { value: 100, configurable: true });
    component.rows.set([row('A', null, true, ['1', '2', '3', '4'])]);
    detect();
    await fixture.whenStable();
    detect();
    const canvas = host.querySelector<HTMLElement>('app-beach-map-canvas')!;
    expect(canvas.style.getPropertyValue('--riv-tile').trim()).toBe('44px');
  });

  it('re-fits the tile size on resize, converging with the overflow re-measure (#709)', async () => {
    const { host, component, detect, fixture } = render();
    component.fitWidth.set(true);
    Object.defineProperty(viewport(host), 'clientWidth', { value: 312, configurable: true });
    component.rows.set([row('A', null, true, ['1', '2', '3', '4'])]);
    detect();
    await fixture.whenStable();
    detect();
    const canvas = host.querySelector<HTMLElement>('app-beach-map-canvas')!;
    expect(canvas.style.getPropertyValue('--riv-tile').trim()).toBe('56px');

    const observer = StubResizeObserver.instances.at(-1)!;
    Object.defineProperty(viewport(host), 'clientWidth', { value: 156, configurable: true });
    observer.fire();
    detect();
    // (156 - 18) / 4 = 34.5 → floored to 34, clamped up to the 44px floor.
    expect(canvas.style.getPropertyValue('--riv-tile').trim()).toBe('44px');
  });

  it('leaves the row rail decorative by default — every other consumer is unchanged (#713)', () => {
    const { host } = render();
    expect(host.querySelector('[data-testid="row-code-fill"]')).toBeNull();
    expect(host.querySelector('[data-testid="row-code"]')).toBeTruthy();
  });

  it('renders the row rail as a labelled fill button when rowRailInteractive is on (#713)', () => {
    const { host, component, detect } = render();
    component.rowRailInteractive.set(true);
    detect();
    expect(host.querySelector('[data-testid="row-code"]')).toBeNull();
    const buttons = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[data-testid="row-code-fill"]'),
    );
    expect(buttons.length).toBe(4);
    expect(buttons[2].getAttribute('aria-label')).toBe('Fill row 2');
    expect(buttons[2].classList.contains('min-h-11')).toBe(true);
    expect(buttons[2].classList.contains('min-w-11')).toBe(true);
  });

  it('emits rowRailFill on click, and reserves the 44px column width for the button (#713)', () => {
    const { host, component, detect } = render();
    component.rowRailInteractive.set(true);
    detect();
    const button = host.querySelectorAll<HTMLButtonElement>('[data-testid="row-code-fill"]')[1];
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(component.rowFills).toEqual([1]);
    expect(button.parentElement!.parentElement!.className).toContain('min-w-11');
  });

  it('fills once on a real mouse click, never twice for the same mousedown+click pair (#713)', () => {
    const { host, component, detect } = render();
    component.rowRailInteractive.set(true);
    detect();
    const button = host.querySelectorAll<HTMLButtonElement>('[data-testid="row-code-fill"]')[0];
    // A real click fires mousedown, mouseup, then click(detail=1) — the trailing click must be a no-op.
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, buttons: 1 }));
    button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(component.rowFills).toEqual([0]);
  });

  it('sweeps a row-rail drag: mousedown then mouseenter fills every entered index (#713)', () => {
    const { host, component, detect } = render();
    component.rowRailInteractive.set(true);
    detect();
    const buttons = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[data-testid="row-code-fill"]'),
    );
    buttons[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, buttons: 1 }));
    buttons[1].dispatchEvent(
      new MouseEvent('mouseenter', { bubbles: true, button: 0, buttons: 1 }),
    );
    buttons[2].dispatchEvent(
      new MouseEvent('mouseenter', { bubbles: true, button: 0, buttons: 1 }),
    );
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(component.rowFills).toEqual([0, 1, 2]);

    // The sweep has ended: a further mouseenter with no button held fills nothing more.
    buttons[3].dispatchEvent(
      new MouseEvent('mouseenter', { bubbles: true, button: 0, buttons: 0 }),
    );
    expect(component.rowFills).toEqual([0, 1, 2]);
  });

  it('leaves the column header absent by default — every other consumer is unchanged (#713)', () => {
    const { host } = render();
    expect(host.querySelector('[data-testid="col-header-fill"]')).toBeNull();
  });

  it('renders a labelled fill button per column when colHeaderInteractive is on (#713)', () => {
    const { host, component, detect } = render();
    component.colHeaderInteractive.set(true);
    detect();
    // mapCols() is the widest row — row B has 3 seats.
    const buttons = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[data-testid="col-header-fill"]'),
    );
    expect(buttons.length).toBe(3);
    expect(buttons[1].getAttribute('aria-label')).toBe('Fill column 1');
    expect(buttons[1].classList.contains('min-h-11')).toBe(true);
    expect(buttons[1].classList.contains('min-w-11')).toBe(true);
  });

  it('emits colHeaderFill on click and sweeps a drag across headers (#713)', () => {
    const { host, component, detect } = render();
    component.colHeaderInteractive.set(true);
    detect();
    const buttons = Array.from(
      host.querySelectorAll<HTMLButtonElement>('[data-testid="col-header-fill"]'),
    );
    buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(component.colFills).toEqual([0]);

    buttons[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, buttons: 1 }));
    buttons[1].dispatchEvent(
      new MouseEvent('mouseenter', { bubbles: true, button: 0, buttons: 1 }),
    );
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(component.colFills).toEqual([0, 0, 1]);
  });

  it('renders no Fit/100% toggle by default — every other consumer is unchanged (#713)', () => {
    const { host } = render();
    expect(host.querySelector('[data-testid="zoom-fit"]')).toBeNull();
    expect(host.querySelector('[data-testid="zoom-100"]')).toBeNull();
  });

  it('renders the Fit/100% toggle, Fit active by default, when zoomControl is on (#713)', () => {
    const { host, component, detect } = render();
    component.zoomControl.set(true);
    detect();
    expect(host.querySelector('[data-testid="zoom-fit"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(host.querySelector('[data-testid="zoom-100"]')?.getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('pins the tile size to the 56px ceiling at 100%, regardless of the measured fit (#713)', async () => {
    const { host, component, detect, fixture } = render();
    component.zoomControl.set(true);
    component.fitWidth.set(true);
    // A narrow viewport would fit tiles down toward the 44px floor…
    Object.defineProperty(viewport(host), 'clientWidth', { value: 100, configurable: true });
    component.rows.set([row('A', null, true, ['1', '2', '3', '4'])]);
    detect();
    await fixture.whenStable();
    detect();
    const canvas = host.querySelector<HTMLElement>('app-beach-map-canvas')!;
    expect(canvas.style.getPropertyValue('--riv-tile').trim()).toBe('44px');

    // …but 100% pins it to the native ceiling instead, overflowing rather than shrinking.
    host.querySelector<HTMLButtonElement>('[data-testid="zoom-100"]')!.click();
    detect();
    expect(canvas.style.getPropertyValue('--riv-tile').trim()).toBe('56px');
    expect(host.querySelector('[data-testid="zoom-100"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );

    // Fit returns to the measured value.
    host.querySelector<HTMLButtonElement>('[data-testid="zoom-fit"]')!.click();
    detect();
    expect(canvas.style.getPropertyValue('--riv-tile').trim()).toBe('44px');
  });

  it('never arms the pan gesture unless zoomControl is on and 100% is active (#713)', () => {
    const { host, component, detect } = render();
    const vp = viewport(host);

    // dragPan is on but zoomControl is off — the ordinary dragPan path, unaffected by Space.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
    vp.scrollLeft = 50;
    vp.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }));
    vp.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 60 }));
    expect(vp.scrollLeft).toBe(90); // the ordinary dragPan path, unaffected by Space
    vp.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }));

    component.zoomControl.set(true);
    detect();
    // zoomControl is on, but Fit (not 100%) is active — the dedicated gesture still doesn't arm.
    component.dragPan.set(false);
    detect();
    vp.scrollLeft = 50;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
    vp.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }));
    vp.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 60 }));
    expect(vp.scrollLeft).toBe(50); // dragPan is off and the gesture isn't armed at Fit
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }));
  });

  it('arms a dedicated Space-drag pan at 100% zoom, independent of dragPan (#713)', () => {
    const { host, component, detect } = render();
    component.zoomControl.set(true);
    component.dragPan.set(false); // the editor's own posture: no free drag-to-pan
    detect();
    host.querySelector<HTMLButtonElement>('[data-testid="zoom-100"]')!.click();
    detect();

    const vp = viewport(host);
    vp.scrollLeft = 50;

    // A plain drag with no Space held still doesn't pan.
    vp.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }));
    vp.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 60 }));
    expect(vp.scrollLeft).toBe(50);
    vp.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    // Holding Space arms it.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
    vp.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }));
    vp.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 60 }));
    expect(vp.scrollLeft).toBe(90);
    vp.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }));
  });

  it('leaves Space alone while focus sits on a button — native activation, never the pan gesture (#713 R-3)', () => {
    const { host, component, detect } = render();
    component.zoomControl.set(true);
    detect();
    host.querySelector<HTMLButtonElement>('[data-testid="zoom-100"]')!.click();
    detect();

    const button = viewport(host).querySelector<HTMLButtonElement>('button')!;
    button.focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));

    const vp = viewport(host);
    vp.scrollLeft = 50;
    vp.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }));
    vp.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 60 }));
    // Space over a focused button never armed the gesture — no pan.
    expect(vp.scrollLeft).toBe(50);
    vp.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }));
  });

  it('leaves Space alone while focus sits on a text field — never arms the gesture, never blocks typing (#713)', () => {
    const { host, component, detect } = render();
    component.zoomControl.set(true);
    detect();
    host.querySelector<HTMLButtonElement>('[data-testid="zoom-100"]')!.click();
    detect();

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    try {
      const prevented = !window.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', code: 'Space', cancelable: true }),
      );
      expect(prevented).toBe(false); // preventDefault was never called — the space types normally

      const vp = viewport(host);
      vp.scrollLeft = 50;
      vp.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 100 }));
      vp.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 60 }));
      expect(vp.scrollLeft).toBe(50); // the gesture never armed
    } finally {
      input.remove();
    }
  });

  it('pans on a two-finger touch drag at 100% zoom, only when zoomControl+full are both on (#713)', () => {
    const { host, component, detect } = render();
    component.zoomControl.set(true);
    detect();
    host.querySelector<HTMLButtonElement>('[data-testid="zoom-100"]')!.click();
    detect();

    const vp = viewport(host);
    vp.scrollLeft = 50;
    const touches = (x: number): Touch[] =>
      [
        { clientX: x, clientY: 200, identifier: 0 },
        { clientX: x + 40, clientY: 200, identifier: 1 },
      ] as unknown as Touch[];
    vp.dispatchEvent(
      new TouchEvent('touchstart', { bubbles: true, touches: touches(100), cancelable: true }),
    );
    vp.dispatchEvent(
      new TouchEvent('touchmove', { bubbles: true, touches: touches(60), cancelable: true }),
    );
    expect(vp.scrollLeft).toBe(90);
    vp.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [] }));

    // A single-finger touch is left alone (unchanged — native scrolling, no drag-pan via touch).
    vp.scrollLeft = 50;
    vp.dispatchEvent(
      new TouchEvent('touchstart', {
        bubbles: true,
        touches: [{ clientX: 100, clientY: 200, identifier: 0 } as unknown as Touch],
      }),
    );
    vp.dispatchEvent(
      new TouchEvent('touchmove', {
        bubbles: true,
        touches: [{ clientX: 60, clientY: 200, identifier: 0 } as unknown as Touch],
      }),
    );
    expect(vp.scrollLeft).toBe(50);
  });

  it('exposes panGestureActive so a consumer can suppress its own drag gesture during the pan (#713)', () => {
    const { host, component, detect, fixture } = render();
    component.zoomControl.set(true);
    detect();
    host.querySelector<HTMLButtonElement>('[data-testid="zoom-100"]')!.click();
    detect();

    const canvasDebugEl = fixture.debugElement.query((n) => n.name === 'app-beach-map-canvas');
    const instance = canvasDebugEl.componentInstance as BeachMapCanvas;
    expect(instance.panGestureActive()).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
    expect(instance.panGestureActive()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }));
    expect(instance.panGestureActive()).toBe(false);
  });

  it('collapses the legend band for a host that projects none — the operator surfaces (#701)', () => {
    const fixture = TestBed.createComponent(LegendlessCanvasHost);
    fixture.detectChanges();
    const children = frameChildren(fixture.nativeElement as HTMLElement);
    const band = children[bannerIndex(children) + 1];
    // `:empty` is what makes the band generate no box, so the two margins still cancel.
    expect(band.children.length).toBe(0);
    expect(band.classList.contains('empty:hidden')).toBe(true);
    expect(children[bannerIndex(children) + 2].matches('[data-riv-scroller]')).toBe(true);
  });
});
