import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectCellsFillCanvasRow } from '../../testing/beach-map-height';
import { SetView } from '../shared/venue-views';
import { SetEditor } from './set-editor';

/**
 * The per-set beach-map editor (#600) — the surface that makes a live venue's map editable at all.
 * Drives select → change → save against the U7 `PATCH`, and pins the two properties the slice turns
 * on: the write carries the WHOLE set body, and a `409 SET_IN_USE` leaves the map exactly as the
 * server still has it (no optimistic flip survives a refusal).
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

  function render(sets: readonly SetView[] = SETS): void {
    TestBed.configureTestingModule({
      imports: [SetEditor],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(SetEditor);
    http = TestBed.inject(HttpTestingController);
    changed = 0;
    fixture.componentRef.setInput('venueId', 1);
    fixture.componentRef.setInput('sets', sets);
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

  function cellForSet(setId: number): HTMLButtonElement {
    return cells().find((c) => c.dataset['setId'] === String(setId))!;
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

    // The Remove button it was on is gone with the selection, so focus parks on the panel itself.
    expect(document.activeElement).toBe(byId('set-panel'));
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

  it('points a set-less venue at the bulk generator, and still adds into the one empty spot (#718)', () => {
    render([]);

    expect(byId('set-panel-empty')).toBeFalsy();
    expect(byId('set-panel-no-sets').textContent).toContain('Bulk layout');
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
});
