import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { SetView } from '../shared/venue-views';
import { SetEditor } from './set-editor';

/**
 * Structural a11y audit for the per-set beach-map editor (#600). Every grid cell is a labelled
 * `<button>` naming its row, position and state, the tier/pool choices are `aria-pressed` toggles,
 * and the destructive confirm is an `alertdialog`. axe runs over the empty selection, the in-flight
 * skeleton, a selected set, the add panel, the armed move and the remove confirm. (Colour contrast is proven by
 * `set-editor.contrast.spec.ts` — axe can't measure it under jsdom.)
 */
describe('SetEditor a11y (#600)', () => {
  let fixture: ComponentFixture<SetEditor>;
  let http: HttpTestingController;

  const SETS: SetView[] = [
    {
      id: 10,
      rowLabel: 'A',
      positionNo: 1,
      tier: 'PREMIUM',
      pool: 'ONLINE',
      price: { minorUnits: 3500, currency: 'EUR' },
      gridX: 1,
      gridY: 1,
      availability: 'FREE',
    },
    {
      id: 11,
      rowLabel: 'B',
      positionNo: 1,
      tier: 'STANDARD',
      pool: 'WALK_IN',
      price: { minorUnits: 2000, currency: 'EUR' },
      gridX: 1,
      gridY: 2,
      availability: 'FREE',
    },
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
    fixture.componentRef.setInput('venueId', 1);
    fixture.componentRef.setInput('sets', sets);
    fixture.componentRef.setInput('loaded', loaded);
    fixture.componentRef.setInput('expectedVersion', expectedVersion);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url.includes('/api/auth/me'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function byId(id: string): HTMLElement {
    return host().querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  }

  function click(element: HTMLElement): void {
    element.click();
    fixture.detectChanges();
  }

  function firstSetCell(): HTMLButtonElement {
    return host().querySelector<HTMLButtonElement>('[data-testid="set-cell"][data-set-id]')!;
  }

  it('has no axe violations with nothing selected', async () => {
    render();
    await expectNoAxeViolations(host());
  });

  it('has no axe violations while the map read is in flight (#721)', async () => {
    render([], false);

    expect(byId('set-loading')).toBeTruthy();
    await expectNoAxeViolations(host());
  });

  it('has no axe violations with a set selected for editing', async () => {
    render();
    click(firstSetCell());
    await expectNoAxeViolations(host());
  });

  it('has no axe violations with the add panel open on a grown cell', async () => {
    render();
    click(byId('set-add-col'));
    click(host().querySelectorAll<HTMLButtonElement>('[data-testid="set-cell"]')[1]);

    expect(byId('set-add')).toBeTruthy();
    await expectNoAxeViolations(host());
  });

  it('has no axe violations while a move is armed', async () => {
    render();
    click(firstSetCell());
    click(byId('set-add-col'));
    click(byId('set-move'));

    expect(byId('set-move-armed')).toBeTruthy();
    await expectNoAxeViolations(host());
  });

  it('has no axe violations while the remove confirm is open', async () => {
    render();
    click(firstSetCell());
    click(byId('set-remove'));

    expect(byId('set-remove-confirm')).toBeTruthy();
    await expectNoAxeViolations(host());
  });

  it('has no axe violations with a batch selection open (#714)', async () => {
    render();
    const cells = host().querySelectorAll<HTMLButtonElement>('[data-testid="set-cell"]');
    cells[0].dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 1 }));
    cells[1].dispatchEvent(new MouseEvent('mouseenter', { buttons: 1 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    fixture.detectChanges();

    expect(byId('batch-panel')).toBeTruthy();
    await expectNoAxeViolations(host());
  });

  it('names every cell by row, position and state so the map is readable without sight', () => {
    render();
    const cells = Array.from(host().querySelectorAll<HTMLElement>('[data-testid="set-cell"]'));

    expect(cells[0].getAttribute('aria-label')).toBe(
      'Row A position 1, front row, premium, online',
    );
    expect(cells[1].getAttribute('aria-label')).toBe(
      'Row B position 1, walk-in pool, not bookable online',
    );
  });
});
