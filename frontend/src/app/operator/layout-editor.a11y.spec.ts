import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { LayoutEditor } from './layout-editor';

/**
 * Structural a11y audit for the O3 layout editor (#172). The grid must be keyboard + AT operable
 * (an AC): every cell is a labelled `<button>`. axe runs over the empty state, the generated grid,
 * and a painted grid. (Colour contrast is proven by `layout-editor.contrast.spec.ts` — axe can't
 * measure it under jsdom.)
 */
describe('LayoutEditor a11y (#172)', () => {
  let fixture: ComponentFixture<LayoutEditor>;
  let http: HttpTestingController;

  function render(): void {
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
    http
      .expectOne((r) => r.url.includes('/api/auth/me'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1'))
      .flush({ id: 1, name: 'V', sets: [] });
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
