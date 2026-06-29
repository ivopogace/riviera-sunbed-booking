import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { OperatorAuth } from '../core/operator-auth';
import { operatorAuthInterceptor } from '../core/operator-auth.interceptor';
import { VenueMapView } from '../venue/venue.model';
import { VenueEditor } from './venue-editor';

function venueView(id: number, sets: VenueMapView['sets']): VenueMapView {
  return {
    id,
    name: 'Sunset Bar',
    beach: 'Ksamil',
    region: 'Riviera',
    description: 'on the shore',
    ratingTenths: 0,
    reviewsCount: 0,
    bookingMode: 'INSTANT',
    fromPrice: sets.length ? sets[0].price : null,
    sets,
  };
}

describe('VenueEditor', () => {
  let fixture: ComponentFixture<VenueEditor>;
  let httpMock: HttpTestingController;
  let auth: OperatorAuth;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VenueEditor],
      providers: [
        provideHttpClient(withInterceptors([operatorAuthInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(VenueEditor);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(OperatorAuth);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Set a Signal Forms field by the text of its label, then notify the form. */
  function setField(label: string, value: string): void {
    const field = Array.from(host().querySelectorAll('label.field')).find((l) =>
      l.querySelector('span')?.textContent?.trim().startsWith(label),
    );
    const control = field?.querySelector('input, select') as HTMLInputElement | HTMLSelectElement;
    control.value = value;
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function clickButton(text: string): void {
    const button = Array.from(host().querySelectorAll('button')).find((b) =>
      b.textContent?.trim().startsWith(text),
    );
    button!.click();
  }

  it('shows the operator sign-in until signed in', () => {
    expect(host().textContent).toContain('Operator sign-in');
    expect(host().textContent).not.toContain('Create venue');
  });

  it('creates a venue and rounds the layout trip through the read API', async () => {
    auth.signIn('operator', 'pw');
    fixture.detectChanges();

    setField('Name', 'Sunset Bar');
    setField('Beach', 'Ksamil');
    setField('Region', 'Riviera');
    fixture.detectChanges();

    clickButton('Create venue');
    await fixture.whenStable();

    const createReq = httpMock.expectOne(
      (r) => r.method === 'POST' && r.url === `${environment.apiBaseUrl}/api/venues`,
    );
    expect(createReq.request.body).toMatchObject({
      name: 'Sunset Bar',
      beach: 'Ksamil',
      region: 'Riviera',
      bookingMode: 'INSTANT',
      commissionBps: 1500,
      payoutCurrency: 'EUR',
      bookingCutoff: '18:00',
    });
    expect(createReq.request.headers.get('Authorization')).toBe(`Basic ${btoa('operator:pw')}`);
    createReq.flush({ id: 5 }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    // The editor re-reads the venue through the public U1 read API (the round-trip source).
    httpMock
      .expectOne((r) => r.method === 'GET' && r.url.includes(`/api/venues/5`))
      .flush(venueView(5, []));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host().textContent).toContain('Venue #5 created');

    // Add a set; tier/pool/currency keep their defaults (PREMIUM / ONLINE / EUR).
    setField('Row label', 'Front row');
    setField('Position number', '1');
    setField('Price (minor units)', '4500');
    setField('Grid column', '1');
    setField('Grid row', '1');
    fixture.detectChanges();

    clickButton('Add set');
    await fixture.whenStable();

    const addReq = httpMock.expectOne(
      (r) => r.method === 'POST' && r.url === `${environment.apiBaseUrl}/api/venues/5/sets`,
    );
    expect(addReq.request.body).toMatchObject({
      rowLabel: 'Front row',
      positionNo: 1,
      tier: 'PREMIUM',
      pool: 'ONLINE',
      price: { minorUnits: 4500, currency: 'EUR' },
      gridX: 1,
      gridY: 1,
    });
    addReq.flush({ id: 9 }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    const reloaded = venueView(5, [
      {
        id: 9,
        rowLabel: 'Front row',
        positionNo: 1,
        tier: 'PREMIUM',
        pool: 'ONLINE',
        price: { minorUnits: 4500, currency: 'EUR' },
        gridX: 1,
        gridY: 1,
        availability: 'FREE',
      },
    ]);
    httpMock.expectOne((r) => r.method === 'GET' && r.url.includes(`/api/venues/5`)).flush(reloaded);
    await fixture.whenStable();
    fixture.detectChanges();

    // The rendered layout is exactly what the read API returned (round-trip).
    expect(host().textContent).toContain('Front row');
    expect(host().textContent).toContain('position 1');
    expect(host().textContent).toContain('Layout (1)');
  });

  it('rejects a non-integer commission client-side without calling the server', async () => {
    auth.signIn('operator', 'pw');
    fixture.detectChanges();
    setField('Name', 'Sunset Bar');
    setField('Beach', 'Ksamil');
    setField('Region', 'Riviera');
    setField('Commission', '15.5'); // not clean digits → must not be truncated to 15 and sent
    fixture.detectChanges();

    clickButton('Create venue');
    await fixture.whenStable();

    httpMock.expectNone(`${environment.apiBaseUrl}/api/venues`);
    fixture.detectChanges();
    expect(host().querySelector('[role="alert"]')?.textContent).toContain('check the form values');
  });

  it('keeps a read-back failure distinct from a write error', async () => {
    auth.signIn('operator', 'pw');
    fixture.detectChanges();
    setField('Name', 'Sunset Bar');
    setField('Beach', 'Ksamil');
    setField('Region', 'Riviera');
    fixture.detectChanges();

    clickButton('Create venue');
    await fixture.whenStable();
    httpMock
      .expectOne((r) => r.method === 'POST' && r.url === `${environment.apiBaseUrl}/api/venues`)
      .flush({ id: 5 }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    // The write succeeded (venue 5 created), but the read-back fails.
    httpMock
      .expectOne((r) => r.method === 'GET' && r.url.includes(`/api/venues/5`))
      .error(new ProgressEvent('error'));
    await fixture.whenStable();
    fixture.detectChanges();

    // The operator is told the preview is stale (a status), NOT shown a write error inviting a retry.
    expect(host().textContent).toContain('Venue #5 created');
    expect(host().querySelector('[role="status"].form-notice')?.textContent).toContain(
      'couldn’t be refreshed',
    );
    expect(host().querySelector('.form-error')).toBeNull();
  });

  it('surfaces a 401 from the server as a sign-in error', async () => {
    auth.signIn('operator', 'wrong');
    fixture.detectChanges();
    setField('Name', 'Sunset Bar');
    setField('Beach', 'Ksamil');
    setField('Region', 'Riviera');
    fixture.detectChanges();

    clickButton('Create venue');
    await fixture.whenStable();
    httpMock
      .expectOne((r) => r.method === 'POST' && r.url === `${environment.apiBaseUrl}/api/venues`)
      .flush({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host().querySelector('[role="alert"]')?.textContent).toContain('operator sign-in');
  });
});
