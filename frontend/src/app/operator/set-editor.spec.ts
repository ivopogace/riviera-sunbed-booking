import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';

import { expectCellsFillCanvasRow } from '../../testing/beach-map-height';
import { OperatorAuth } from '../core/operator-auth';
import { BeachMapCanvas } from '../shared/beach-map-canvas';
import { SetView } from '../shared/venue-views';
import { SetEditor } from './set-editor';

/**
 * The per-set beach-map editor (#600) — the surface that makes a live venue's map editable at all.
 * Drives select → change → save against the U7 `PATCH`, and pins the two properties the slice turns
 * on: the write carries the WHOLE set body, and a `409 SET_IN_USE` leaves the map exactly as the
 * server still has it (no optimistic flip survives a refusal). Also pins the load gate: until the
 * parent says the map read has settled, the surface renders a decorative skeleton rather than
 * reading its empty `sets` input as "this venue has none".
 */
describe('SetEditor (#600)', () => {
  let fixture: ComponentFixture<SetEditor>;
  let http: HttpTestingController;
  let host: HTMLElement;
  let changed: number;

  function set(overrides: Partial<SetView> & Pick<SetView, 'id'>): SetView {
    return {
      rowLabel: 'A',
      positionNo: 1,
      tier: 'STANDARD',
      pool: 'ONLINE',
      price: { minorUnits: 2000, currency: 'EUR' },
      gridX: 1,
      gridY: 1,
      availability: 'FREE',
      ...overrides,
    };
  }

  const SETS: SetView[] = [
    set({
      id: 10,
      rowLabel: 'A',
      positionNo: 1,
      tier: 'PREMIUM',
      gridX: 1,
      gridY: 1,
      price: { minorUnits: 3500, currency: 'EUR' },
    }),
    set({
      id: 11,
      rowLabel: 'A',
      positionNo: 2,
      tier: 'PREMIUM',
      gridX: 2,
      gridY: 1,
      price: { minorUnits: 3500, currency: 'EUR' },
    }),
    set({ id: 12, rowLabel: 'B', positionNo: 1, gridX: 1, gridY: 2 }),
    set({ id: 13, rowLabel: 'B', positionNo: 2, gridX: 2, gridY: 2, pool: 'WALK_IN' }),
  ];

  function render(
    sets: readonly SetView[] = SETS,
    loaded = true,
    expectedVersion: number | null = 5,
  ): void {
    TestBed.configureTestingModule({
      imports: [SetEditor],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(SetEditor);
    http = TestBed.inject(HttpTestingController);
    changed = 0;
    fixture.componentRef.setInput('venueId', 1);
    fixture.componentRef.setInput('sets', sets);
    fixture.componentRef.setInput('loaded', loaded);
    fixture.componentRef.setInput('expectedVersion', expectedVersion);
    fixture.componentInstance.changed.subscribe(() => (changed += 1));
    fixture.detectChanges();
    // OperatorAuth restores the session on construction — settle it as signed-out.
    http
      .expectOne((r) => r.url.includes('/api/auth/me'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  }

  afterEach(() => http.verify());

  function byId(id: string): HTMLElement {
    return host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  }

  function cells(): HTMLButtonElement[] {
    return Array.from(host.querySelectorAll<HTMLButtonElement>('[data-testid="set-cell"]'));
  }

  function skeletonTiles(): HTMLElement[] {
    return Array.from(host.querySelectorAll<HTMLElement>('[data-testid="set-skeleton-tile"]'));
  }

  function cellForSet(setId: number): HTMLButtonElement {
    return cells().find((c) => c.dataset['setId'] === String(setId))!;
  }

  function cellForGrid(gridX: number, gridY: number): HTMLButtonElement {
    return cells().find(
      (c) => c.dataset['gridX'] === String(gridX) && c.dataset['gridY'] === String(gridY),
    )!;
  }

  function click(element: HTMLElement): void {
    element.click();
    fixture.detectChanges();
  }

  function selectSet(setId: number): void {
    click(cellForSet(setId));
  }

  function typePrice(value: string): void {
    const input = byId('set-price') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function typeBatchPrice(value: string): void {
    const input = byId('batch-price') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function expectPatch(setId: number): TestRequest {
    return http.expectOne(
      (r) => r.method === 'PATCH' && r.url.endsWith(`/api/venues/1/sets/${setId}`),
    );
  }

  it('renders one cell per grid position, saved sets carrying their id and state', () => {
    render();

    // A 2×2 extent from the four sets, plus the grow affordances — every position is a cell.
    expect(cells().length).toBeGreaterThanOrEqual(4);
    expect(cellForSet(10).getAttribute('data-state')).toBe('premium');
    expect(cellForSet(12).getAttribute('data-state')).toBe('standard');
    expect(cellForSet(13).getAttribute('data-state')).toBe('walkin');
  });

  it('renders on the shared canvas: frame, pan viewport and aria-hidden row-code rail (#677)', () => {
    render();

    expect(byId('set-grid-frame')).toBeTruthy();
    // The testid rides the canvas pan viewport — the element the touch-target e2e measures.
    expect(byId('set-grid').querySelectorAll('[data-testid="set-cell"]')).toHaveLength(4);

    const codes = Array.from(host.querySelectorAll<HTMLElement>('[data-testid="row-code"]'));
    expect(codes.map((c) => c.textContent?.trim())).toEqual(['A', 'B']);
    // The rail is decorative for AT: every cell's aria-label already carries "Row X position N".
    expect(codes[0].closest('[aria-hidden="true"]')).toBeTruthy();
  });

  it('fills the canvas-owned row height with set cells, never a height mechanism of its own (#685)', () => {
    render();
    expectCellsFillCanvasRow(host, '[data-testid="set-cell"]');
  });

  it('chips every row’s price from its first set, and none for a set-less grown row (#677)', () => {
    render();
    const prices = () =>
      Array.from(host.querySelectorAll<HTMLElement>('[data-testid="row-price"]')).map((n) =>
        n.textContent?.trim(),
      );

    // The bulk editor’s posture (#674 F-2): every row is its own zone, chipped per row.
    expect(prices()).toEqual(['€35', '€20']);

    click(byId('set-add-row'));
    expect(prices()).toEqual(['€35', '€20']);
    expect(
      Array.from(host.querySelectorAll<HTMLElement>('[data-testid="row-code"]')).map((c) =>
        c.textContent?.trim(),
      ),
    ).toEqual(['A', 'B', 'C']);
  });

  it('shows the empty-selection hint until a set is picked', () => {
    render();

    expect(byId('set-panel-empty')).toBeTruthy();
    selectSet(12);
    expect(byId('set-panel-empty')).toBeFalsy();
    expect(byId('set-panel').textContent).toContain('Row B');
  });

  it('docks the inspector beside the canvas, absent until a set is selected (#712)', () => {
    render();

    expect(byId('set-panel')).toBeFalsy();
    const columns = byId('set-editor').querySelector<HTMLElement>('.grid')!;
    expect(columns.className).not.toContain('lg:grid-cols-[1fr_320px]');

    selectSet(12);

    expect(byId('set-panel')).toBeTruthy();
    expect(columns.className).toContain('lg:grid-cols-[1fr_320px]');
  });

  it('moves focus into the inspector when it first opens (#712)', async () => {
    render();
    selectSet(12);
    await fixture.whenStable();

    expect(document.activeElement).toBe(byId('set-panel'));
  });

  it('re-clicking the already-selected tile re-affirms the selection instead of closing it (#712)', async () => {
    render();
    selectSet(12);
    await fixture.whenStable();

    selectSet(12);
    await fixture.whenStable();

    expect(byId('set-panel')).toBeTruthy();
    expect(byId('set-panel').textContent).toContain('Row B');
  });

  it('closes the inspector and refocuses the tile via its Close control (#712)', async () => {
    render();
    selectSet(12);
    await fixture.whenStable();

    click(byId('set-panel-close'));
    await fixture.whenStable();

    expect(byId('set-panel')).toBeFalsy();
    expect(document.activeElement).toBe(cellForGrid(1, 2));
  });

  it('closes the inspector and refocuses the tile on Escape (#712)', async () => {
    render();
    selectSet(12);
    await fixture.whenStable();

    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(byId('set-panel')).toBeFalsy();
    expect(document.activeElement).toBe(cellForGrid(1, 2));
  });

  it('dismisses the inspector via the mobile sheet backdrop, refocusing the tile (#715)', async () => {
    render();
    selectSet(12);
    await fixture.whenStable();

    click(byId('sheet-backdrop'));
    await fixture.whenStable();

    expect(byId('set-panel')).toBeFalsy();
    expect(document.activeElement).toBe(cellForGrid(1, 2));
  });

  it('dismisses a standing sweep via the mobile sheet backdrop (#715)', () => {
    render();
    dragSweep(1, 1, 1, 2);
    expect(byId('batch-panel')).toBeTruthy();

    click(byId('sheet-backdrop'));

    expect(byId('batch-panel')).toBeFalsy();
  });

  /** jsdom doesn't implement pointer capture; stubbing it is the standard test workaround. */
  function stubPointerCapture(element: HTMLElement): void {
    element.setPointerCapture = () => undefined;
    element.releasePointerCapture = () => undefined;
  }

  it('a swipe-down past the threshold on the sheet handle dismisses it, refocusing the tile (#715)', async () => {
    render();
    selectSet(12);
    await fixture.whenStable();
    const handle = byId('sheet-handle');
    stubPointerCapture(handle);

    handle.dispatchEvent(new PointerEvent('pointerdown', { clientY: 0, pointerId: 1 }));
    handle.dispatchEvent(new PointerEvent('pointermove', { clientY: 120, pointerId: 1 }));
    handle.dispatchEvent(new PointerEvent('pointerup', { clientY: 120, pointerId: 1 }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(byId('set-panel')).toBeFalsy();
    expect(document.activeElement).toBe(cellForGrid(1, 2));
  });

  it('a swipe-down short of the threshold springs the sheet back instead of dismissing it (#715)', () => {
    render();
    selectSet(12);
    const handle = byId('sheet-handle');
    stubPointerCapture(handle);

    handle.dispatchEvent(new PointerEvent('pointerdown', { clientY: 0, pointerId: 1 }));
    handle.dispatchEvent(new PointerEvent('pointermove', { clientY: 30, pointerId: 1 }));
    fixture.detectChanges();
    expect(byId('set-panel').style.transform).toBe('translateY(30px)');

    handle.dispatchEvent(new PointerEvent('pointerup', { clientY: 30, pointerId: 1 }));
    fixture.detectChanges();

    expect(byId('set-panel')).toBeTruthy();
    expect(byId('set-panel').style.transform).toBe('translateY(0px)');
  });

  it('scrolls the page so a newly selected tile clears the mobile bottom sheet (#715)', async () => {
    render();
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    const tile = cellForGrid(1, 2);
    tile.getBoundingClientRect = () =>
      ({
        bottom: 2000,
        top: 1950,
        left: 0,
        right: 40,
        width: 40,
        height: 50,
        x: 0,
        y: 1950,
      }) as DOMRect;

    click(tile);
    await fixture.whenStable();

    expect(scrollBy).toHaveBeenCalledTimes(1);
    const arg = scrollBy.mock.calls[0][0] as unknown as { top: number };
    expect(arg.top).toBeGreaterThan(0);
    scrollBy.mockRestore();
  });

  it('switching selections leaves the inspector in place without re-triggering the open focus move (#712)', async () => {
    render();
    selectSet(12);
    await fixture.whenStable();
    byId('set-panel').blur();

    selectSet(13);
    fixture.detectChanges();

    // No open-transition fired (null → selection didn't happen), so focus was never redirected.
    expect(document.activeElement).not.toBe(byId('set-panel'));
    expect(byId('set-panel').textContent).toContain('Row B');
  });

  it('reclaims focus stranded on <body> when the selected set drops out of a re-read (#712 review)', async () => {
    render();
    selectSet(12);
    await fixture.whenStable();
    // A re-read from elsewhere drops the selected set with no `closeSelection()` call.
    fixture.componentRef.setInput(
      'sets',
      SETS.filter((s) => s.id !== 12),
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(byId('set-panel')).toBeFalsy();
    expect(document.activeElement).toBe(cellForGrid(1, 2));
  });

  it('patchesTheWholeSetBodyOnSave: one PATCH carrying every field, then a re-read (AC-1)', async () => {
    render();
    selectSet(12);

    click(byId('set-pool-WALK_IN'));
    typePrice('25');
    click(byId('set-save'));

    const request = expectPatch(12);
    expect(request.request.body).toEqual({
      rowLabel: 'B',
      positionNo: 1,
      tier: 'STANDARD',
      pool: 'WALK_IN',
      price: { minorUnits: 2500, currency: 'EUR' },
      gridX: 1,
      gridY: 2,
    });

    request.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(changed).toBe(1);
    expect(byId('set-saved')).toBeTruthy();
  });

  it('keepsTheSetUnchangedOnSetInUse: a refused repool leaves the grid as the server has it (AC-2)', async () => {
    render();
    selectSet(12);

    click(byId('set-pool-WALK_IN'));
    click(byId('set-save'));
    expectPatch(12).flush({ code: 'SET_IN_USE' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    // Still the SERVER's pool (nothing optimistic), and no re-read asked for — nothing changed.
    expect(cellForSet(12).getAttribute('data-state')).toBe('standard');
    expect(changed).toBe(0);
    const message = byId('set-error').textContent ?? '';
    // The save carries pool AND the placement snapshot, so it names both rather than guessing which.
    expect(message).toMatch(/pool and position can’t change/i);
    expect(message).toMatch(/price and tier can still change/i);
    // The edit guard refuses only a live claim, so the message must not speak for the remove guard.
    expect(message).not.toMatch(/removed/i);
  });

  it('explains a cross-venue refusal in the operator’s terms (invariant #13)', async () => {
    render();
    selectSet(12);
    click(byId('set-save'));
    expectPatch(12).flush({ code: 'NOT_VENUE_OWNER' }, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byId('set-error').textContent).toMatch(/do not manage this venue/i);
  });

  it('refuses to send a cleared price rather than saving the set as free', () => {
    render();
    selectSet(12);

    typePrice('');
    click(byId('set-save'));

    // No PATCH goes out at all; the panel explains instead of silently repricing to zero.
    http.expectNone((r) => r.method === 'PATCH');
    expect(byId('set-error').textContent).toMatch(/amount of €0 or more|price is required/i);
  });

  it('re-seeds the draft from the server when the sets input is replaced', () => {
    render();
    selectSet(12);
    click(byId('set-pool-WALK_IN'));
    expect(byId('set-pool-WALK_IN').getAttribute('aria-pressed')).toBe('true');

    // A re-read lands from another device: the draft must follow the server, not outlive its basis.
    fixture.componentRef.setInput('sets', [
      ...SETS.filter((s) => s.id !== 12),
      set({ id: 12, rowLabel: 'B', positionNo: 1, gridX: 1, gridY: 2 }),
    ]);
    fixture.detectChanges();

    expect(byId('set-pool-ONLINE').getAttribute('aria-pressed')).toBe('true');
  });

  it('removesASet: confirm, then DELETE, then the selection clears and the map re-reads (AC-4)', async () => {
    render();
    selectSet(12);

    // The first click only arms the confirm — a destructive action is never one tap away.
    click(byId('set-remove'));
    http.expectNone((r) => r.method === 'DELETE');
    expect(byId('set-remove-confirm')).toBeTruthy();

    click(byId('set-remove-yes'));
    http
      .expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/api/venues/1/sets/12'))
      .flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(changed).toBe(1);
    expect(byId('set-panel-empty')).toBeTruthy();
  });

  it('lets the operator back out of a remove without touching the server', () => {
    render();
    selectSet(12);

    click(byId('set-remove'));
    click(byId('set-remove-no'));

    http.expectNone((r) => r.method === 'DELETE');
    expect(byId('set-remove-confirm')).toBeFalsy();
    expect(byId('set-panel-empty')).toBeFalsy();
  });

  it('moves focus with the remove confirmation, and parks it when the panel empties (WCAG 2.4.3)', async () => {
    render();
    selectSet(12);

    click(byId('set-remove'));
    await fixture.whenStable();
    expect(document.activeElement).toBe(byId('set-remove-yes'));

    click(byId('set-remove-no'));
    await fixture.whenStable();
    expect(document.activeElement).toBe(byId('set-remove'));

    click(byId('set-remove'));
    await fixture.whenStable();
    click(byId('set-remove-yes'));
    http
      .expectOne((r) => r.method === 'DELETE')
      .flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    // The panel is gone with the selection, so focus parks on the now-empty tile.
    expect(byId('set-panel')).toBeFalsy();
    expect(document.activeElement).toBe(cellForGrid(1, 2));
  });

  it('explainsARefusedRemove: a booked set stays on the map with the reason (AC-4)', async () => {
    render();
    selectSet(12);

    click(byId('set-remove'));
    click(byId('set-remove-yes'));
    http
      .expectOne((r) => r.method === 'DELETE')
      .flush({ code: 'SET_IN_USE' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(cellForSet(12)).toBeTruthy();
    expect(changed).toBe(0);
    const message = byId('set-error').textContent ?? '';
    expect(message).toMatch(/can’t be removed/i);
    // The remove guard reaches any booking ever, so the copy states that arm as permanent.
    expect(message).toMatch(/booked at least once/i);
    expect(message).not.toMatch(/repooled/i);
  });

  function emptyCell(gridX: number, gridY: number): HTMLButtonElement {
    return cells().find(
      (c) => c.dataset['gridX'] === String(gridX) && c.dataset['gridY'] === String(gridY),
    )!;
  }

  it('addsASetIntoAGrownGridCell: grow, pick the new cell, POST with derived row/position (AC-3)', async () => {
    render();
    // The 2×2 grid is full, so growing is the only way to add — the ordinary case, not an edge one.
    expect(cells()).toHaveLength(4);

    click(byId('set-add-col'));
    expect(cells()).toHaveLength(6);

    click(emptyCell(3, 1));
    expect(byId('set-add')).toBeTruthy();
    click(byId('set-add'));

    const request = http.expectOne(
      (r) => r.method === 'POST' && r.url.endsWith('/api/venues/1/sets'),
    );
    expect(request.request.body).toEqual({
      rowLabel: 'A',
      positionNo: 3,
      tier: 'PREMIUM',
      pool: 'ONLINE',
      price: { minorUnits: 3500, currency: 'EUR' },
      gridX: 3,
      gridY: 1,
    });

    request.flush({ id: 99 }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(changed).toBe(1);
  });

  it('a set added into a named row inherits the row’s label, not a bare letter (#723)', async () => {
    render([
      set({
        id: 10,
        rowLabel: 'Under the pines',
        positionNo: 1,
        tier: 'PREMIUM',
        gridX: 1,
        gridY: 1,
        price: { minorUnits: 3500, currency: 'EUR' },
      }),
      set({ id: 12, rowLabel: 'B', positionNo: 1, gridX: 1, gridY: 2 }),
    ]);

    click(byId('set-add-col'));
    click(emptyCell(2, 1));
    click(byId('set-add'));

    const request = http.expectOne(
      (r) => r.method === 'POST' && r.url.endsWith('/api/venues/1/sets'),
    );
    expect(request.request.body).toMatchObject({
      rowLabel: 'Under the pines',
      positionNo: 2,
      gridX: 2,
      gridY: 1,
    });

    request.flush({ id: 99 }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
  });

  it('a set moved into a named row takes that row’s label (#723)', async () => {
    render([
      set({
        id: 10,
        rowLabel: 'Under the pines',
        positionNo: 1,
        tier: 'PREMIUM',
        gridX: 1,
        gridY: 1,
        price: { minorUnits: 3500, currency: 'EUR' },
      }),
      set({ id: 12, rowLabel: 'B', positionNo: 1, gridX: 1, gridY: 2 }),
    ]);
    selectSet(12);
    click(byId('set-add-col'));

    click(byId('set-move'));
    click(emptyCell(2, 1));

    const request = http.expectOne(
      (r) => r.method === 'PATCH' && r.url.endsWith('/api/venues/1/sets/12'),
    );
    expect(request.request.body).toMatchObject({
      rowLabel: 'Under the pines',
      positionNo: 2,
      gridX: 2,
      gridY: 1,
    });

    request.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
  });

  it('adds a row as well, defaulting a back row to standard rather than front-row premium', () => {
    render();
    click(byId('set-add-row'));

    click(emptyCell(1, 3));
    click(byId('set-add'));

    const body = http.expectOne((r) => r.method === 'POST').request.body as {
      price: { minorUnits: number; currency: string };
    };
    expect(body).toMatchObject({ rowLabel: 'C', positionNo: 1, tier: 'STANDARD', gridY: 3 });
    expect(body.price).toEqual({ minorUnits: 2000, currency: 'EUR' });
  });

  it('clamps growing at the server’s layout maxima, so the grid can’t ask for a 400 (R-4)', () => {
    render();

    for (let i = 0; i < 45; i++) {
      byId('set-add-col').click();
    }
    fixture.detectChanges();

    expect(cells()).toHaveLength(40 * 2);
    expect((byId('set-add-col') as HTMLButtonElement).disabled).toBe(true);
  });

  it('movesASetToAnEmptyCell: one PATCH with the new cell and the set’s saved values (AC-5)', async () => {
    render();
    selectSet(12);
    click(byId('set-add-col'));

    click(byId('set-move'));
    click(emptyCell(3, 1));

    const request = http.expectOne(
      (r) => r.method === 'PATCH' && r.url.endsWith('/api/venues/1/sets/12'),
    );
    expect(request.request.body).toEqual({
      rowLabel: 'A',
      positionNo: 3,
      tier: 'STANDARD',
      pool: 'ONLINE',
      price: { minorUnits: 2000, currency: 'EUR' },
      gridX: 3,
      gridY: 1,
    });

    request.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(changed).toBe(1);
  });

  it('refuses to move a set with unsaved changes, so a move never smuggles an edit', () => {
    render();
    selectSet(12);
    click(byId('set-pool-WALK_IN'));

    expect((byId('set-move') as HTMLButtonElement).disabled).toBe(true);
    expect(byId('set-move-blocked')).toBeTruthy();
  });

  it('does not leave a move armed for a set that is gone, which would freeze the whole grid', async () => {
    render();
    selectSet(12);
    click(byId('set-add-col'));
    click(byId('set-move'));
    expect(byId('set-move-armed')).toBeTruthy();

    // Remove the set the move was armed for: the arm loses its subject AND its own Cancel button.
    click(byId('set-remove'));
    click(byId('set-remove-yes'));
    http
      .expectOne((r) => r.method === 'DELETE')
      .flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byId('set-move-armed')).toBeFalsy();
    // The grid is still operable: another set selects normally rather than reading as a move target.
    selectSet(10);
    expect(byId('set-selected').textContent).toContain('Row A');
    expect(byId('set-move-armed')).toBeFalsy();
  });

  it('explainsARefusedMove: surfaces a refused move without moving anything on the map', async () => {
    render();
    selectSet(12);
    click(byId('set-add-col'));
    click(byId('set-move'));
    click(emptyCell(3, 1));
    http
      .expectOne((r) => r.method === 'PATCH')
      .flush({ code: 'SET_IN_USE' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(cellForSet(12).dataset['gridX']).toBe('1');
    expect(changed).toBe(0);
    const message = byId('set-error').textContent ?? '';
    expect(message).toMatch(/can’t be moved/i);
    expect(message).not.toMatch(/removed/i);
  });

  it('refusalCopyIsDistinctPerAction: the three in-use refusals share no one string (AC-4)', async () => {
    render();
    const seen = new Set<string>();
    const conflict = { status: 409, statusText: 'Conflict' };

    // Move first: the Move button is disabled while the draft is dirty, which a repool leaves it.
    selectSet(12);
    click(byId('set-add-col'));
    click(byId('set-move'));
    click(emptyCell(3, 1));
    http.expectOne((r) => r.method === 'PATCH').flush({ code: 'SET_IN_USE' }, conflict);
    await fixture.whenStable();
    fixture.detectChanges();
    seen.add(byId('set-error').textContent ?? '');

    click(byId('set-pool-WALK_IN'));
    click(byId('set-save'));
    expectPatch(12).flush({ code: 'SET_IN_USE' }, conflict);
    await fixture.whenStable();
    fixture.detectChanges();
    seen.add(byId('set-error').textContent ?? '');

    click(byId('set-remove'));
    click(byId('set-remove-yes'));
    http.expectOne((r) => r.method === 'DELETE').flush({ code: 'SET_IN_USE' }, conflict);
    await fixture.whenStable();
    fixture.detectChanges();
    seen.add(byId('set-error').textContent ?? '');

    expect(seen.size).toBe(3);
  });

  it('drops the selection when the selected set is gone from a re-read', () => {
    render();
    selectSet(12);
    expect(byId('set-panel-empty')).toBeFalsy();

    fixture.componentRef.setInput(
      'sets',
      SETS.filter((s) => s.id !== 12),
    );
    fixture.detectChanges();

    expect(byId('set-panel-empty')).toBeTruthy();
  });

  it('shows a skeleton, not an empty venue, while the map read is in flight (#721)', () => {
    // The parent seeds `sets` with [] until its GET resolves; without the gate that reads as "none".
    render([], false);

    expect(skeletonTiles().length).toBeGreaterThan(0);
    expect(byId('set-skeleton-panel')).toBeTruthy();
    expect(cells()).toHaveLength(0);
    expect(byId('set-panel-no-sets')).toBeFalsy();
    expect(byId('set-panel-empty')).toBeFalsy();
  });

  it('fits the skeleton to the same width the real grid will use, so loading never slides the grid (#709, #749)', () => {
    render([], false);

    const canvases = fixture.debugElement.queryAll(By.directive(BeachMapCanvas));
    expect(canvases).toHaveLength(1); // only the skeleton canvas renders while unloaded
    expect((canvases[0].componentInstance as BeachMapCanvas).fitWidth()).toBe(true);
  });

  it('replaces the skeleton with the venue’s real sets when the read lands (#721)', () => {
    render([], false);

    fixture.componentRef.setInput('sets', SETS);
    fixture.componentRef.setInput('loaded', true);
    fixture.detectChanges();

    expect(skeletonTiles()).toHaveLength(0);
    expect(host.querySelector('[data-testid="set-skeleton-panel"]')).toBeNull();
    expect(cells()).toHaveLength(4);
    expect(byId('set-panel-empty').textContent).toContain('Pick a set on the map');
  });

  it('skeletons are wholly decorative, and motion-reduce safe (#721, #741)', () => {
    render([], false);

    const loading = byId('set-loading');
    // It used to be the live region itself — born holding its text, so never announced (#741).
    expect(loading.getAttribute('aria-live')).toBeNull();
    expect(loading.getAttribute('aria-hidden')).toBe('true');
    expect(byId('set-skeleton').getAttribute('aria-hidden')).toBe('true');
    for (const pulsing of [skeletonTiles()[0], byId('set-skeleton-panel')]) {
      expect(pulsing.classList.contains('animate-pulse')).toBe(true);
      expect(pulsing.classList.contains('motion-reduce:animate-none')).toBe(true);
    }
  });

  it('announces through one region that survives loading → loaded (#741)', () => {
    render([], false);
    const host = fixture.nativeElement as HTMLElement;
    const announcer = host.querySelector('[data-testid="load-announcer"]')!;
    expect(announcer.textContent?.trim()).toBe('Loading this venue’s sets…');

    fixture.componentRef.setInput('loaded', true);
    fixture.detectChanges();

    // Same node, mutated text: the mechanism that makes a live region speak.
    expect(host.querySelector('[data-testid="load-announcer"]')).toBe(announcer);
    expect(announcer.textContent?.trim()).toBe('Sets loaded.');
  });

  it('points a set-less venue at the bulk generator, and still adds into the one empty spot (#718)', () => {
    render([]);

    expect(skeletonTiles()).toHaveLength(0); // a settled read: emptiness is now a fact, not a default
    expect(byId('set-panel-empty')).toBeFalsy();
    expect(byId('set-panel-no-sets').textContent).toContain('tool rail');
    // The grid never empties here (rowCount/colCount clamp to at least 1x1), so the map IS the way in.
    expect(cells()).toHaveLength(1);

    click(cells()[0]);

    expect(byId('set-add')).toBeTruthy();
  });

  it('keeps the pick-a-set copy when the venue has sets (#718)', () => {
    render();

    expect(byId('set-panel-no-sets')).toBeFalsy();
    expect(byId('set-panel-empty').textContent).toContain('Pick a set on the map');
  });

  // ---- Batch select (#714) ----

  /**
   * Mimics a real browser's own gesture: mousedown → mouseenter → mouseup. A genuine cross-cell
   * drag fires NO `click` at all in a real browser (mousedown/mouseup on different elements never
   * synthesize one) — only a there-and-back release onto the SAME cell as the mousedown does, and
   * that is what {@link SetEditor}'s one-shot suppression guards against.
   */
  function dragSweep(fromGridX: number, fromGridY: number, toGridX: number, toGridY: number): void {
    const from = cellForGrid(fromGridX, fromGridY);
    const to = cellForGrid(toGridX, toGridY);
    from.dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1 }));
    to.dispatchEvent(new MouseEvent('mouseenter', { buttons: 1 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    if (to === from) {
      to.click();
    }
    fixture.detectChanges();
  }

  interface LayoutPutCell {
    rowLabel: string;
    positionNo: number;
    tier: string;
    pool: string;
    price: { minorUnits: number; currency: string };
  }

  interface LayoutPutBody {
    sets: LayoutPutCell[];
    expectedVersion: number;
  }

  function expectLayoutPut(): TestRequest {
    return http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/beach-map'));
  }

  function layoutPutBody(req: TestRequest): LayoutPutBody {
    return req.request.body as LayoutPutBody;
  }

  it('sweeps a rectangular block of sets on a multi-cell drag', () => {
    render();
    dragSweep(1, 1, 1, 2); // column 1, rows A and B: sets 10 and 12

    expect(byId('batch-panel')).toBeTruthy();
    expect(byId('batch-count').textContent).toContain('2 sets selected');
    expect(byId('batch-range').textContent).toMatch(/Rows A–B/);
    expect(cellForSet(10).getAttribute('aria-pressed')).toBe('true');
    expect(cellForSet(12).getAttribute('aria-pressed')).toBe('true');
    expect(cellForSet(11).getAttribute('aria-pressed')).toBe('false');
    expect(byId('set-sweep-announce').textContent).toContain('2 sets selected');
  });

  it('a single-cell drag is an ordinary tap, not a sweep (AC-6)', () => {
    render();
    cellForGrid(1, 2).dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    fixture.detectChanges();
    click(cellForGrid(1, 2));

    expect(byId('batch-panel')).toBeFalsy();
    expect(byId('set-panel')).toBeTruthy();
    expect(byId('set-selected').textContent).toMatch(/Row B · position 1/);
  });

  it('applies only the touched field, per field (AC-2)', async () => {
    render();
    dragSweep(1, 1, 2, 1); // row A: sets 10 and 11, both PREMIUM/ONLINE/€35

    typeBatchPrice('40');
    click(byId('batch-apply'));

    const req = expectLayoutPut();
    const body = layoutPutBody(req);
    expect(body.expectedVersion).toBe(5);
    const sets = body.sets;
    const touched = sets.filter((s) => s.rowLabel === 'A');
    const untouched = sets.filter((s) => s.rowLabel === 'B');
    expect(touched.every((s) => s.price.minorUnits === 4000)).toBe(true);
    expect(touched.every((s) => s.tier === 'PREMIUM' && s.pool === 'ONLINE')).toBe(true); // untouched fields kept
    expect(untouched.every((s) => s.price.minorUnits === 2000)).toBe(true); // sets outside the sweep are untouched

    req.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(byId('batch-saved')).toBeTruthy();
    expect(changed).toBe(1);
  });

  it('applies only tier for a tier-only touch, leaving pool and price alone', () => {
    render();
    dragSweep(1, 2, 2, 2); // row B: sets 12 (ONLINE) and 13 (WALK_IN)

    click(byId('batch-tier-PREMIUM'));
    click(byId('batch-apply'));

    const sets = layoutPutBody(expectLayoutPut()).sets;
    const set12 = sets.find((s) => s.rowLabel === 'B' && s.positionNo === 1)!;
    const set13 = sets.find((s) => s.rowLabel === 'B' && s.positionNo === 2)!;
    expect(set12.tier).toBe('PREMIUM');
    expect(set12.pool).toBe('ONLINE'); // untouched field kept
    expect(set13.tier).toBe('PREMIUM');
    expect(set13.pool).toBe('WALK_IN'); // each set's own untouched pool survives independently
  });

  it('a STALE_WRITE batch apply keeps the selection and offers Reload (AC-4)', async () => {
    render();
    let staleEmitted = 0;
    fixture.componentInstance.staleWrite.subscribe(() => (staleEmitted += 1));
    dragSweep(1, 1, 1, 2);
    click(byId('batch-tier-STANDARD'));
    click(byId('batch-apply'));

    expectLayoutPut().flush({ code: 'STALE_WRITE' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(staleEmitted).toBe(1);
    expect(byId('batch-panel')).toBeTruthy(); // the sweep survives the conflict
    expect(byId('batch-count').textContent).toContain('2 sets selected');
    expect(byId('batch-error')).toBeFalsy(); // the parent's reload banner owns this, not an inline message
  });

  it('a stale apply resolving after the operator moved to a new sweep never touches the new one', async () => {
    render();
    dragSweep(1, 1, 1, 2); // sets 10 and 12
    click(byId('batch-tier-STANDARD'));
    click(byId('batch-apply')); // in flight, not yet flushed
    const firstPut = expectLayoutPut();

    // Clear and the sweep gesture aren't busy-gated, so this can happen mid-flight.
    click(byId('batch-clear'));
    dragSweep(2, 1, 2, 2); // a fresh sweep: sets 11 and 13
    typeBatchPrice('45');

    firstPut.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    fixture.detectChanges();

    // The abandoned apply's success must not stomp the operator's new, still-unsaved sweep.
    expect(byId('batch-count').textContent).toContain('2 sets selected');
    expect((byId('batch-price') as HTMLInputElement).value).toBe('45');
    expect(byId('batch-saved')).toBeFalsy();
  });

  it('Escape and Clear both empty the sweep and move focus back to the canvas (AC-5)', async () => {
    render();
    dragSweep(1, 1, 1, 2);
    expect(byId('batch-panel')).toBeTruthy();

    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(byId('batch-panel')).toBeFalsy();
    expect(document.activeElement).toBe(cellForGrid(1, 1));

    dragSweep(1, 1, 1, 2);
    click(byId('batch-clear'));
    await fixture.whenStable();
    expect(byId('batch-panel')).toBeFalsy();
    expect(document.activeElement).toBe(cellForGrid(1, 1));
  });

  it('a plain single tap always supersedes a standing sweep', () => {
    render();
    dragSweep(1, 1, 1, 2);
    expect(byId('batch-panel')).toBeTruthy();

    selectSet(11);

    expect(byId('batch-panel')).toBeFalsy();
    expect(byId('set-selected').textContent).toMatch(/Row A · position 2/);
  });

  it('drops the whole sweep, not just the removed id, when a re-read no longer carries one of its sets', () => {
    render();
    dragSweep(1, 1, 1, 2); // sets 10 and 12

    fixture.componentRef.setInput(
      'sets',
      SETS.filter((s) => s.id !== 12),
    );
    fixture.detectChanges();

    expect(byId('batch-panel')).toBeFalsy();
  });

  it('a sweep that releases back on its own starting cell suppresses only that one click', () => {
    render();
    const start = cellForGrid(2, 1);
    const other = cellForGrid(1, 1);
    start.dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1 }));
    other.dispatchEvent(new MouseEvent('mouseenter', { buttons: 1 }));
    start.dispatchEvent(new MouseEvent('mouseenter', { buttons: 1 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    start.click();
    fixture.detectChanges();

    // The sweep committed (ids 10 and 11), and the click the release fired was swallowed.
    expect(byId('batch-panel')).toBeTruthy();
    expect(byId('batch-count').textContent).toContain('2 sets selected');
  });

  it('a mousedown ignores a non-primary button, an armed move, and an open remove confirmation', () => {
    render();
    // Non-primary button: no sweep arms, so a later mouseenter is inert and a plain click still selects.
    cellForGrid(1, 1).dispatchEvent(new MouseEvent('mousedown', { button: 1, buttons: 4 }));
    cellForGrid(1, 2).dispatchEvent(new MouseEvent('mouseenter', { buttons: 4 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    fixture.detectChanges();
    expect(byId('batch-panel')).toBeFalsy();

    // A move armed on a selected set: mousedown on another cell must not start a sweep either.
    selectSet(12);
    click(byId('set-add-col'));
    click(byId('set-move'));
    emptyCell(3, 1).dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1 }));
    emptyCell(3, 2).dispatchEvent(new MouseEvent('mouseenter', { buttons: 1 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    fixture.detectChanges();
    expect(byId('batch-panel')).toBeFalsy();
    expect(byId('set-move-armed')).toBeTruthy(); // the move is still armed, untouched by the drag
  });

  it('a mouseenter with no matching mousedown is a no-op', () => {
    render();
    cellForGrid(1, 2).dispatchEvent(new MouseEvent('mouseenter', { buttons: 1 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    fixture.detectChanges();

    expect(byId('batch-panel')).toBeFalsy();
    expect(byId('set-panel')).toBeFalsy();
  });

  it('an off-window release (no button held) disarms the sweep without committing it', () => {
    render();
    cellForGrid(1, 1).dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1 }));
    cellForGrid(1, 2).dispatchEvent(new MouseEvent('mouseenter', { buttons: 1 }));
    cellForGrid(1, 2).dispatchEvent(new MouseEvent('mouseenter', { buttons: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    fixture.detectChanges();

    expect(byId('batch-panel')).toBeFalsy();
  });

  it('a sweep over an all-gap rectangle opens no batch panel', () => {
    render();
    click(byId('set-add-col')); // a fresh empty column: gridX 3, both rows

    emptyCell(3, 1).dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1 }));
    emptyCell(3, 2).dispatchEvent(new MouseEvent('mouseenter', { buttons: 1 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    fixture.detectChanges();

    expect(byId('batch-panel')).toBeFalsy();
  });

  it('touching only pool applies it to every swept set, leaving tier and price alone', () => {
    render();
    dragSweep(1, 2, 2, 2); // row B: sets 12 (ONLINE) and 13 (WALK_IN)

    click(byId('batch-pool-WALK_IN'));
    click(byId('batch-apply'));

    const sets = layoutPutBody(expectLayoutPut()).sets;
    const set12 = sets.find((s) => s.rowLabel === 'B' && s.positionNo === 1)!;
    const set13 = sets.find((s) => s.rowLabel === 'B' && s.positionNo === 2)!;
    expect(set12.pool).toBe('WALK_IN');
    expect(set12.tier).toBe('STANDARD'); // untouched field kept
    expect(set13.pool).toBe('WALK_IN');
    expect(set13.price.minorUnits).toBe(2000); // untouched field kept
  });

  it('never applies without the expectedVersion token (no map read has settled)', () => {
    render(SETS, true, null);
    dragSweep(1, 1, 1, 2);
    click(byId('batch-tier-PREMIUM'));
    click(byId('batch-apply'));

    http.expectNone((r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/beach-map'));
    expect(byId('batch-panel')).toBeTruthy(); // the sweep is untouched, not silently dropped
  });

  it('refuses an unparsable price rather than sending it, without touching the map', () => {
    render();
    dragSweep(1, 1, 1, 2);
    // A number input sanitizes an invalid string to '' at the DOM level, so bypass the setter.
    fixture.debugElement
      .query(By.css('[data-testid="batch-price"]'))
      .triggerEventHandler('input', { target: { value: '1e1000' } });
    fixture.detectChanges();
    click(byId('batch-apply'));

    http.expectNone((r) => r.method === 'PUT' && r.url.endsWith('/api/venues/1/beach-map'));
    expect(byId('batch-error').textContent).toMatch(/not valid/i);
  });

  async function applyAndFail(code: string, status: number): Promise<string> {
    render();
    dragSweep(1, 1, 1, 2);
    click(byId('batch-tier-PREMIUM'));
    click(byId('batch-apply'));
    expectLayoutPut().flush({ code }, { status, statusText: 'error' });
    await fixture.whenStable();
    fixture.detectChanges();
    return byId('batch-error').textContent ?? '';
  }

  it('explains a LAYOUT_IN_USE batch-apply refusal', async () => {
    expect(await applyAndFail('LAYOUT_IN_USE', 409)).toMatch(/locked/i);
  });

  it('explains a NO_SUCH_VENUE batch-apply refusal', async () => {
    expect(await applyAndFail('NO_SUCH_VENUE', 404)).toMatch(/could not be found/i);
  });

  it('falls back to a generic message for an unmapped batch-apply failure code', async () => {
    expect(await applyAndFail('SOMETHING_UNMAPPED', 500)).toMatch(/went wrong/i);
  });

  it('ends the session on a 401, same as every other write on this surface', async () => {
    render();
    const operator = fixture.debugElement.injector.get(OperatorAuth);
    const sessionLost = vi.spyOn(operator, 'sessionLost');
    dragSweep(1, 1, 1, 2);
    click(byId('batch-tier-PREMIUM'));
    click(byId('batch-apply'));

    expectLayoutPut().flush({ code: 'UNAUTHORIZED' }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(sessionLost).toHaveBeenCalled();
    expect(byId('batch-error').textContent).toMatch(/session has expired/i);
  });
});
