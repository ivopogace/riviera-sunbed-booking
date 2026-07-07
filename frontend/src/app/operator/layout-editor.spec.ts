import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { SetView } from '../venue/venue.model';
import { LayoutEditor } from './layout-editor';

/**
 * The O3 layout editor (#172). Reads `:venueId` from the PARENT route (child routes don't inherit it)
 * and loads the venue map to seed its grid; the mock mirrors that. Drives generate, drag-paint, save
 * (asserting the one bulk PUT payload), and the LAYOUT_IN_USE lock message.
 */
describe('LayoutEditor (#172)', () => {
  let fixture: ComponentFixture<LayoutEditor>;
  let http: HttpTestingController;
  let host: HTMLElement;

  function render(initialSets: SetView[] = []): void {
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
            parent: { snapshot: { paramMap: convertToParamMap({ venueId: '1' }) } },
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
    // The constructor loads the current layout — flush it so the grid seeds (or stays empty).
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({ id: 1, name: 'V', sets: initialSets });
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
    req.flush(null);
    await fixture.whenStable(); // onSave awaits the PUT — settle the notice
    fixture.detectChanges();
    expect(byId('layout-saved')).toBeTruthy();
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
