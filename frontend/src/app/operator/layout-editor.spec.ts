import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi } from 'vitest';

import { expectCellsFillCanvasRow } from '../../testing/beach-map-height';
import { todayBookingDate } from '../shared/booking-date';
import { BeachMapCanvas } from '../shared/beach-map-canvas';
import { SetView } from '../shared/venue-views';
import { ConsoleVenueMap } from './console-venue-map';
import { LayoutEditor } from './layout-editor';
import { RemodelPreview } from './operator-console.model';
import { FULL_PREVIEW, MOVES_ONLY_PREVIEW } from './remodel-preview-panel.spec';
import { RECEIPT } from './remodel-receipt-panel.spec';
import { SetLock } from './operator-console.model';

interface SentBody {
  sets: {
    rowLabel: string;
    positionNo: number;
    tier: string;
    pool: string;
    gridX: number;
    gridY: number;
    price: { minorUnits: number; currency: string };
  }[];
  expectedVersion: number;
  previewToken?: string;
}

/** The captured request body, typed — Angular types `HttpRequest.body` as `any`. */
function body(req: { request: { body: unknown } }): SentBody {
  return req.request.body as SentBody;
}

/**
 * The layout editor. Reads `:venueId` from the PARENT route (child routes don't inherit it)
 * and loads the venue map to seed its grid; the mock mirrors that. Drives generate, drag-paint, save
 * (asserting the one bulk PUT payload), and the SETS_IN_USE refusal that marks the named sets.
 */
const EMPTY_PREVIEW: RemodelPreview = {
  moves: [],
  refunds: [],
  releases: [],
  staffHolds: [],
  blocks: [],
  keep: [],
  previewToken: 'v1.empty',
};

