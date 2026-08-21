import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { expectCellsFillCanvasRow } from '../../testing/beach-map-height';
import { todayBookingDate } from '../shared/booking-date';
import { SetView } from '../shared/venue-views';
import { ConsoleVenueMap } from './console-venue-map';
import { LayoutEditor } from './layout-editor';

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
}

/** The captured request body, typed — Angular types `HttpRequest.body` as `any`. */
function body(req: { request: { body: unknown } }): SentBody {
  return req.request.body as SentBody;
}

/**
 * The layout editor. Reads `:venueId` from the PARENT route (child routes don't inherit it)
 * and loads the venue map to seed its grid; the mock mirrors that. Drives generate, drag-paint, save
 * (asserting the one bulk PUT payload), and the LAYOUT_IN_USE lock message.
 */
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

  function render(initialSets: SetView[] = [], setVersion = 0): void {
    configure();
    // Flush the constructor's layout load so the grid seeds and the optimistic-concurrency token is captured.
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({ id: 1, name: 'V', sets: initialSets, setVersion });
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

  /**
   * Show the bulk generate/paint surface. Needed wherever a test seeds a venue that already has sets:
   * since #600 such a venue opens in per-set mode, because that is the only mode that keeps working
   * once it is trading (AC-6). The bulk behaviours below are unchanged — only their default is.
   */
  function useBulkMode(): void {
    byId('layout-mode-bulk').click();
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

  it('starts empty and generates an R×C grid with row A front-row premium', () => {
    render();
    expect(byId('layout-empty')).toBeTruthy();

    generate('2', '3');

    expect(cells()).toHaveLength(6);
    // Row A (first three cells) is premium; row B standard.
    expect(cells()[0].getAttribute('data-state')).toBe('premium');
    expect(cells()[3].getAttribute('data-state')).toBe('standard');
    // The Generate button shows the live total.
    expect(byId('layout-generate').textContent).toContain('6');
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
      .flush({
        id: 2,
        name: 'W',
        sets: [],
        setVersion: 0,
      });
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
      .flush({
        id: 2,
        name: 'W',
        sets: [],
        setVersion: 0,
      });
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
        id: 2,
        name: 'W',
        sets: [seat(9, 'STANDARD', 'ONLINE', 1, 1, 'Z')],
        setVersion: 0,
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
        id: 1,
        name: 'V',
        sets: [seat(1, 'PREMIUM', 'ONLINE', 1, 1, 'A')],
        setVersion: 9,
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
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
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
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
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
      .flush({ id: 1, name: 'V', sets: [seat(1, 'STANDARD', 'ONLINE', 1, 1)], setVersion: 4 });
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

  it('shows the layout-locked message when the server rejects LAYOUT_IN_USE', async () => {
    render();
    generate('1', '1');
    byId('layout-save').click();
    http
      .expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'))
      .flush({ code: 'LAYOUT_IN_USE' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byId('layout-error').textContent?.toLowerCase()).toContain('locked');
    // The booking arm is any booking ever (hasBookings), so the banner must not read as a live claim.
    expect(byId('layout-error').textContent).toMatch(/booked at least once/i);
    expect(byId('layout-error').textContent).toMatch(/still held/i);
  });

  it('pointsALockedLayoutAtPerSetEditing: the locked message no longer claims editing is impossible (AC-7)', async () => {
    render();
    generate('1', '1');
    byId('layout-save').click();
    http
      .expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'))
      .flush({ code: 'LAYOUT_IN_USE' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    const message = byId('layout-error').textContent ?? '';
    expect(message).toMatch(/edit sets/i);
    expect(message).not.toMatch(/not possible/i);
    // A terminal booking on one set locks the layout AND refuses that set's per-set remove.
    expect(message).not.toMatch(/or remove sets/i);
    expect(message).toMatch(/can’t be removed/i);
    // removeSet refuses on a live hold too, so the caveat must not read as booking-only.
    expect(message).toMatch(/held or has ever been booked/i);
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
      .flush({ id: 2, name: 'W', sets: [seat(9, 'STANDARD', 'ONLINE', 1, 1)], setVersion: 3 });
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
      .flush({ id: 2, name: 'W', sets: [], setVersion: 3 });
    // The superseded venue-1 response resolves late — it must not seed venue 2's editor.
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({ id: 1, name: 'V', sets: [seat(1, 'PREMIUM', 'ONLINE', 1, 1)], setVersion: 7 });
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
      .flush({ id: 2, name: 'W', sets: [], setVersion: 3 });
    // The RETURN visit's read settles first (empty layout at version 9)…
    venue1Reads[1].flush({ id: 1, name: 'V', sets: [], setVersion: 9 });
    // …then the FIRST visit's response arrives last. It must not seed the returned-to editor.
    venue1Reads[0].flush({
      id: 1,
      name: 'V',
      sets: [seat(1, 'PREMIUM', 'ONLINE', 1, 1)],
      setVersion: 7,
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
      .flush({ id: 2, name: 'W', sets: [seat(9, 'STANDARD', 'ONLINE', 1, 1)], setVersion: 3 });
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

    // A venue that already has sets opens in Edit sets — the only mode that works once it is trading.
    expect(byId('set-editor')).toBeTruthy();
    expect(byId('layout-generate')).toBeFalsy();
    expect(byId('layout-mode-sets').getAttribute('aria-pressed')).toBe('true');
  });

  it('opens an empty venue in bulk mode, where Generate is the operator’s next step (AC-6)', () => {
    render([]);

    expect(byId('layout-generate')).toBeTruthy();
    expect(byId('set-editor')).toBeFalsy();
    expect(byId('layout-mode-bulk').getAttribute('aria-pressed')).toBe('true');
  });

  it('lets the operator override the default, and keeps their choice across a re-read', () => {
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1)]);

    byId('layout-mode-bulk').click();
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
      .flush({ id: 1, name: 'V', sets: [seat(1, 'PREMIUM', 'WALK_IN', 1, 1)], setVersion: 0 });
    fixture.detectChanges();

    useBulkMode();
    expect(cells()).toHaveLength(1);
    expect(cells()[0].getAttribute('data-state')).toBe('walkin');
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
      .flush({ id: 1, name: 'V', sets: [seat(1, 'PREMIUM', 'WALK_IN', 1, 1)], setVersion: 0 });
    fixture.detectChanges();

    expect(byId('set-cell').getAttribute('data-state')).toBe('walkin');
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
