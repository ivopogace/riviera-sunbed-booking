import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

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
    set({ id: 10, rowLabel: 'A', positionNo: 1, tier: 'PREMIUM', gridX: 1, gridY: 1, price: { minorUnits: 3500, currency: 'EUR' } }),
    set({ id: 11, rowLabel: 'A', positionNo: 2, tier: 'PREMIUM', gridX: 2, gridY: 1, price: { minorUnits: 3500, currency: 'EUR' } }),
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
    return http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith(`/api/venues/1/sets/${setId}`));
  }

  it('renders one cell per grid position, saved sets carrying their id and state', () => {
    render();

    // A 2×2 extent from the four sets, plus the grow affordances — every position is a cell.
    expect(cells().length).toBeGreaterThanOrEqual(4);
    expect(cellForSet(10).getAttribute('data-state')).toBe('premium');
    expect(cellForSet(12).getAttribute('data-state')).toBe('standard');
    expect(cellForSet(13).getAttribute('data-state')).toBe('walkin');
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

    // The rendered cell still shows the SERVER's pool — nothing was applied optimistically — and no
    // re-read was asked for, because there is nothing new to read.
    expect(cellForSet(12).getAttribute('data-state')).toBe('standard');
    expect(changed).toBe(0);
    expect(byId('set-error').textContent).toMatch(/booked or held/i);
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
    expect((byId('set-pool-WALK_IN') as HTMLElement).getAttribute('aria-pressed')).toBe('true');

    // A re-read lands (another device moved set 12 back to the online pool) — the draft must follow the
    // server, never keep an edit the operator can no longer see the basis for.
    fixture.componentRef.setInput('sets', [...SETS.filter((s) => s.id !== 12), set({ id: 12, rowLabel: 'B', positionNo: 1, gridX: 1, gridY: 2 })]);
    fixture.detectChanges();

    expect((byId('set-pool-ONLINE') as HTMLElement).getAttribute('aria-pressed')).toBe('true');
  });

  it('drops the selection when the selected set is gone from a re-read', () => {
    render();
    selectSet(12);
    expect(byId('set-panel-empty')).toBeFalsy();

    fixture.componentRef.setInput('sets', SETS.filter((s) => s.id !== 12));
    fixture.detectChanges();

    expect(byId('set-panel-empty')).toBeTruthy();
  });
});
