import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { expectNoAxeViolations } from '../../testing/axe';
import { VenueCreateCard } from './venue-create-card';

/**
 * Structural a11y audit for the create-venue card. Every field is a labelled control; the
 * card is a labelled region; field and submit errors are `role="alert"`s. axe runs over the idle
 * form and the failed-submit state. (Colour contrast is proven by
 * `venue-create-card.contrast.spec.ts` — axe can't measure it under jsdom.)
 */
describe('VenueCreateCard a11y (#278)', () => {
  let fixture: ComponentFixture<VenueCreateCard>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VenueCreateCard],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(VenueCreateCard);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http
      .expectOne((r) => r.url.includes('/api/auth/me'))
      .flush({ username: 'operator', principalType: 'OPERATOR' });
    http.expectOne((r) => r.url.includes('/api/venue-defaults')).flush({ commissionBps: 500 });
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('the idle create form has no axe violations', async () => {
    await expectNoAxeViolations(host());
  });

  it('the failed-submit state (server rejection alert) has no axe violations', async () => {
    for (const [testid, value] of [
      ['venue-create-name', 'Sunset Bar'],
      ['venue-create-beach', 'Ksamil'],
      ['venue-create-region', 'Riviera'],
    ]) {
      const input = host().querySelector<HTMLInputElement>(`[data-testid="${testid}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    fixture.detectChanges();
    host().querySelector<HTMLButtonElement>('[data-testid="venue-create-submit"]')!.click();
    await fixture.whenStable();
    http
      .expectOne((r) => r.method === 'POST' && r.url.includes('/api/venues'))
      .flush({ code: 'INVALID_REQUEST' }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host().querySelector('[data-testid="venue-create-error"]')).not.toBeNull();
    await expectNoAxeViolations(host());
  });
});
