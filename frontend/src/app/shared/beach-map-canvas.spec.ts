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
      <p canvasFooter data-testid="footer-note">Tap any free set to book it.</p>
      <p canvasEmpty data-testid="empty-note">Nothing here yet.</p>
    </app-beach-map-canvas>
  `,
})
class CanvasHost {
  readonly rows = signal<readonly TestRow[]>(ROWS);
  readonly dragPan = signal(true);
  readonly taps: string[] = [];
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

  function rowGrid(host: HTMLElement): HTMLElement {
    const el = viewport(host).querySelector<HTMLElement>('.w-max');
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

  it('shows the pan hint only where drag actually pans (never on a dragPan-off surface)', async () => {
    const { host, component, detect, fixture } = render();
    // jsdom measures 0 — give the viewport a real overflow through the DOM measurement seam.
    const vp = viewport(host);
    seedGridWidth(host, 500);
    Object.defineProperty(vp, 'clientWidth', { value: 100, configurable: true });
    component.rows.set([...ROWS]);
    detect();
    await fixture.whenStable();
    detect();
    expect(host.querySelector('[data-testid="scroll-hint"]')).toBeTruthy();

    component.dragPan.set(false);
    detect();
    // "Drag … to pan" would instruct the wrong (paint) gesture on a dragPan-off surface (#674 F-3).
    expect(host.querySelector('[data-testid="scroll-hint"]')).toBeNull();
  });

  it('shows the pan hint on vertical-only overflow, and never with dragPan off', async () => {
    const { host, component, detect, fixture } = render();
    seedVerticalOverflow(washScroller(host));
    component.rows.set([...ROWS]);
    detect();
    await fixture.whenStable();
    detect();
    expect(host.querySelector('[data-testid="scroll-hint"]')).toBeTruthy();

    component.dragPan.set(false);
    detect();
    expect(host.querySelector('[data-testid="scroll-hint"]')).toBeNull();
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

    // Narrow first, so the hint is on and `.pannable` is padding the grid by 16px a side.
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
});
