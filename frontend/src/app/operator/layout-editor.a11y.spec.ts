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

  function render(sets: unknown[] = []): void {
    configure();
    mapRequest().flush({ id: 1, name: 'V', sets, setVersion: 2 });
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
