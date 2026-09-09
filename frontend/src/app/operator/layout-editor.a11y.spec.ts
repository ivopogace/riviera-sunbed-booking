import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { expectNoAxeViolations } from '../../testing/axe';
import { LayoutEditor } from './layout-editor';
import { FULL_PREVIEW } from './remodel-preview-panel.spec';

/**
 * Structural a11y audit for the layout editor. The grid must be keyboard + AT operable
 * (an AC): every cell is a labelled `<button>`. axe runs over the bulk empty state, the generated
 * grid, a painted grid, Edit-sets mode on a venue with no sets, and the failed-read state on both
 * surfaces. (Colour contrast is proven by `layout-editor.contrast.spec.ts` — axe can't
 * measure it under jsdom.)
 */
describe('LayoutEditor a11y (#172)', () => {
  let fixture: ComponentFixture<LayoutEditor>;
  let http: HttpTestingController;

  function configure(): void {
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
            parent: {
              snapshot: { paramMap: convertToParamMap({ venueId: '1' }) },
              paramMap: of(convertToParamMap({ venueId: '1' })),
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(LayoutEditor);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url.includes('/api/auth/me'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
  }

  function mapRequest(): TestRequest {
    return http.expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'));
  }

  function render(sets: unknown[] = [], locks: unknown[] = []): void {
    configure();
    mapRequest().flush({ map: { id: 1, name: 'V', sets, setVersion: 2 }, locks });
    fixture.detectChanges();
  }

  /** The initial map read FAILS, so the tab has no map to offer on either surface. */
  function renderWithFailedLoad(): void {
    configure();
    mapRequest().flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function byId(id: string): HTMLElement {
    return host().querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  }

  function setInput(id: string, value: string): void {
    const input = byId(id) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('has no axe violations in the empty state', async () => {
    render();
    await expectNoAxeViolations(host());
  });

  it('has no axe violations while the read is in flight — the skeleton hides no tab stop (#744)', async () => {
    configure();

    expect(byId('layout-loading')).toBeTruthy();
    await expectNoAxeViolations(host());

    mapRequest().flush({ map: { id: 1, name: 'V', sets: [], setVersion: 0 }, locks: [] });
    fixture.detectChanges();
  });

  it('has no axe violations with the per-row rename control present (#726)', async () => {
    // With a Save-name button per stored row, each row's input must stay its own labelled control.
    render([
      {
        id: 1,
        rowLabel: 'A',
        positionNo: 1,
        tier: 'PREMIUM',
        pool: 'ONLINE',
        price: { minorUnits: 2000, currency: 'EUR' },
        gridX: 1,
        gridY: 1,
        available: true,
      },
    ]);
    byId('layout-tool-premium').click();
    fixture.detectChanges();

    expect(byId('layout-row-name-save')).toBeTruthy();
    await expectNoAxeViolations(host());
  });

  it('has no axe violations in Edit-sets mode with no sets (#718)', async () => {
    render();
    byId('layout-tool-select').click();
    fixture.detectChanges();

    await expectNoAxeViolations(host());
  });

  it('has no axe violations when the initial map read failed (#721)', async () => {
    renderWithFailedLoad();

    expect(byId('layout-load-failed')).toBeTruthy();
    await expectNoAxeViolations(host());

    byId('layout-tool-select').click();
    fixture.detectChanges();

    await expectNoAxeViolations(host());
  });

  it('describes a locked cell on its button — name unchanged, the reason as the description — and stays axe-clean (#1031)', async () => {
    const set = {
      id: 7,
      rowLabel: 'A',
      positionNo: 1,
      tier: 'STANDARD',
      pool: 'ONLINE',
      price: { minorUnits: 2000, currency: 'EUR' },
      gridX: 1,
      gridY: 1,
      availability: 'FREE',
    };
    render([set], [{ setId: 7, bookedOn: '2026-09-12', heldOn: '2026-09-12' }]);
    byId('layout-tool-premium').click();
    fixture.detectChanges();

    const cell = byId('layout-cell');
    expect(cell.getAttribute('aria-label')).toBe('Row A position 1, standard, online');
    const description = host().querySelector(`#${cell.getAttribute('aria-describedby')}`);
    expect(description?.textContent?.trim()).toBe(
      'Locked — booked Sat 12 Sept 2026. Can’t be moved or removed; tier and pool can still change.',
    );
    expect(cell.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    await expectNoAxeViolations(host());

    // The status region exists before the refusal (a region born with its text announces nothing).
    expect(byId('layout-lock-notice').tagName).toBe('OUTPUT');
    expect(byId('layout-lock-notice').textContent?.trim()).toBe('');
    byId('layout-tool-gap').click();
    fixture.detectChanges();
    cell.click();
    fixture.detectChanges();
    expect(byId('layout-lock-notice').textContent).toContain('booked Sat 12 Sept 2026');
    await expectNoAxeViolations(host());
  });

  it('describes a refused set’s cell and lists it in the alert, and stays axe-clean (#1032)', async () => {
    const seat = (id: number, gridX: number) => ({
      id,
      rowLabel: 'A',
      positionNo: gridX,
      tier: 'STANDARD',
      pool: 'ONLINE',
      price: { minorUnits: 2000, currency: 'EUR' },
      gridX,
      gridY: 1,
      availability: 'FREE',
    });
    render([seat(1, 1), seat(2, 2)]);
    byId('layout-tool-gap').click();
    fixture.detectChanges();
    const cells = host().querySelectorAll<HTMLButtonElement>('[data-testid="layout-cell"]');
    cells[1].click();
    fixture.detectChanges();
    byId('layout-save').click();
    http
      .expectOne((r) => r.method === 'POST' && r.url.includes('/api/venues/1/beach-map/preview'))
      .flush({ moves: [], refunds: [], releases: [], staffHolds: [], blocks: [], keep: [] });
    await fixture.whenStable();
    http
      .expectOne((r) => r.method === 'PUT' && r.url.includes('/api/venues/1/beach-map'))
      .flush(
        {
          code: 'SETS_IN_USE',
          detail: 'x',
          sets: [{ setId: 2, rowLabel: 'A', positionNo: 2, bookedOn: null, heldOn: '2026-09-12' }],
        },
        { status: 409, statusText: 'Conflict' },
      );
    await fixture.whenStable();
    fixture.detectChanges();

    const refused = cells[1];
    expect(refused.getAttribute('aria-label')).toBe('Row A position 2, gap or aisle');
    const description = host().querySelector(`#${refused.getAttribute('aria-describedby')}`);
    expect(description?.textContent?.trim()).toBe(
      'Locked — held by staff Sat 12 Sept 2026. Can’t be moved or removed; tier and pool can still change.',
    );
    expect(refused.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(byId('layout-error').getAttribute('role')).toBe('alert');
    expect(byId('layout-error').textContent).toContain(
      'Row A · position 2 (held by staff Sat 12 Sept 2026)',
    );
    await expectNoAxeViolations(host());
  });

  it('has no axe violations with the remodel preview open over the save bar (#1033)', async () => {
    const seat = (id: number, gridX: number) => ({
      id,
      rowLabel: 'A',
      positionNo: gridX,
      tier: 'STANDARD',
      pool: 'ONLINE',
      price: { minorUnits: 2000, currency: 'EUR' },
      gridX,
      gridY: 1,
      availability: 'FREE',
    });
    render([seat(1, 1), seat(2, 2)]);
    byId('layout-tool-gap').click();
    fixture.detectChanges();
    host().querySelectorAll<HTMLButtonElement>('[data-testid="layout-cell"]')[1].click();
    fixture.detectChanges();
    byId('layout-save').click();
    http
      .expectOne((r) => r.method === 'POST' && r.url.includes('/api/venues/1/beach-map/preview'))
      .flush(FULL_PREVIEW);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byId('layout-remodel-preview').getAttribute('role')).toBe('alertdialog');
    expect(byId('layout-save').getAttribute('aria-disabled')).toBe('true');
    await expectNoAxeViolations(host());
  });
  it('has no axe violations with a generated + painted grid', async () => {
    render();
    setInput('layout-gen-rows', '3');
    setInput('layout-gen-cols', '4');
    byId('layout-generate').click();
    fixture.detectChanges();

    // Paint one cell walk-in so the painted state (labels + swatches) is audited too.
    byId('layout-tool-walkin').click();
    fixture.detectChanges();
    host().querySelector<HTMLButtonElement>('[data-testid="layout-cell"]')!.click();
    fixture.detectChanges();

    await expectNoAxeViolations(host());
  });

  it('has no axe violations while the regenerate confirm is open', async () => {
    render();
    setInput('layout-gen-rows', '2');
    setInput('layout-gen-cols', '2');
    byId('layout-generate').click();
    fixture.detectChanges();
    byId('layout-generate').click(); // second click opens the confirm dialog
    fixture.detectChanges();

    await expectNoAxeViolations(host());
  });
});