describe('LayoutEditor (#172)', () => {
  let fixture: ComponentFixture<LayoutEditor>;
  let http: HttpTestingController;
  let host: HTMLElement;
  let params$: BehaviorSubject<ParamMap>;

  function configure(): void {
    params$ = new BehaviorSubject(convertToParamMap({ venueId: '1' }));
    TestBed.configureTestingModule({
      imports: [LayoutEditor],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({}) },
            parent: { snapshot: { paramMap: params$.value }, paramMap: params$ },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(LayoutEditor);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // OperatorAuth restores the session on construction — settle it as signed-out (the editor renders
    // regardless of sign-in state; the shell gates access).
    http
      .expectOne((r) => r.url.includes('/api/auth/me'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
  }

  function render(initialSets: SetView[] = [], setVersion = 0, locks: SetLock[] = []): void {
    configure();
    // Flush the constructor's layout load so the grid seeds and the optimistic-concurrency token is captured.
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({ map: { id: 1, name: 'V', sets: initialSets, setVersion }, locks });
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  }

  /** The initial map read FAILS — no token is captured (loadFailed), so Save must not silently no-op. */
  function renderWithFailedLoad(): void {
    configure();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  }

  afterEach(() => http.verify());

  function byId(id: string): HTMLElement {
    return host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  }

  function cells(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll<HTMLButtonElement>('[data-testid="layout-cell"]'));
  }

  /** Generate's inert posture is `aria-disabled` via `[appBusy]`, never `[disabled]` (RV-FE-9). */
  function generateInert(): boolean {
    return byId('layout-generate').getAttribute('aria-disabled') === 'true';
  }

  /**
   * Arm the default brush, showing the bulk generate/paint surface. Needed wherever a test seeds a
   * venue that already has sets: since #600 such a venue opens in per-set mode, because that is the
   * only mode that keeps working once it is trading (AC-6). The bulk behaviours below are unchanged
   * — only their default is.
   */
  function useBulkMode(): void {
    byId('layout-tool-premium').click();
    fixture.detectChanges();
  }

  function setInput(id: string, value: string): void {
    const input = byId(id) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function generate(rows: string, cols: string): void {
    setInput('layout-gen-rows', rows);
    setInput('layout-gen-cols', cols);
    byId('layout-generate').click();
    fixture.detectChanges();
  }

  it('renders a skeleton mirroring the loaded grid while the read is in flight (#744)', () => {
    configure();
    host = fixture.nativeElement as HTMLElement;

    expect(byId('layout-loading')).toBeTruthy();
    expect(host.querySelectorAll('[data-testid="layout-skeleton-tile"]').length).toBeGreaterThan(0);
    expect(host.querySelector('[data-testid="layout-empty"]')).toBeNull();
    expect(host.querySelector('[data-testid="layout-cell"]')).toBeNull();
    expect(host.querySelector('[data-testid="layout-save-bar"]')).toBeNull();

    // The sentence the skeleton replaces; a mirrored shape says it without a reflow (#744).
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({ map: { id: 1, name: 'V', sets: [], setVersion: 0 }, locks: [] });
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="layout-loading"]')).toBeNull();
    expect(byId('layout-empty')).toBeTruthy();
  });

  it('the layout skeleton is decorative and motion-reduce safe (#744)', () => {
    configure();
    host = fixture.nativeElement as HTMLElement;

    expect(byId('layout-loading').getAttribute('aria-hidden')).toBe('true');
    expect(byId('layout-loading').hasAttribute('inert')).toBe(true);
    const tiles = Array.from(
      host.querySelectorAll<HTMLElement>('[data-testid="layout-skeleton-tile"]'),
    );
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile.classList.contains('animate-pulse')).toBe(true);
      expect(tile.classList.contains('motion-reduce:animate-none')).toBe(true);
    }

    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({ map: { id: 1, name: 'V', sets: [], setVersion: 0 }, locks: [] });
    fixture.detectChanges();
  });

  it('starts empty and generates an R×C grid with row A front-row premium', () => {
    render();
    expect(byId('layout-empty')).toBeTruthy();
    // A settled read on a set-less venue: emptiness is a fact now, so Generate acts with no confirm.
    expect(generateInert()).toBe(false);

    generate('2', '3');

    expect(cells()).toHaveLength(6);
    // Row A (first three cells) is premium; row B standard.
    expect(cells()[0].getAttribute('data-state')).toBe('premium');
    expect(cells()[3].getAttribute('data-state')).toBe('standard');
    // The Generate button shows the live total.
    expect(byId('layout-generate').textContent).toContain('6');
  });

  it('renders the merged tool rail with five rows and no mode pills (#711)', () => {
    render();

    expect(host.querySelector('[data-testid="layout-mode-bulk"]')).toBeNull();
    expect(host.querySelector('[data-testid="layout-mode-sets"]')).toBeNull();
    expect(byId('layout-tool-rail')).toBeTruthy();
    expect(byId('layout-tool-select')).toBeTruthy();
    expect(byId('layout-tool-premium')).toBeTruthy();
    expect(byId('layout-tool-standard')).toBeTruthy();
    expect(byId('layout-tool-walkin')).toBeTruthy();
    expect(byId('layout-tool-gap')).toBeTruthy();
    // The default brush is armed on an empty venue; Select carries no live count.
    expect(byId('layout-tool-premium').getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-testid="layout-count-select"]')).toBeNull();
  });

  it('arming Select switches to the set-editor surface and never paints (#711)', () => {
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1)]);

    // The venue has sets, so Select opens armed already (AC-6 default).
    expect(byId('layout-tool-select').getAttribute('aria-pressed')).toBe('true');
    expect(byId('set-editor')).toBeTruthy();
    expect(host.querySelector('[data-testid="layout-cell"]')).toBeNull();

    byId('set-cell').click();
    fixture.detectChanges();
    expect(byId('set-selected')).toBeTruthy(); // S1's selection state, not a paint
  });

  it('Generate lives beneath the tool rail and keeps the regenerate confirm step (#711)', () => {
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1)]);

    // Reachable with Select armed — Generate is a rail action, not gated by the armed tool.
    expect(byId('layout-tool-select').getAttribute('aria-pressed')).toBe('true');
    expect(byId('layout-generate')).toBeTruthy();

    setInput('layout-gen-rows', '1');
    setInput('layout-gen-cols', '1');
    byId('layout-generate').click();
    fixture.detectChanges();
    expect(byId('layout-confirm-regen')).toBeTruthy(); // the venue already has a layout — confirm first

    byId('layout-confirm-yes').click();
    fixture.detectChanges();

    // A fresh grid needs the paint surface: generating rearms the active brush.
    expect(byId('layout-tool-premium').getAttribute('aria-pressed')).toBe('true');
    expect(cells()).toHaveLength(1);
  });

  it('fills the canvas-owned row height with bulk cells, never a height mechanism of its own (#685)', () => {
    render();
    generate('2', '3');
    expectCellsFillCanvasRow(host, '[data-testid="layout-cell"]');
  });

  it('asks for confirmation before regenerating over an existing grid, then replaces', () => {
    render();
    generate('2', '2'); // 4 cells
    expect(cells()).toHaveLength(4);

    // Regenerate to a smaller grid: the first click only opens the confirm, it does not replace yet.
    setInput('layout-gen-rows', '1');
    setInput('layout-gen-cols', '1');
    expect(generateInert()).toBe(false);
    byId('layout-generate').click();
    fixture.detectChanges();
    expect(byId('layout-confirm-regen')).toBeTruthy();
    expect(cells()).toHaveLength(4); // unchanged until confirmed

    byId('layout-confirm-yes').click();
    fixture.detectChanges();
    expect(cells()).toHaveLength(1);
  });

  it('moves focus with the regenerate confirmation (WCAG 2.4.3, #604)', async () => {
    render();
    generate('2', '2');

    byId('layout-generate').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(byId('layout-confirm-yes'));

    byId('layout-confirm-no').click();
    fixture.detectChanges();
    await fixture.whenStable();
    // Cancelling destroys the confirm button focus was on; Generate is what it replaced.
    expect(document.activeElement).toBe(byId('layout-generate'));

    byId('layout-generate').click();
    fixture.detectChanges();
    await fixture.whenStable();
    byId('layout-confirm-yes').click();
    fixture.detectChanges();
    await fixture.whenStable();

    // A completed regenerate leaves Generate in place, so focus returns there rather than to <body>.
    expect(byId('layout-confirm-regen')).toBeFalsy();
    expect(document.activeElement).toBe(byId('layout-generate'));
  });

  it('paints a cell with the active tool (click = keyboard path)', () => {
    render();
    generate('1', '3');
    byId('layout-tool-walkin').click();
    fixture.detectChanges();

    cells()[1].click(); // Enter/Space on a <button> fire click — the keyboard path
    fixture.detectChanges();

    expect(cells()[1].getAttribute('data-state')).toBe('walkin');
    expect(byId('layout-count-walkin').textContent?.trim()).toBe('1');
  });

  it('drag-paints across a run of cells (mousedown → mouseenter → mouseup)', () => {
    render();
    generate('1', '4');
    byId('layout-tool-gap').click();
    fixture.detectChanges();

    cells()[0].dispatchEvent(new MouseEvent('mousedown', { buttons: 1 }));
    cells()[1].dispatchEvent(new MouseEvent('mouseenter', { buttons: 1 }));
    cells()[2].dispatchEvent(new MouseEvent('mouseenter', { buttons: 1 }));
    // Painting ends on release anywhere — the paint-end listener is document-level (#672 slice 2).
    document.dispatchEvent(new MouseEvent('mouseup'));
    fixture.detectChanges();

    expect(cells()[0].getAttribute('data-state')).toBe('gap');
    expect(cells()[1].getAttribute('data-state')).toBe('gap');
    expect(cells()[2].getAttribute('data-state')).toBe('gap');
    expect(cells()[3].getAttribute('data-state')).toBe('premium'); // not dragged over (row A = premium)
  });

  it('drag-paints across a run of cells by touch, ending on document touchend (#715)', () => {
    render();
    generate('1', '4');
    byId('layout-tool-gap').click();
    fixture.detectChanges();

    // jsdom doesn't define elementFromPoint at all — stub it to answer by cell index.
    (document as unknown as { elementFromPoint: (x: number) => Element }).elementFromPoint = (
      x: number,
    ) => cells()[x];

    cells()[0].dispatchEvent(new Event('touchstart', { bubbles: true }));
    for (const x of [1, 2]) {
      const touchmove = new Event('touchmove', { bubbles: true });
      Object.defineProperty(touchmove, 'touches', { value: [{ clientX: x, clientY: 0 }] });
      document.dispatchEvent(touchmove);
    }
    document.dispatchEvent(new Event('touchend'));
    fixture.detectChanges();

    expect(cells()[0].getAttribute('data-state')).toBe('gap');
    expect(cells()[1].getAttribute('data-state')).toBe('gap');
    expect(cells()[2].getAttribute('data-state')).toBe('gap');
    expect(cells()[3].getAttribute('data-state')).toBe('premium'); // not dragged over

    // touchend disarmed painting: a stray later touchmove paints nothing.
    const touchmove = new Event('touchmove', { bubbles: true });
    Object.defineProperty(touchmove, 'touches', { value: [{ clientX: 3, clientY: 0 }] });
    document.dispatchEvent(touchmove);
    fixture.detectChanges();
    expect(cells()[3].getAttribute('data-state')).toBe('premium');

    delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
  });

  it('every bulk-paint cell declares touch-action: none, so a paint drag never scrolls the page (#715)', () => {
    render();
    generate('1', '2');

    for (const cell of cells()) {
      expect(cell.className).toContain('touch-none');
    }
  });

  it('disarms painting when the mouse re-enters with no button held (off-window release)', () => {
    render();
    generate('1', '4');
    byId('layout-tool-gap').click();
    fixture.detectChanges();

    // An off-window release fires no document mouseup; hovering back must not paint (F-1).
    cells()[0].dispatchEvent(new MouseEvent('mousedown', { buttons: 1 }));
    cells()[1].dispatchEvent(new MouseEvent('mouseenter', { buttons: 0 }));
    cells()[2].dispatchEvent(new MouseEvent('mouseenter', { buttons: 0 }));
    fixture.detectChanges();

    expect(cells()[1].getAttribute('data-state')).toBe('premium');
    expect(cells()[2].getAttribute('data-state')).toBe('premium');
  });

  it('ignores non-primary buttons: a middle-click neither paints nor arms a drag', () => {
    render();
    generate('1', '4');
    byId('layout-tool-gap').click();
    fixture.detectChanges();

    cells()[0].dispatchEvent(new MouseEvent('mousedown', { button: 1, buttons: 4 }));
    cells()[1].dispatchEvent(new MouseEvent('mouseenter', { buttons: 4 }));
    fixture.detectChanges();

    expect(cells()[0].getAttribute('data-state')).toBe('premium');
    expect(cells()[1].getAttribute('data-state')).toBe('premium');
  });

  it('a press starting outside the grid clears a stale armed flag before it can paint', () => {
    render();
    generate('1', '4');
    byId('layout-tool-gap').click();
    fixture.detectChanges();

    // Arm, then simulate an off-window release (no mouseup anywhere) leaving the flag stale.
    cells()[0].dispatchEvent(new MouseEvent('mousedown', { buttons: 1 }));
    // A later press elsewhere on the page (e.g. starting a text selection) must disarm it…
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, buttons: 1 }));
    // …so sweeping across the grid with that button held paints nothing.
    cells()[1].dispatchEvent(new MouseEvent('mouseenter', { buttons: 1 }));
    cells()[2].dispatchEvent(new MouseEvent('mouseenter', { buttons: 1 }));
    fixture.detectChanges();

    expect(cells()[1].getAttribute('data-state')).toBe('premium');
    expect(cells()[2].getAttribute('data-state')).toBe('premium');
  });

  describe('locked cells (#1031)', () => {
    const LOCK: SetLock = { setId: 2, bookedOn: '2026-09-12', heldOn: '2026-09-12' };
    const DESCRIPTION =
      'Locked — booked Sat 12 Sept 2026. Can’t be moved or removed; tier and pool can still change.';

    /** Row A: three standard online sets, the middle one pinned by a booking. Bulk mode, premium armed. */
    function renderLockedRow(): void {
      render(
        [
          seat(1, 'STANDARD', 'ONLINE', 1, 1),
          seat(2, 'STANDARD', 'ONLINE', 2, 1),
          seat(3, 'STANDARD', 'ONLINE', 3, 1),
        ],
        0,
        [LOCK],
      );
      useBulkMode();
    }

    function dirtyText(): string {
      return byId('layout-dirty-count').textContent?.trim() ?? '';
    }

    it('marks the locked cell with the glyph, the reason as its description, and counts it in the rail', () => {
      renderLockedRow();
      const locked = cells()[1];

      expect(locked.dataset['locked']).toBe('true');
      expect(locked.querySelector('app-lock-icon svg')).toBeTruthy();
      const described = host.querySelector(`#${locked.getAttribute('aria-describedby')}`);
      expect(described?.textContent?.trim()).toBe(DESCRIPTION);
      expect(locked.getAttribute('title')).toContain(DESCRIPTION);
      expect(cells()[0].hasAttribute('aria-describedby')).toBe(false);
      expect(cells()[0].querySelector('app-lock-icon')).toBeNull();
      expect(byId('layout-locked-legend').textContent).toContain(
        '1 set is booked or held by staff',
      );
    });

    it('the tier and pool brushes repaint the locked cell and count that change (AC-8)', () => {
      renderLockedRow();

      cells()[1].click();
      fixture.detectChanges();
      expect(cells()[1].getAttribute('data-state')).toBe('premium');
      expect(dirtyText()).toBe('1 unsaved change');

      byId('layout-tool-walkin').click();
      fixture.detectChanges();
      cells()[1].click();
      fixture.detectChanges();
      expect(cells()[1].getAttribute('data-state')).toBe('walkin');
      expect(dirtyText()).toBe('1 unsaved change');
      expect(byId('layout-lock-notice').textContent?.trim()).toBe('');
    });

    it('the gap brush leaves the locked cell as it is, says why, and counts nothing (AC-8)', () => {
      renderLockedRow();
      byId('layout-tool-gap').click();
      fixture.detectChanges();

      cells()[1].click();
      fixture.detectChanges();

      expect(cells()[1].getAttribute('data-state')).toBe('standard');
      expect(dirtyText()).toBe('No unsaved changes');
      expect(host.querySelector('[data-testid="layout-last-change"]')).toBeNull();
      expect(byId('layout-lock-notice').textContent?.replace(/\s+/g, ' ').trim()).toBe(
        'Row A · position 2 is booked Sat 12 Sept 2026 — it can’t become a gap. Its tier and pool can still change.',
      );
    });

    it('a gap drag-sweep skips the locked cell and counts only the others (AC-9)', () => {
      renderLockedRow();
      byId('layout-tool-gap').click();
      fixture.detectChanges();

      cells()[0].dispatchEvent(new MouseEvent('mousedown', { buttons: 1 }));
      cells()[1].dispatchEvent(new MouseEvent('mouseenter', { buttons: 1 }));
      cells()[2].dispatchEvent(new MouseEvent('mouseenter', { buttons: 1 }));
      document.dispatchEvent(new MouseEvent('mouseup'));
      fixture.detectChanges();

      expect(cells().map((c) => c.getAttribute('data-state'))).toEqual(['gap', 'standard', 'gap']);
      expect(dirtyText()).toBe('2 unsaved changes');
      expect(byId('layout-lock-notice').textContent).toContain('position 2 is booked');
    });

    it('a gap row fill keeps the locked cell and reports it; a tier fill repaints it (AC-9)', () => {
      renderLockedRow();
      byId('layout-tool-gap').click();
      fixture.detectChanges();

      rowFillButtons()[0].click();
      fixture.detectChanges();

      expect(cells().map((c) => c.getAttribute('data-state'))).toEqual(['gap', 'standard', 'gap']);
      expect(dirtyText()).toBe('2 unsaved changes');
      expect(byId('layout-lock-notice').textContent).toContain(
        'Row A → Gap / aisle kept 1 locked set',
      );

      byId('layout-tool-premium').click();
      fixture.detectChanges();
      expect(byId('layout-lock-notice').textContent?.trim()).toBe('');
      rowFillButtons()[0].click();
      fixture.detectChanges();
      expect(cells().every((c) => c.getAttribute('data-state') === 'premium')).toBe(true);
      expect(dirtyText()).toBe('3 unsaved changes');
    });

    it('a gap column fill keeps the locked cell too', () => {
      renderLockedRow();
      byId('layout-tool-gap').click();
      fixture.detectChanges();

      colFillButtons()[1].click();
      fixture.detectChanges();

      expect(cells()[1].getAttribute('data-state')).toBe('standard');
      expect(dirtyText()).toBe('No unsaved changes');
      expect(byId('layout-lock-notice').textContent).toContain(
        'Column 2 → Gap / aisle kept 1 locked set',
      );
    });

    it('hands the locks to the per-set surface and clears them on a venue switch', () => {
      renderLockedRow();
      byId('layout-tool-select').click();
      fixture.detectChanges();
      expect(host.querySelector('[data-testid="set-cell"][data-locked="true"]')).toBeTruthy();

      params$.next(convertToParamMap({ venueId: '2' }));
      fixture.detectChanges();
      http
        .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/2'))
        .flush({
          map: { id: 2, name: 'W', sets: [seat(9, 'STANDARD', 'ONLINE', 1, 1)], setVersion: 0 },
          locks: [],
        });
      fixture.detectChanges();
      expect(host.querySelector('[data-locked="true"]')).toBeNull();
    });
  });

  function rowFillButtons(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll<HTMLButtonElement>('[data-testid="row-code-fill"]'));
  }

  function colFillButtons(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll<HTMLButtonElement>('[data-testid="col-header-fill"]'));
  }

  it('fills a whole row with the active brush on one click, updating counts and dirty state (#713)', () => {
    render();
    generate('2', '3');
    byId('layout-tool-walkin').click();
    fixture.detectChanges();

    rowFillButtons()[1].click(); // row B, all standard by default
    fixture.detectChanges();

    const rowBCells = cells().slice(3, 6);
    expect(rowBCells.every((c) => c.getAttribute('data-state') === 'walkin')).toBe(true);
    expect(cells()[0].getAttribute('data-state')).toBe('premium'); // row A untouched
    expect(byId('layout-count-walkin').textContent?.trim()).toBe('3');
    expect(byId('layout-last-change').textContent).toContain('Row B');
    expect(byId('layout-last-change').textContent).toContain('Walk-in pool');
    expect(byId('layout-dirty-count').textContent).toContain('6 unsaved changes'); // whole grid, freshly generated
  });

  it('fills a whole column with the active brush on one click (#713)', () => {
    render();
    generate('2', '3');
    byId('layout-tool-gap').click();
    fixture.detectChanges();

    colFillButtons()[2].click(); // column 3
    fixture.detectChanges();

    expect(cells()[2].getAttribute('data-state')).toBe('gap');
    expect(cells()[5].getAttribute('data-state')).toBe('gap');
    expect(cells()[0].getAttribute('data-state')).toBe('premium');
    expect(byId('layout-last-change').textContent).toContain('Column 3');
  });

  it('sweeps a fill drag across several row chips, one dirty-state update covering the band (#713)', () => {
    render();
    generate('3', '2');
    byId('layout-tool-gap').click();
    fixture.detectChanges();

    const rails = rowFillButtons();
    rails[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, buttons: 1 }));
    rails[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, button: 0, buttons: 1 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    fixture.detectChanges();

    expect(
      cells()
        .slice(0, 4)
        .every((c) => c.getAttribute('data-state') === 'gap'),
    ).toBe(true);
    expect(cells()[4].getAttribute('data-state')).toBe('standard'); // row C, not swept
  });

  it('renders no fill rail while Select is armed — the bulk canvas is not on screen (#713)', () => {
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1)]);
    fixture.detectChanges();
    expect(rowFillButtons()).toHaveLength(0);
    expect(colFillButtons()).toHaveLength(0);
  });

  it('never paints while the canvas reports a pan gesture active at 100% zoom (#713)', () => {
    render();
    generate('1', '3');
    byId('layout-tool-walkin').click();
    fixture.detectChanges();

    byId('zoom-100').click();
    fixture.detectChanges();
    const canvasDebugEl = fixture.debugElement.query((n) => n.name === 'app-beach-map-canvas');
    const canvas = canvasDebugEl.componentInstance as BeachMapCanvas;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space' }));
    fixture.detectChanges();
    expect(canvas.panGestureActive()).toBe(true);

    cells()[0].click();
    fixture.detectChanges();
    expect(cells()[0].getAttribute('data-state')).toBe('premium'); // unpainted — the drag was a pan

    window.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space' }));
    fixture.detectChanges();
    cells()[0].click();
    fixture.detectChanges();
    expect(cells()[0].getAttribute('data-state')).toBe('walkin'); // Space released — painting resumes
  });

  it('discard reverts a row/column fill exactly like a single-cell paint (#713)', () => {
    render();
    generate('2', '2');
    byId('layout-tool-gap').click();
    fixture.detectChanges();

    rowFillButtons()[0].click();
    fixture.detectChanges();
    expect(cells()[0].getAttribute('data-state')).toBe('gap');

    byId('layout-discard').click();
    fixture.detectChanges();
    expect(cells()).toHaveLength(0); // discard restores the baseline — empty before Generate was saved
  });

  it('marks every row a zone of its own: per-row price chips, no reflow while painting (#674 F-2)', () => {
    render();
    generate('2', '3');
    fixture.detectChanges();

    // Row A €35 premium, row B €20 standard — a chip per row, like the old per-row prices.
    const prices = [...host.querySelectorAll<HTMLElement>('[data-testid="row-price"]')].map((n) =>
      n.textContent?.trim(),
    );
    expect(prices).toEqual(['€35', '€20']);

    // Painting B1 premium re-prices row B; the chip updates but no zone gap appears or moves.
    const gapsBefore = host.querySelectorAll('[data-map-row].mt-3').length;
    byId('layout-tool-premium').click();
    fixture.detectChanges();
    cells()[3].click();
    fixture.detectChanges();
    expect(
      [...host.querySelectorAll<HTMLElement>('[data-testid="row-price"]')].map((n) =>
        n.textContent?.trim(),
      ),
    ).toEqual(['€35', '€35']);
    expect(host.querySelectorAll('[data-map-row].mt-3').length).toBe(gapsBefore);
  });

  it('exposes an accessible per-cell label naming row, position and state', () => {
    render();
    generate('1', '2');
    expect(cells()[0].getAttribute('aria-label')).toBe(
      'Row A position 1, front row, premium, online',
    );
  });

  it('saves the whole grid as one PUT, omitting gap cells', async () => {
    render();
    generate('1', '2');
    // Erase the second cell to a gap so it is excluded from the payload.
    byId('layout-tool-gap').click();
    fixture.detectChanges();
    cells()[1].click();
    fixture.detectChanges();

    byId('layout-save').click();
    const req = http.expectOne(
      (r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'),
    );
    expect(body(req).sets).toHaveLength(1);
    expect(body(req).sets[0]).toMatchObject({
      rowLabel: 'A',
      positionNo: 1,
      tier: 'PREMIUM',
      pool: 'ONLINE',
      gridX: 1,
      gridY: 1,
    });
    expect(body(req).sets[0].price.minorUnits).toBe(3500);
    // The loaded optimistic-concurrency token rides the write body (0 for the fresh render mock).
    expect(body(req).expectedVersion).toBe(0);
    req.flush(null);
    await fixture.whenStable(); // onSave awaits the PUT — settle the notice
    fixture.detectChanges();
    expect(byId('layout-saved')).toBeTruthy();
  });

  it('tracks the unsaved-change count and the latest-change description across paint/generate/save (#712)', async () => {
    render();
    expect(byId('layout-dirty-count').textContent).toContain('No unsaved changes');
    expect(byId('layout-last-saved').textContent).toContain('Not saved yet');

    generate('1', '2');
    expect(byId('layout-dirty-count').textContent).toContain('2 unsaved changes');
    expect(byId('layout-last-change').textContent).toContain('Generated a 1×2 grid');

    byId('layout-tool-gap').click();
    fixture.detectChanges();
    cells()[1].click();
    fixture.detectChanges();
    // Painting the second cell back to 'gap' matches the empty baseline there, so only cell 1 stays dirty.
    expect(byId('layout-dirty-count').textContent).toContain('1 unsaved change');
    expect(byId('layout-last-change').textContent).toContain('Row A · position 2 → Gap');

    byId('layout-save').click();
    const req = http.expectOne(
      (r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'),
    );
    req.flush(null);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byId('layout-dirty-count').textContent).toContain('No unsaved changes');
    expect(host.querySelector('[data-testid="layout-last-change"]')).toBeNull();
    expect(byId('layout-last-saved').textContent).toContain('Last saved');
  });

  it('discard restores the last-saved grid and clears the dirty count (#712)', () => {
    render();
    generate('1', '2');
    expect(byId('layout-dirty-count').textContent).toContain('2 unsaved changes');
    expect(byId('layout-discard').getAttribute('disabled')).toBeNull();

    byId('layout-discard').click();
    fixture.detectChanges();

    expect(byId('layout-dirty-count').textContent).toContain('No unsaved changes');
    expect(host.querySelector('[data-testid="layout-last-change"]')).toBeNull();
    expect(cells()).toHaveLength(0);
    expect(byId('layout-discard').getAttribute('disabled')).toBe('');
  });

  it('surfaces STALE_WRITE through the persistent save bar (#712)', async () => {
    render();
    generate('1', '1');

    byId('layout-save').click();
    http
      .expectOne((r) => r.method === 'PUT')
      .flush({ code: 'STALE_WRITE' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(
      byId('layout-save-bar').querySelector('[data-testid="layout-stale-banner"]'),
    ).toBeTruthy();
    // The painted grid survives a stale rejection — the dirty count still reflects it.
    expect(byId('layout-dirty-count').textContent).toContain('1 unsaved change');
  });

  it('discard never reverts a row rename that already saved on its own PUT (#712 review)', async () => {
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1, 'A'), seat(2, 'STANDARD', 'ONLINE', 1, 2, 'B')], 3);
    useBulkMode();

    // Paint an unrelated cell dirty — row B, currently 'standard', to the default 'premium' brush.
    cells()[1].click();
    fixture.detectChanges();
    expect(byId('layout-dirty-count').textContent).not.toContain('No unsaved changes');

    setRowName(1, 'Back row');
    rowNameSaves()[1].click();
    http
      .expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/rows/B/name'))
      .flush(null);
    await fixture.whenStable();
    fixture.detectChanges();

    byId('layout-discard').click();
    fixture.detectChanges();

    // The unrelated paint is undone, but the already-saved rename is not.
    expect(rowNameInputs()[1].value).toBe('Back row');
  });

  function rowNameInputs(): HTMLInputElement[] {
    return Array.from(host.querySelectorAll<HTMLInputElement>('[data-testid="layout-row-name"]'));
  }

  function setRowName(index: number, value: string): void {
    const input = rowNameInputs()[index];
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('saves the operator’s row name; untouched and blanked rows keep grid letters (#723)', () => {
    render();
    generate('2', '2');

    setRowName(0, ' Under the pines ');
    setRowName(1, '   '); // a blanked name falls back to the derived grid letter

    byId('layout-save').click();
    const req = http.expectOne(
      (r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'),
    );
    expect(body(req).sets.map((s) => s.rowLabel)).toEqual([
      'Under the pines',
      'Under the pines',
      'B',
      'B',
    ]);
    req.flush(null);
  });

  it('preserves loaded row labels on an untouched save (#723)', () => {
    render([
      seat(1, 'PREMIUM', 'ONLINE', 1, 1, 'Front row · Sea view'),
      seat(2, 'STANDARD', 'ONLINE', 1, 2, 'Row 2'),
    ]);
    useBulkMode();

    expect(rowNameInputs().map((i) => i.value)).toEqual(['Front row · Sea view', 'Row 2']);

    byId('layout-save').click();
    const req = http.expectOne(
      (r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'),
    );
    expect(body(req).sets.map((s) => s.rowLabel)).toEqual(['Front row · Sea view', 'Row 2']);
    req.flush(null);
  });

  it('blocks saving duplicate row names with row-name copy, before any PUT (#723)', () => {
    render();
    generate('2', '2');

    setRowName(0, 'Pines');
    setRowName(1, ' Pines ');

    byId('layout-save').click();
    http.expectNone((r) => r.method === 'PUT');
    expect(byId('layout-row-name-error').textContent).toContain('name');

    // Fixing the clash clears the message and lets the save through.
    setRowName(1, 'Back');
    expect(byId('layout-row-name-error')).toBeFalsy();
    byId('layout-save').click();
    http
      .expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'))
      .flush(null);
  });

  it('a confirmed regenerate resets row names to the grid-letter defaults (#723)', () => {
    render();
    generate('2', '2');
    setRowName(0, 'Pines');

    byId('layout-generate').click();
    fixture.detectChanges();
    byId('layout-confirm-yes').click();
    fixture.detectChanges();

    expect(rowNameInputs().map((i) => i.value)).toEqual(['A', 'B']);
  });

  function rowNameSaves(): HTMLButtonElement[] {
    return Array.from(
      host.querySelectorAll<HTMLButtonElement>('[data-testid="layout-row-name-save"]'),
    );
  }

  /** A trading venue: two saved rows, so the bulk save is locked but each row is renameable. */
  function renderSaved(): void {
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1, 'A'), seat(2, 'STANDARD', 'ONLINE', 1, 2, 'B')], 3);
    useBulkMode();
  }

  it('saves one row’s name without the bulk save (#726)', async () => {
    renderSaved();

    setRowName(1, 'Back row');
    rowNameSaves()[1].click();

    const req = http.expectOne(
      (r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/rows/B/name'),
    );
    expect(req.request.body).toEqual({ newLabel: 'Back row', expectedVersion: 3 });
    req.flush(null);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byId('layout-row-name-saved')).toBeTruthy();
    // The write bumped set_version, so a follow-up rename must not carry the spent token.
    setRowName(0, 'Front row');
    rowNameSaves()[0].click();
    const next = http.expectOne(
      (r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/rows/A/name'),
    );
    expect(next.request.body).toEqual({ newLabel: 'Front row', expectedVersion: 4 });
    next.flush(null);
    await fixture.whenStable();
  });

  it('renames the row the URL names even after the draft changed twice (#726)', async () => {
    renderSaved();

    setRowName(1, 'Back');
    setRowName(1, 'Back row');
    rowNameSaves()[1].click();

    // The path carries the STORED label, never the draft — otherwise the second save 404s.
    http
      .expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/rows/B/name'))
      .flush(null);
    await fixture.whenStable();
    fixture.detectChanges();

    setRowName(1, 'Back terrace');
    rowNameSaves()[1].click();
    const req = http.expectOne(
      (r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/rows/Back%20row/name'),
    );
    req.flush(null);
    await fixture.whenStable();
  });

  it('describes only the failing row\u2019s name input', async () => {
    renderSaved();

    setRowName(1, 'A');
    rowNameSaves()[1].click();
    http
      .expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/rows/B/name'))
      .flush({ code: 'ROW_NAME_TAKEN' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    const failing = rowNameInputs()[1];
    expect(failing.getAttribute('aria-describedby')).toBe(byId('layout-row-name-write-error').id);
    expect(failing.getAttribute('aria-invalid')).toBe('true');

    // R-2: the ref is declared inside the @for body, so the sibling row must be untouched.
    expect(rowNameInputs()[0].hasAttribute('aria-describedby')).toBe(false);
    expect(rowNameInputs()[0].hasAttribute('aria-invalid')).toBe(false);
  });

  it('describes a refused rename without calling the typed name invalid', async () => {
    renderSaved();

    setRowName(1, 'A');
    rowNameSaves()[1].click();
    http
      .expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/rows/B/name'))
      .flush({ code: 'NOT_VENUE_OWNER' }, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    fixture.detectChanges();

    const failing = rowNameInputs()[1];
    expect(failing.getAttribute('aria-describedby')).toBe(byId('layout-row-name-write-error').id);
    // The name is fine; the write was refused. Only a taken or malformed name is a bad value.
    expect(failing.hasAttribute('aria-invalid')).toBe(false);
  });

  it('surfaces a taken row name against the row that asked, keeping the draft (#726)', async () => {
    renderSaved();

    setRowName(1, 'A');
    rowNameSaves()[1].click();
    http
      .expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/rows/B/name'))
      .flush({ code: 'ROW_NAME_TAKEN' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byId('layout-row-name-write-error').textContent).toContain('name');
    // The typed draft survives so the operator can correct it rather than retype from scratch.
    expect(rowNameInputs()[1].value).toBe('A');
    // A per-row conflict is not the venue-level stale banner.
    expect(host.querySelector('[data-testid="layout-stale-banner"]')).toBeNull();
  });

  it('routes a stale rename into the reload banner, not the row error (#726)', async () => {
    renderSaved();

    setRowName(1, 'Back row');
    rowNameSaves()[1].click();
    http
      .expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/rows/B/name'))
      .flush({ code: 'STALE_WRITE' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byId('layout-stale-banner')).toBeTruthy();
    expect(host.querySelector('[data-testid="layout-row-name-write-error"]')).toBeNull();
  });

  it('explains every rename failure the panel can receive (#726)', async () => {
    // One case per rowNameErrorMessage arm: an unexplained code falls back to generic copy.
    const cases: [string, string][] = [
      ['ROW_NAME_TAKEN', 'Another row already has that name'],
      ['NO_SUCH_ROW', 'no longer exists'],
      ['NOT_VENUE_OWNER', 'do not manage this venue'],
      ['NO_SUCH_VENUE', 'could not be found'],
      ['INVALID_REQUEST', 'up to 40 characters'],
      ['WHAT_IS_THIS', 'Something went wrong'],
    ];
    for (const [code, expected] of cases) {
      renderSaved();
      setRowName(1, 'Back row');
      rowNameSaves()[1].click();
      http
        .expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/rows/B/name'))
        .flush({ code }, { status: 409, statusText: 'Conflict' });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(byId('layout-row-name-write-error').textContent).toContain(expected);
      http.verify();
      TestBed.resetTestingModule();
    }
  });

  it('signs the operator out when a rename comes back 401 (#726)', async () => {
    renderSaved();

    setRowName(1, 'Back row');
    rowNameSaves()[1].click();
    http
      .expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/rows/B/name'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byId('layout-row-name-write-error').textContent).toContain('session has expired');
  });

  it('ignores a rename that a venue switch superseded (#726, #180)', async () => {
    renderSaved();

    setRowName(1, 'Back row');
    rowNameSaves()[1].click();
    const req = http.expectOne(
      (r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/rows/B/name'),
    );

    // A venue switch mid-flight: the rename's outcome must not land on the new venue's editor.
    params$.next(convertToParamMap({ venueId: '2' }));
    fixture.detectChanges();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/2'))
      .flush({ map: { id: 2, name: 'W', sets: [], setVersion: 0 }, locks: [] });
    req.flush(null);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="layout-row-name-saved"]')).toBeNull();
  });

  it('drops a superseded rename failure after a venue switch too (#726, #180)', async () => {
    renderSaved();

    setRowName(1, 'Back row');
    rowNameSaves()[1].click();
    const req = http.expectOne(
      (r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/rows/B/name'),
    );

    params$.next(convertToParamMap({ venueId: '2' }));
    fixture.detectChanges();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/2'))
      .flush({ map: { id: 2, name: 'W', sets: [], setVersion: 0 }, locks: [] });
    req.flush({ code: 'ROW_NAME_TAKEN' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="layout-row-name-write-error"]')).toBeNull();
  });

  it('ignores a second rename while one is already in flight (#726)', async () => {
    renderSaved();

    setRowName(1, 'Back row');
    rowNameSaves()[1].click();
    const req = http.expectOne(
      (r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/rows/B/name'),
    );

    // The shared token cannot admit two concurrent writes, so the second click is dropped.
    rowNameSaves()[0].click();
    http.expectNone((r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/rows/A/name'));

    req.flush(null);
    await fixture.whenStable();
  });

  it('does not rename a row when the map read never yielded a token (#726)', () => {
    renderWithFailedLoad();

    // No setVersion and no stored rows: the same guard seen from both sides.
    expect(rowNameSaves()).toHaveLength(0);
    http.expectNone((r) => r.method === 'PUT');
  });

  it('clears a rename notice when the venue switches in place (#726 review F-6)', async () => {
    renderSaved();
    setRowName(1, 'Back row');
    rowNameSaves()[1].click();
    http
      .expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/rows/B/name'))
      .flush(null);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(byId('layout-row-name-saved')).toBeTruthy();

    params$.next(convertToParamMap({ venueId: '2' }));
    fixture.detectChanges();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/2'))
      .flush({
        map: { id: 2, name: 'W', sets: [seat(9, 'STANDARD', 'ONLINE', 1, 1, 'Z')], setVersion: 0 },
        locks: [],
      });
    fixture.detectChanges();
    useBulkMode();

    // The notice was pinned to a grid index on venue 1; venue 2's row never was renamed.
    expect(host.querySelector('[data-testid="layout-row-name-saved"]')).toBeNull();
  });

  it('clears a rename error when a stale reload re-indexes the rows (#726 review F-11)', async () => {
    renderSaved();
    // Not a LOCAL duplicate, so #723's guard lets the bulk save through; only the server refuses it.
    setRowName(1, 'Front row');
    rowNameSaves()[1].click();
    http
      .expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/rows/B/name'))
      .flush({ code: 'ROW_NAME_TAKEN' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(byId('layout-row-name-write-error')).toBeTruthy();

    // A bulk-save conflict's Reload re-seeds the grid; the row at index 1 may now be a different row.
    byId('layout-save').click();
    http
      .expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'))
      .flush({ code: 'STALE_WRITE' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();
    byId('layout-stale-reload').click();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({
        map: { id: 1, name: 'V', sets: [seat(1, 'PREMIUM', 'ONLINE', 1, 1, 'A')], setVersion: 9 },
        locks: [],
      });
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="layout-row-name-write-error"]')).toBeNull();
  });

  it('does not race a rename against an in-flight bulk save (#726 review F-7)', async () => {
    renderSaved();

    byId('layout-save').click();
    const save = http.expectOne(
      (r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'),
    );

    // Both writes turn on the one set_version token, so the rename must wait rather than false-conflict.
    setRowName(1, 'Back row');
    rowNameSaves()[1].click();
    http.expectNone((r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/rows/B/name'));

    save.flush(null);
    await fixture.whenStable();
  });

  it('treats a cleared name field as cancel, not a rename to the grid letter (#726 review R2-10)', async () => {
    renderSaved();

    setRowName(1, '');
    rowNameSaves()[1].click();
    await fixture.whenStable();
    fixture.detectChanges();

    // Renaming row B to "B" would be a visible change for guests already booked into it.
    http.expectNone((r) => r.method === 'PUT');
    expect(rowNameInputs()[1].value).toBe('B');
  });

  it('never sends a same-label rename, so the token cannot run ahead of the server (#726)', async () => {
    renderSaved();

    // The server would no-op without bumping, leaving this tab a version ahead of it.
    rowNameSaves()[1].click();
    await fixture.whenStable();
    fixture.detectChanges();
    http.expectNone((r) => r.method === 'PUT');
    expect(byId('layout-row-name-saved')).toBeTruthy();

    // The token is untouched, so a real rename right after still carries the loaded value.
    setRowName(1, 'Back row');
    rowNameSaves()[1].click();
    const req = http.expectOne(
      (r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/rows/B/name'),
    );
    expect(req.request.body).toEqual({ newLabel: 'Back row', expectedVersion: 3 });
    req.flush(null);
    await fixture.whenStable();
  });

  it('offers no per-row rename on a grid that was never saved (#726)', () => {
    render();
    generate('2', '2');

    setRowName(0, 'Pines');

    // Nothing is stored yet, so there is no row to rename — the bulk save creates these labels.
    expect(rowNameSaves()).toHaveLength(0);
  });

  it('drops the shared console snapshot after a successful save (#486 AC-4)', async () => {
    // The PUT retires the sets the shell's warm snapshot describes, so leaving it stales both tabs.
    render();
    const snapshots = TestBed.inject(ConsoleVenueMap);
    snapshots.load(1, todayBookingDate(new Date())).subscribe();
    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/venues/1'))
      .flush({ id: 1, name: 'V', sets: [], setVersion: 0 });

    generate('1', '1');
    byId('layout-save').click();
    http
      .expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'))
      .flush(null);
    await fixture.whenStable();

    // The snapshot was invalidated, so the next tab to ask goes back to the server for the new layout.
    let refetched: number | undefined;
    snapshots.load(1, todayBookingDate(new Date())).subscribe((v) => (refetched = v.setVersion));
    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/venues/1'))
      .flush({ id: 1, name: 'V', sets: [], setVersion: 1 });

    expect(refetched).toBe(1);
  });

  it('keeps edits and offers Reload on a 409 STALE_WRITE, then Reload re-seeds from the server', async () => {
    // A stale-write conflict must not discard edits — it shows a banner and offers Reload.
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1)], 3); // loaded at set_version 3
    useBulkMode();
    expect(cells()).toHaveLength(1);
    // Paint the loaded cell to walk-in — an in-progress edit that must survive the 409.
    byId('layout-tool-walkin').click();
    fixture.detectChanges();
    cells()[0].click();
    fixture.detectChanges();
    expect(cells()[0].getAttribute('data-state')).toBe('walkin');

    byId('layout-save').click();
    http
      .expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'))
      .flush({ code: 'STALE_WRITE' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    // The stale banner is shown and the walk-in edit is preserved (no silent discard / clobber).
    expect(byId('layout-stale-banner')).toBeTruthy();
    expect(cells()[0].getAttribute('data-state')).toBe('walkin');

    // Reload discards the edits in favour of the latest server layout (a standard cell) and clears the banner.
    byId('layout-stale-reload').click();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({
        map: { id: 1, name: 'V', sets: [seat(1, 'STANDARD', 'ONLINE', 1, 1)], setVersion: 4 },
        locks: [],
      });
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="layout-stale-banner"]')).toBeNull();
    expect(cells()[0].getAttribute('data-state')).toBe('standard');
  });

  it('keeps the grid + banner and shows a retry hint when the Reload GET fails (no data loss)', async () => {
    // reloadAfterStale must not clear the grid until the reload succeeds — a failed reload keeps the work.
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1)], 3);
    useBulkMode();
    byId('layout-tool-walkin').click();
    fixture.detectChanges();
    cells()[0].click(); // paint an edit
    fixture.detectChanges();

    byId('layout-save').click();
    http
      .expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'))
      .flush({ code: 'STALE_WRITE' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(byId('layout-stale-banner')).toBeTruthy();

    // Reload, but the GET fails.
    byId('layout-stale-reload').click();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // The painted grid, the banner, and the token are all preserved; a retry hint is shown.
    expect(byId('layout-stale-banner')).toBeTruthy();
    expect(byId('layout-reload-failed')).toBeTruthy();
    expect(cells()).toHaveLength(1);
    expect(cells()[0].getAttribute('data-state')).toBe('walkin');
  });

  it('explains a failed map read on both surfaces instead of an empty per-set editor (#721)', () => {
    renderWithFailedLoad();

    expect(byId('layout-load-failed')).toBeTruthy();

    byId('layout-tool-select').click();
    fixture.detectChanges();

    // An unknown map is not an empty one: no editor claiming no sets, and no skeleton pulsing on.
    expect(byId('layout-load-failed')).toBeTruthy();
    expect(byId('set-editor')).toBeFalsy();
    expect(host.querySelector('[data-testid="set-skeleton-tile"]')).toBeNull();
    // Nor a silent fall-back to the bulk surface under a pressed Select.
    expect(byId('layout-tool-select').getAttribute('aria-pressed')).toBe('true');
    // Generate lives on the rail regardless of the armed tool (#711).
    expect(byId('layout-generate')).toBeTruthy();
  });

  it('keeps the per-set editor on the last-known sets when a LATER re-read fails (#721)', async () => {
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1)]);

    byId('set-cell').click();
    fixture.detectChanges();
    byId('set-pool-WALK_IN').click();
    fixture.detectChanges();
    byId('set-save').click();
    http
      .expectOne((r) => r.method === 'PATCH' && r.url.includes('/api/venues/1/sets/1'))
      .flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();

    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // The map HAS been read once, so the surface keeps what it holds and only explains the reload.
    expect(byId('set-editor')).toBeTruthy();
    expect(byId('set-cell')).toBeTruthy();
    expect(byId('layout-load-failed')).toBeTruthy();
  });

  it('shows a load-failed message (not a silent no-op) when Save is pressed after a failed initial load', () => {
    // With no token (the initial map read failed), Save must surface an error prompting a refresh.
    renderWithFailedLoad();
    generate('1', '1');

    byId('layout-save').click();
    fixture.detectChanges();

    http.expectNone((r) => r.method === 'PUT'); // no unsafe save without the token
    expect(byId('layout-load-failed')).toBeTruthy();
  });

  it('advances the loaded token on a successful save so a second save is not falsely stale', async () => {
    // The conditional write bumps set_version by exactly one; the editor advances its token to match.
    render([], 5); // loaded at set_version 5, empty venue
    generate('1', '1');

    byId('layout-save').click();
    const first = http.expectOne(
      (r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'),
    );
    expect(body(first).expectedVersion).toBe(5);
    first.flush(null);
    await fixture.whenStable();
    fixture.detectChanges();

    byId('layout-save').click();
    const second = http.expectOne(
      (r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'),
    );
    expect(body(second).expectedVersion).toBe(6); // advanced, not the stale 5
    second.flush(null);
    await fixture.whenStable();
  });

  it('marks the sets a refused save names with the lock decoration and lists them (#1032)', async () => {
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1), seat(2, 'STANDARD', 'ONLINE', 2, 1)], 3);
    useBulkMode();
    // A booking landed after the load: the tab knows no lock, so the gap brush paints A2 out.
    byId('layout-tool-gap').click();
    fixture.detectChanges();
    cells()[1].click();
    fixture.detectChanges();
    expect(cells()[1].getAttribute('data-state')).toBe('gap');

    byId('layout-save').click();
    flushEmptyPreview();
    await fixture.whenStable();
    http
      .expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'))
      .flush(
        {
          code: 'SETS_IN_USE',
          detail: 'x',
          sets: [{ setId: 2, rowLabel: 'A', positionNo: 2, bookedOn: '2026-09-12', heldOn: null }],
        },
        { status: 409, statusText: 'Conflict' },
      );
    await fixture.whenStable();
    fixture.detectChanges();

    // The named set's cell wears the #1031 lock decoration; the kept cell does not.
    const refused = cells()[1];
    expect(refused.getAttribute('data-locked')).toBe('true');
    expect(refused.getAttribute('data-state')).toBe('gap');
    expect(
      host.querySelector(`#${refused.getAttribute('aria-describedby')}`)?.textContent,
    ).toContain('booked Sat 12 Sept 2026');
    expect(cells()[0].getAttribute('data-locked')).toBeNull();
    expect(byId('layout-locked-legend').textContent).toContain('1 set is booked or held');
    expect(byId('layout-error').textContent).toMatch(
      /Row A · position 2 \(booked Sat 12 Sept 2026\)/,
    );
    expect(byId('layout-error').textContent).toMatch(/paint the marked cells back/i);
    expect(byId('layout-error').textContent).not.toMatch(/locked|Select/);

    // Painting it back to a tier is the way out: the next save carries A2 again.
    byId('layout-tool-standard').click();
    fixture.detectChanges();
    refused.click();
    fixture.detectChanges();
    expect(refused.getAttribute('data-state')).toBe('standard');
    byId('layout-save').click();
    const second = http.expectOne(
      (r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'),
    );
    expect(body(second).sets.map((set) => set.gridX)).toEqual([1, 2]);
    expect(body(second).expectedVersion).toBe(3); // the refusal never spent the token
    second.flush(null);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="layout-error"]')).toBeNull();
    expect(refused.getAttribute('data-locked')).toBe('true'); // still booked — the lock stays
  });

  it('keeps the refused set out of the error once a new save starts, and a SETS_IN_USE answer naming no parsable set still refuses', async () => {
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1)], 0);
    useBulkMode();
    byId('layout-tool-premium').click();
    fixture.detectChanges();
    cells()[0].click();
    fixture.detectChanges();
    byId('layout-save').click();
    http
      .expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'))
      .flush(
        { code: 'SETS_IN_USE', detail: 'x', sets: [{ setId: 'x' }] },
        { status: 409, statusText: 'Conflict' },
      );
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byId('layout-error').textContent).toMatch(/Saving would remove 0 sets/);
    expect(host.querySelector('[data-testid="layout-cell"][data-locked="true"]')).toBeNull();
  });

  it('seeds the grid from the venue’s existing layout, preserving the walk-in pool', () => {
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1), seat(2, 'STANDARD', 'WALK_IN', 2, 1)]);
    useBulkMode();
    expect(cells()).toHaveLength(2);
    expect(cells()[0].getAttribute('data-state')).toBe('premium');
    expect(cells()[1].getAttribute('data-state')).toBe('walkin');
  });

  it('re-loads for the new venue when the parent param changes in place (#180)', () => {
    // The router reuses this tab instance on /operator/1/beach-map -> /operator/2/beach-map.
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1)], 7);
    useBulkMode();
    expect(cells()).toHaveLength(1);

    params$.next(convertToParamMap({ venueId: '2' }));
    fixture.detectChanges();

    // Venue 1's draft grid must not carry over while venue 2 loads.
    expect(cells()).toHaveLength(0);
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/2'))
      .flush({
        map: { id: 2, name: 'W', sets: [seat(9, 'STANDARD', 'ONLINE', 1, 1)], setVersion: 3 },
        locks: [],
      });
    fixture.detectChanges();
    useBulkMode(); // the switch resets the mode default, and venue 2 also has sets

    expect(cells()).toHaveLength(1);
    expect(cells()[0].getAttribute('data-state')).toBe('standard');
  });

  it('ignores the old venue’s late map response after a venue switch (#180)', () => {
    configure();
    // Venue 1's initial read is still in flight when the operator switches to venue 2.
    params$.next(convertToParamMap({ venueId: '2' }));
    fixture.detectChanges();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/2'))
      .flush({ map: { id: 2, name: 'W', sets: [], setVersion: 3 }, locks: [] });
    // The superseded venue-1 response resolves late — it must not seed venue 2's editor.
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({
        map: { id: 1, name: 'V', sets: [seat(1, 'PREMIUM', 'ONLINE', 1, 1)], setVersion: 7 },
        locks: [],
      });
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;

    expect(cells()).toHaveLength(0);
  });

  it('ignores the first visit’s late response after switching away and back (#180, A→B→A)', () => {
    // A value check on venueId passes again after A→B→A — only an epoch/identity guard drops it.
    configure();
    params$.next(convertToParamMap({ venueId: '2' }));
    fixture.detectChanges();
    params$.next(convertToParamMap({ venueId: '1' }));
    fixture.detectChanges();

    const venue1Reads = http.match((r) => r.method === 'GET' && r.url.includes('/api/venues/1'));
    expect(venue1Reads).toHaveLength(2); // the first visit's read + the return visit's read
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/2'))
      .flush({ map: { id: 2, name: 'W', sets: [], setVersion: 3 }, locks: [] });
    // The RETURN visit's read settles first (empty layout at version 9)…
    venue1Reads[1].flush({ map: { id: 1, name: 'V', sets: [], setVersion: 9 }, locks: [] });
    // …then the FIRST visit's response arrives last. It must not seed the returned-to editor.
    venue1Reads[0].flush({
      map: { id: 1, name: 'V', sets: [seat(1, 'PREMIUM', 'ONLINE', 1, 1)], setVersion: 7 },
      locks: [],
    });
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;

    expect(cells()).toHaveLength(0);
  });

  it('drops a superseded save’s outcome after a venue switch (#180)', async () => {
    // A save for venue 1 resolving after a switch must not stamp its token or Saved notice onto venue 2.
    render([], 7);
    generate('1', '1');
    byId('layout-save').click();
    const stalePut = http.expectOne(
      (r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'),
    );

    params$.next(convertToParamMap({ venueId: '2' }));
    fixture.detectChanges();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/2'))
      .flush({
        map: { id: 2, name: 'W', sets: [seat(9, 'STANDARD', 'ONLINE', 1, 1)], setVersion: 3 },
        locks: [],
      });
    stalePut.flush(null); // venue 1's save succeeds late
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="layout-saved"]')).toBeNull();
    // The proof the token wasn't stamped: venue 2's next save echoes ITS version (3), not 7+1.
    useBulkMode(); // venue 2 loaded with sets, so it opened in per-set mode
    byId('layout-save').click();
    const venue2Put = http.expectOne(
      (r) => r.method === 'PUT' && r.url.includes('/api/venues/2/beach-map'),
    );
    expect(body(venue2Put).expectedVersion).toBe(3);
    venue2Put.flush(null);
    await fixture.whenStable();
  });
  it('defaultsToTheModeTheVenueNeeds: per-set editing for a live map, bulk for an empty one (AC-6)', () => {
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1)]);

    // A venue that already has sets opens armed on Select — the only tool that works once it is trading.
    expect(byId('set-editor')).toBeTruthy();
    // Generate lives on the rail regardless of the armed tool (#711).
    expect(byId('layout-generate')).toBeTruthy();
    expect(byId('layout-tool-select').getAttribute('aria-pressed')).toBe('true');
  });

  it('opens an empty venue with the default brush armed, where Generate is the operator’s next step (AC-6)', () => {
    render([]);

    expect(byId('layout-generate')).toBeTruthy();
    expect(byId('set-editor')).toBeFalsy();
    expect(byId('layout-tool-premium').getAttribute('aria-pressed')).toBe('true');
  });

  it('lets the operator override the default, and keeps their choice across a re-read', () => {
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1)]);

    byId('layout-tool-premium').click();
    fixture.detectChanges();
    expect(byId('layout-generate')).toBeTruthy();
    expect(byId('set-editor')).toBeFalsy();
  });

  it('re-seeds the bulk grid after a per-set write, so a later bulk save cannot revert it', async () => {
    // Frozen at first load, the bulk grid's Save is accepted (no set_version bump) and reverts the edit.
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1), seat(2, 'STANDARD', 'ONLINE', 2, 1)]);

    byId('set-cell').click();
    fixture.detectChanges();
    byId('set-pool-WALK_IN').click();
    fixture.detectChanges();
    byId('set-save').click();
    http
      .expectOne((r) => r.method === 'PATCH' && r.url.includes('/api/venues/1/sets/1'))
      .flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();

    // The re-read carries the server's new truth: set 1 repooled, set 2 removed elsewhere meanwhile.
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({
        map: { id: 1, name: 'V', sets: [seat(1, 'PREMIUM', 'WALK_IN', 1, 1)], setVersion: 0 },
        locks: [],
      });
    fixture.detectChanges();

    useBulkMode();
    expect(cells()).toHaveLength(1);
    expect(cells()[0].getAttribute('data-state')).toBe('walkin');
  });

  it('refuses Generate until the map read settles, on mount and on the per-set reconcile (#721)', () => {
    // The tab opens in bulk mode during the read (loadedSets is still []), so Generate is one click away.
    configure();
    const read = http.expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'));
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;

    const generate = byId('layout-generate') as HTMLButtonElement;
    expect(generateInert()).toBe(true);
    // Inert via aria-disabled, NOT [disabled]: disabling a focused button blurs it to <body> (#616).
    expect(generate.disabled).toBe(false);
    generate.click();
    fixture.detectChanges();
    expect(cells()).toHaveLength(0); // nothing generated over a layout nobody has seen

    read.flush({
      map: { id: 1, name: 'V', sets: [seat(1, 'PREMIUM', 'ONLINE', 1, 1)], setVersion: 0 },
      locks: [],
    });
    fixture.detectChanges();
    useBulkMode();

    expect(generateInert()).toBe(false);
    expect(cells()).toHaveLength(1);
  });

  it('refuses Generate during the per-set write re-read, the tab’s second unsettled window (#721)', async () => {
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1)]);

    byId('set-cell').click();
    fixture.detectChanges();
    byId('set-pool-WALK_IN').click();
    fixture.detectChanges();
    byId('set-save').click();
    http
      .expectOne((r) => r.method === 'PATCH' && r.url.includes('/api/venues/1/sets/1'))
      .flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();

    // The reconcile clears the grid and re-reads, so hasLayout() alone would read as "empty venue".
    const reread = http.expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'));
    useBulkMode();
    const generate = byId('layout-generate');
    expect(generateInert()).toBe(true);
    generate.click();
    fixture.detectChanges();
    expect(cells()).toHaveLength(0);
    http.expectNone((r) => r.method === 'PUT');

    reread.flush({
      map: { id: 1, name: 'V', sets: [seat(1, 'PREMIUM', 'WALK_IN', 1, 1)], setVersion: 0 },
      locks: [],
    });
    fixture.detectChanges();

    expect(generateInert()).toBe(false);
    expect(cells()).toHaveLength(1);
  });

  it('keeps Generate shut for the venue on screen when a superseded read lands (#180, #721)', () => {
    configure();
    const first = http.expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'));
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;

    params$.next(convertToParamMap({ venueId: '2' }));
    fixture.detectChanges();
    const second = http.expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/2'));

    // Venue 1's read lands late: it must not report venue 2's still-running read as settled.
    first.flush({
      map: { id: 1, name: 'V', sets: [seat(1, 'PREMIUM', 'ONLINE', 1, 1)], setVersion: 0 },
      locks: [],
    });
    fixture.detectChanges();
    expect(generateInert()).toBe(true);

    second.flush({ map: { id: 2, name: 'W', sets: [], setVersion: 0 }, locks: [] });
    fixture.detectChanges();
    expect(generateInert()).toBe(false);
  });

  it('drops the shared snapshot and re-reads the map after a per-set write (#486 rule, AC-1)', async () => {
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1)]);
    const reset = vi.spyOn(TestBed.inject(ConsoleVenueMap), 'reset');

    // Drive the real child: select the set, repool it, save. Its `changed` output is the wiring under test.
    byId('set-cell').click();
    fixture.detectChanges();
    byId('set-pool-WALK_IN').click();
    fixture.detectChanges();
    byId('set-save').click();
    http
      .expectOne((r) => r.method === 'PATCH' && r.url.includes('/api/venues/1/sets/1'))
      .flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();

    // The tab re-reads rather than trusting its own copy, and drops the snapshot the other tabs share.
    expect(reset).toHaveBeenCalled();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({
        map: { id: 1, name: 'V', sets: [seat(1, 'PREMIUM', 'WALK_IN', 1, 1)], setVersion: 0 },
        locks: [],
      });
    fixture.detectChanges();

    expect(byId('set-cell').getAttribute('data-state')).toBe('walkin');
  });
  /** The remodel preview a save that drops a loaded set asks for first; nothing affected → straight to the PUT. */
  function flushEmptyPreview(): void {
    http
      .expectOne((r) => r.method === 'POST' && r.url.includes('/api/venues/1/beach-map/preview'))
      .flush(EMPTY_PREVIEW);
  }

  describe('remodel preview (#1033)', () => {
    function dropLoadedA2(): void {
      render([seat(1, 'PREMIUM', 'ONLINE', 1, 1), seat(2, 'STANDARD', 'ONLINE', 2, 1)], 3);
      useBulkMode();
      byId('layout-tool-gap').click();
      fixture.detectChanges();
      cells()[1].click();
      fixture.detectChanges();
    }

    function previewRequest(): TestRequest {
      return http.expectOne(
        (r) => r.method === 'POST' && r.url.includes('/api/venues/1/beach-map/preview'),
      );
    }

    it('asks the dry run with the save body before a save that drops a loaded set, and proceeds when nothing is affected', async () => {
      dropLoadedA2();
      byId('layout-save').click();
      fixture.detectChanges();
      expect(byId('layout-save').getAttribute('aria-disabled')).toBe('true');
      expect(byId('layout-save').textContent).toContain('Checking');

      const preview = previewRequest();
      expect(body(preview).sets.map((set) => set.gridX)).toEqual([1]);
      expect(body(preview).expectedVersion).toBe(3);
      preview.flush(EMPTY_PREVIEW);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(host.querySelector('[data-testid="layout-remodel-preview"]')).toBeNull();
      const put = http.expectOne(
        (r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'),
      );
      expect(body(put).expectedVersion).toBe(3);
      put.flush(null);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(byId('layout-saved')).toBeTruthy();
    });

    it('never asks the dry run for a save that keeps every loaded set', async () => {
      render([seat(1, 'PREMIUM', 'ONLINE', 1, 1)], 3);
      useBulkMode();
      byId('layout-tool-standard').click();
      fixture.detectChanges();
      cells()[0].click();
      fixture.detectChanges();
      byId('layout-save').click();

      http
        .expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'))
        .flush(null);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(byId('layout-saved')).toBeTruthy();
    });

    it('opens the preview dialog on an affecting answer, keeps the save busy, and Back hands focus to Save with no PUT', async () => {
      dropLoadedA2();
      byId('layout-save').click();
      previewRequest().flush(FULL_PREVIEW);
      await fixture.whenStable();
      fixture.detectChanges();

      const dialog = byId('layout-remodel-preview');
      expect(dialog.getAttribute('role')).toBe('alertdialog');
      expect(byId('layout-remodel-moves').textContent).toMatch(/4 positions along the row/);
      expect(byId('layout-remodel-blocks').textContent).toMatch(/arrives within the freeze window/);
      expect(byId('layout-remodel-keep').textContent).toMatch(/Keep Row A · position 3/);
      expect(byId('layout-save').getAttribute('aria-disabled')).toBe('true');
      expect(byId('layout-remodel-preview').querySelectorAll('button')).toHaveLength(1);

      byId('layout-remodel-back').click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(host.querySelector('[data-testid="layout-remodel-preview"]')).toBeNull();
      expect(document.activeElement).toBe(byId('layout-save'));
      expect(byId('layout-save').getAttribute('aria-disabled')).toBeNull();
      http.expectNone((r) => r.method === 'PUT');
    });

    it('a stale dry run lands in the same reload banner as a stale save', async () => {
      dropLoadedA2();
      byId('layout-save').click();
      previewRequest().flush(
        { code: 'STALE_WRITE', detail: '' },
        { status: 409, statusText: 'Conflict' },
      );
      await fixture.whenStable();
      fixture.detectChanges();

      expect(byId('layout-stale-banner')).toBeTruthy();
      expect(byId('layout-save').getAttribute('aria-disabled')).toBeNull();
      http.expectNone((r) => r.method === 'PUT');
    });
  });

  describe('remodel commit (#1034)', () => {
    function dropLoadedA2(): void {
      render([seat(1, 'PREMIUM', 'ONLINE', 1, 1), seat(2, 'STANDARD', 'ONLINE', 2, 1)], 3);
      useBulkMode();
      byId('layout-tool-gap').click();
      fixture.detectChanges();
      cells()[1].click();
      fixture.detectChanges();
    }

    function commitRequest(): TestRequest {
      return http.expectOne(
        (r) => r.method === 'POST' && r.url.includes('/api/venues/1/beach-map/commit'),
      );
    }

    async function openMovesOnlyDialog(): Promise<void> {
      dropLoadedA2();
      byId('layout-save').click();
      http
        .expectOne((r) => r.method === 'POST' && r.url.includes('/api/venues/1/beach-map/preview'))
        .flush(MOVES_ONLY_PREVIEW);
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('Save and move POSTs the previewed body with the preview token, then shows the receipt in the dialog’s place and focuses it', async () => {
      await openMovesOnlyDialog();
      byId('layout-remodel-commit').click();
      fixture.detectChanges();
      expect(byId('layout-remodel-commit').getAttribute('aria-disabled')).toBe('true');
      expect(byId('layout-remodel-commit').textContent).toContain('Saving…');

      const commit = commitRequest();
      expect(body(commit).sets.map((set) => set.gridX)).toEqual([1]);
      expect(body(commit).expectedVersion).toBe(3);
      expect(body(commit).previewToken).toBe('v1.moves');
      commit.flush(RECEIPT);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(host.querySelector('[data-testid="layout-remodel-preview"]')).toBeNull();
      expect(byId('layout-remodel-receipt-title').textContent).toContain('receipt #41');
      expect(byId('layout-remodel-receipt-moves').querySelectorAll('li')).toHaveLength(2);
      expect(document.activeElement).toBe(byId('layout-remodel-receipt-title'));
      expect(byId('layout-saved')).toBeTruthy();
      expect(byId('layout-dirty-count').textContent).toContain('No unsaved changes');
      expect(byId('layout-save').getAttribute('aria-disabled')).toBeNull();
      http.expectNone((r) => r.method === 'PUT');

      byId('layout-remodel-receipt-close').click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(host.querySelector('[data-testid="layout-remodel-receipt"]')).toBeNull();
      expect(document.activeElement).toBe(byId('layout-save'));
    });

    it('a commit advances the loaded token like a save, so the next save is not falsely stale', async () => {
      await openMovesOnlyDialog();
      byId('layout-remodel-commit').click();
      commitRequest().flush(RECEIPT);
      await fixture.whenStable();
      fixture.detectChanges();

      byId('layout-tool-standard').click();
      fixture.detectChanges();
      cells()[0].click();
      fixture.detectChanges();
      byId('layout-save').click();
      // A2 is still a gap against the loaded read, so the dry run runs again; it carries the advanced token too.
      const preview = http.expectOne(
        (r) => r.method === 'POST' && r.url.includes('/api/venues/1/beach-map/preview'),
      );
      expect(body(preview).expectedVersion).toBe(4);
      preview.flush(EMPTY_PREVIEW);
      await fixture.whenStable();
      fixture.detectChanges();
      const put = http.expectOne(
        (r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'),
      );
      expect(body(put).expectedVersion).toBe(4);
      put.flush(null);
      await fixture.whenStable();
    });

    it('STALE_PREVIEW re-renders the dialog with the fresh picture and its token, flagged stale, and the next Save carries the fresh token', async () => {
      await openMovesOnlyDialog();
      byId('layout-remodel-commit').click();
      commitRequest().flush(
        {
          code: 'STALE_PREVIEW',
          detail: 'x',
          preview: {
            ...MOVES_ONLY_PREVIEW,
            moves: [MOVES_ONLY_PREVIEW.moves[0]],
            previewToken: 'v1.fresh',
          },
        },
        { status: 409, statusText: 'Conflict' },
      );
      await fixture.whenStable();
      fixture.detectChanges();

      expect(byId('layout-remodel-preview')).toBeTruthy();
      expect(byId('layout-remodel-stale').textContent).toMatch(
        /bookings changed since you previewed/,
      );
      expect(byId('layout-remodel-moves').textContent).toContain('Will move (1)');
      expect(byId('layout-remodel-commit').textContent).toContain('Save and move 1 booking');
      expect(byId('layout-remodel-commit').getAttribute('aria-disabled')).toBeNull();
      expect(host.querySelector('[data-testid="layout-error"]')).toBeNull();
      expect(host.querySelector('[data-testid="layout-remodel-receipt"]')).toBeNull();

      byId('layout-remodel-commit').click();
      const second = commitRequest();
      expect(body(second).previewToken).toBe('v1.fresh');
      expect(body(second).expectedVersion).toBe(3);
      second.flush(RECEIPT);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(host.querySelector('[data-testid="layout-remodel-stale"]')).toBeNull();
      expect(byId('layout-remodel-receipt')).toBeTruthy();
    });

    it('REMODEL_REFUSED shows the fresh picture stale with Back alone, and Back returns to the editor with no error', async () => {
      await openMovesOnlyDialog();
      byId('layout-remodel-commit').click();
      commitRequest().flush(
        { code: 'REMODEL_REFUSED', detail: 'x', preview: FULL_PREVIEW },
        { status: 409, statusText: 'Conflict' },
      );
      await fixture.whenStable();
      fixture.detectChanges();

      expect(byId('layout-remodel-stale')).toBeTruthy();
      expect(byId('layout-remodel-blocks').textContent).toMatch(/arrives within the freeze window/);
      expect(host.querySelector('[data-testid="layout-remodel-commit"]')).toBeNull();
      expect(host.querySelector('[data-testid="layout-error"]')).toBeNull();

      byId('layout-remodel-back').click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(host.querySelector('[data-testid="layout-remodel-preview"]')).toBeNull();
      expect(host.querySelector('[data-testid="layout-error"]')).toBeNull();
      expect(document.activeElement).toBe(byId('layout-save'));
    });

    it('a stale-picture answer without a parsable preview is a plain failure: the dialog closes and the save bar explains', async () => {
      await openMovesOnlyDialog();
      byId('layout-remodel-commit').click();
      commitRequest().flush(
        { code: 'STALE_PREVIEW', detail: 'x', preview: { moves: 'nope' } },
        { status: 409, statusText: 'Conflict' },
      );
      await fixture.whenStable();
      fixture.detectChanges();

      expect(host.querySelector('[data-testid="layout-remodel-preview"]')).toBeNull();
      expect(byId('layout-error').textContent).toMatch(/Save again to see the fresh picture/);
      expect(document.activeElement).toBe(byId('layout-save'));
    });

    it('a stale write on the commit lands in the reload banner, with the dialog closed and the token unspent', async () => {
      await openMovesOnlyDialog();
      byId('layout-remodel-commit').click();
      commitRequest().flush(
        { code: 'STALE_WRITE', detail: '' },
        { status: 409, statusText: 'Conflict' },
      );
      await fixture.whenStable();
      fixture.detectChanges();

      expect(host.querySelector('[data-testid="layout-remodel-preview"]')).toBeNull();
      expect(byId('layout-stale-banner')).toBeTruthy();
      expect(byId('layout-save').getAttribute('aria-disabled')).toBeNull();
    });

    it('SETS_IN_USE on the commit marks the named sets exactly as the save does', async () => {
      await openMovesOnlyDialog();
      byId('layout-remodel-commit').click();
      commitRequest().flush(
        {
          code: 'SETS_IN_USE',
          detail: 'x',
          sets: [{ setId: 2, rowLabel: 'A', positionNo: 2, bookedOn: '2026-09-12', heldOn: null }],
        },
        { status: 409, statusText: 'Conflict' },
      );
      await fixture.whenStable();
      fixture.detectChanges();

      expect(host.querySelector('[data-testid="layout-remodel-preview"]')).toBeNull();
      expect(cells()[1].getAttribute('data-locked')).toBe('true');
      expect(byId('layout-error').textContent).toMatch(/Row A · position 2/);
    });

    it('drops a superseded commit’s outcome after a venue switch (#180)', async () => {
      await openMovesOnlyDialog();
      byId('layout-remodel-commit').click();
      const commit = commitRequest();

      params$.next(convertToParamMap({ venueId: '2' }));
      fixture.detectChanges();
      http
        .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/2'))
        .flush({ map: { id: 2, name: 'W', sets: [], setVersion: 0 }, locks: [] });
      fixture.detectChanges();

      commit.flush(RECEIPT);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(host.querySelector('[data-testid="layout-remodel-receipt"]')).toBeNull();
      expect(host.querySelector('[data-testid="layout-saved"]')).toBeNull();
    });
  });

  describe('past remodels (#1034)', () => {
    function receiptsRequest(): TestRequest {
      return http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/venues/1/remodels'));
    }

    async function openDisclosure(): Promise<void> {
      const details = byId('layout-remodels') as HTMLDetailsElement;
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('reads the receipts on first opening only, lists them newest first as the server sends them, and opens one', async () => {
      render([seat(1, 'PREMIUM', 'ONLINE', 1, 1)], 3);
      expect(host.querySelector('[data-testid="layout-remodels-list"]')).toBeNull();
      http.expectNone((r) => r.url.includes('/remodels'));

      await openDisclosure();
      expect(byId('layout-remodels-loading')).toBeTruthy();
      receiptsRequest().flush([
        { receiptId: 41, committedAt: '2026-09-09T13:00:00Z', moveCount: 2 },
        { receiptId: 40, committedAt: '2026-09-01T07:30:00Z', moveCount: 1 },
      ]);
      await fixture.whenStable();
      fixture.detectChanges();

      const rows = host.querySelectorAll<HTMLElement>('[data-testid="layout-remodels-open"]');
      expect([...rows].map((row) => row.textContent?.trim())).toEqual([
        'Wed, 9 Sept, 15:00 · 2 bookings moved',
        'Tue, 1 Sept, 09:30 · 1 booking moved',
      ]);
      expect(rows[0].getAttribute('data-receipt-id')).toBe('41');

      // A second toggle re-uses the list it already holds.
      (byId('layout-remodels') as HTMLDetailsElement).open = false;
      await openDisclosure();
      http.expectNone((r) => r.url.endsWith('/api/venues/1/remodels'));

      rows[0].click();
      http
        .expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/venues/1/remodels/41'))
        .flush(RECEIPT);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(byId('layout-remodel-receipt-title').textContent).toContain('receipt #41');
      expect(document.activeElement).toBe(byId('layout-remodel-receipt-title'));
    });

    it('says so when no remodel has moved a booking, and explains a failed read as an alert', async () => {
      render([seat(1, 'PREMIUM', 'ONLINE', 1, 1)], 3);
      await openDisclosure();
      receiptsRequest().flush([]);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(byId('layout-remodels-empty').textContent).toMatch(
        /No remodel has moved a booking yet/,
      );
      fixture.destroy();
      TestBed.resetTestingModule();

      render([seat(1, 'PREMIUM', 'ONLINE', 1, 1)], 3);
      await openDisclosure();
      receiptsRequest().flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(byId('layout-remodels-failed').getAttribute('role')).toBe('alert');
      expect(byId('layout-remodels-failed').textContent).toMatch(/Couldn’t load past remodels/);
    });

    it('a commit invalidates the list, so the next opening re-reads it with the new receipt', async () => {
      render([seat(1, 'PREMIUM', 'ONLINE', 1, 1), seat(2, 'STANDARD', 'ONLINE', 2, 1)], 3);
      await openDisclosure();
      receiptsRequest().flush([]);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(byId('layout-remodels-empty')).toBeTruthy();

      useBulkMode();
      byId('layout-tool-gap').click();
      fixture.detectChanges();
      cells()[1].click();
      fixture.detectChanges();
      byId('layout-save').click();
      http
        .expectOne((r) => r.method === 'POST' && r.url.includes('/api/venues/1/beach-map/preview'))
        .flush(MOVES_ONLY_PREVIEW);
      await fixture.whenStable();
      fixture.detectChanges();
      byId('layout-remodel-commit').click();
      http
        .expectOne((r) => r.method === 'POST' && r.url.includes('/api/venues/1/beach-map/commit'))
        .flush(RECEIPT);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(host.querySelector('[data-testid="layout-remodels-empty"]')).toBeNull();
      (byId('layout-remodels') as HTMLDetailsElement).open = false;
      await openDisclosure();
      receiptsRequest().flush([
        { receiptId: 41, committedAt: '2026-09-09T13:00:00Z', moveCount: 2 },
      ]);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(host.querySelectorAll('[data-testid="layout-remodels-open"]')).toHaveLength(1);
    });
  });
});

function seat(
  id: number,
  tier: 'PREMIUM' | 'STANDARD',
  pool: 'ONLINE' | 'WALK_IN',
  gridX: number,
  gridY: number,
  rowLabel = 'A',
): SetView {
  return {
    id,
    rowLabel,
    positionNo: gridX,
    tier,
    pool,
    price: { minorUnits: 2000, currency: 'EUR' },
    gridX,
    gridY,
    availability: 'FREE',
  };
}
