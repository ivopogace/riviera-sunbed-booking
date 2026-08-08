import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { todayBookingDate } from '../shared/booking-date';
import { SetView } from '../shared/venue-views';
import { ConsoleVenueMap } from './console-venue-map';
import { LayoutEditor } from './layout-editor';

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

    cells()[0].dispatchEvent(new MouseEvent('mousedown'));
    cells()[1].dispatchEvent(new MouseEvent('mouseenter'));
    cells()[2].dispatchEvent(new MouseEvent('mouseenter'));
    byId('layout-grid').dispatchEvent(new MouseEvent('mouseup'));
    fixture.detectChanges();

    expect(cells()[0].getAttribute('data-state')).toBe('gap');
    expect(cells()[1].getAttribute('data-state')).toBe('gap');
    expect(cells()[2].getAttribute('data-state')).toBe('gap');
    expect(cells()[3].getAttribute('data-state')).toBe('premium'); // not dragged over (row A = premium)
  });

  it('exposes an accessible per-cell label naming row, position and state', () => {
    render();
    generate('1', '2');
    expect(cells()[0].getAttribute('aria-label')).toBe('Row A position 1, front row, premium, online');
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
    const req = http.expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'));
    expect(req.request.body.sets).toHaveLength(1);
    expect(req.request.body.sets[0]).toMatchObject({
      rowLabel: 'A',
      positionNo: 1,
      tier: 'PREMIUM',
      pool: 'ONLINE',
      gridX: 1,
      gridY: 1,
    });
    expect(req.request.body.sets[0].price.minorUnits).toBe(3500);
    // The loaded optimistic-concurrency token rides the write body (0 for the fresh render mock).
    expect(req.request.body.expectedVersion).toBe(0);
    req.flush(null);
    await fixture.whenStable(); // onSave awaits the PUT — settle the notice
    fixture.detectChanges();
    expect(byId('layout-saved')).toBeTruthy();
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
    // AC-9: a stale-write conflict must not discard edits — it shows a banner and offers Reload.
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1)], 3); // loaded at set_version 3
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
    const first = http.expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'));
    expect(first.request.body.expectedVersion).toBe(5);
    first.flush(null);
    await fixture.whenStable();
    fixture.detectChanges();

    byId('layout-save').click();
    const second = http.expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'));
    expect(second.request.body.expectedVersion).toBe(6); // advanced, not the stale 5
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
  });

  it('seeds the grid from the venue’s existing layout, preserving the walk-in pool', () => {
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1), seat(2, 'STANDARD', 'WALK_IN', 2, 1)]);
    expect(cells()).toHaveLength(2);
    expect(cells()[0].getAttribute('data-state')).toBe('premium');
    expect(cells()[1].getAttribute('data-state')).toBe('walkin');
  });

  it('re-loads for the new venue when the parent param changes in place (#180)', () => {
    // The router reuses this tab instance on /operator/1/beach-map -> /operator/2/beach-map.
    render([seat(1, 'PREMIUM', 'ONLINE', 1, 1)], 7);
    expect(cells()).toHaveLength(1);

    params$.next(convertToParamMap({ venueId: '2' }));
    fixture.detectChanges();

    // Venue 1's draft grid must not carry over while venue 2 loads.
    expect(cells()).toHaveLength(0);
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/2'))
      .flush({ id: 2, name: 'W', sets: [seat(9, 'STANDARD', 'ONLINE', 1, 1)], setVersion: 3 });
    fixture.detectChanges();

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
    venue1Reads[0].flush({ id: 1, name: 'V', sets: [seat(1, 'PREMIUM', 'ONLINE', 1, 1)], setVersion: 7 });
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;

    expect(cells()).toHaveLength(0);
  });

  it('drops a superseded save’s outcome after a venue switch (#180)', async () => {
    // A save for venue 1 resolving after a switch must not stamp its advanced token onto venue 2's editor.
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
    byId('layout-save').click();
    const venue2Put = http.expectOne(
      (r) => r.method === 'PUT' && r.url.includes('/api/venues/2/beach-map'),
    );
    expect(venue2Put.request.body.expectedVersion).toBe(3);
    venue2Put.flush(null);
    await fixture.whenStable();
  });
});

function seat(
  id: number,
  tier: 'PREMIUM' | 'STANDARD',
  pool: 'ONLINE' | 'WALK_IN',
  gridX: number,
  gridY: number,
): SetView {
  return {
    id,
    rowLabel: 'A',
    positionNo: gridX,
    tier,
    pool,
    price: { minorUnits: 2000, currency: 'EUR' },
    gridX,
    gridY,
    availability: 'FREE',
  };
}
