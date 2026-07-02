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

  /** A venue (id 5) carrying a single ONLINE/WALK_IN set — the post-add read-back shape. */
  function oneSet(pool: 'ONLINE' | 'WALK_IN' = 'ONLINE'): VenueMapView {
    return venueView(5, [
      {
        id: 9,
        rowLabel: 'Front row',
        positionNo: 1,
        tier: 'PREMIUM',
        pool,
        price: { minorUnits: 4500, currency: 'EUR' },
        gridX: 1,
        gridY: 1,
        availability: 'FREE',
      },
    ]);
  }

  /** Sign in, create venue 5, and settle its first read-back so the layout step is showing. */
  async function createVenue(): Promise<void> {
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
    httpMock
      .expectOne((r) => r.method === 'GET' && r.url.includes(`/api/venues/5`))
      .flush(venueView(5, []));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Fill the add-set form with a valid front-row set and submit it. */
  function fillAndSubmitSet(price = '4500'): void {
    setField('Row label', 'Front row');
    setField('Position number', '1');
    setField('Price (minor units)', price);
    setField('Grid column', '1');
    setField('Grid row', '1');
    fixture.detectChanges();
    clickButton('Add set');
  }

  /** Add a set to venue 5 and settle the read-back so one row is laid out. */
  async function addSet(): Promise<void> {
    fillAndSubmitSet();
    await fixture.whenStable();
    httpMock
      .expectOne(
        (r) => r.method === 'POST' && r.url === `${environment.apiBaseUrl}/api/venues/5/sets`,
      )
      .flush({ id: 9 }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    httpMock
      .expectOne((r) => r.method === 'GET' && r.url.includes(`/api/venues/5`))
      .flush(oneSet());
    await fixture.whenStable();
    fixture.detectChanges();
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

    // The operator is told the preview is stale via the `<output>` status region (implicit
    // role="status"), NOT shown a write error inviting a retry.
    expect(host().textContent).toContain('Venue #5 created');
    expect(host().querySelector('output.form-notice')?.textContent).toContain(
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
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host().querySelector('[role="alert"]')?.textContent).toContain('operator sign-in');
  });

  it('signs the operator in and out through the form', () => {
    setField('Username', 'operator');
    setField('Password', 'pw');
    fixture.detectChanges();
    clickButton('Sign in');
    fixture.detectChanges();

    expect(auth.signedIn()).toBe(true);
    expect(host().textContent).toContain('Signed in as');
    expect(host().textContent).toContain('Create venue');

    clickButton('Sign out');
    fixture.detectChanges();
    expect(auth.signedIn()).toBe(false);
    expect(host().textContent).toContain('Operator sign-in');

    // Submitting with an empty password is a no-op (the guard short-circuits).
    clickButton('Sign in');
    fixture.detectChanges();
    expect(auth.signedIn()).toBe(false);
  });

  it('moves a set between the online and walk-in pools', async () => {
    await createVenue();
    await addSet();

    clickButton('Move to walk-in');
    await fixture.whenStable();
    const patch = httpMock.expectOne(
      (r) => r.method === 'PATCH' && r.url === `${environment.apiBaseUrl}/api/venues/5/sets/9`,
    );
    expect(patch.request.body).toMatchObject({ pool: 'WALK_IN', gridX: 1, gridY: 1 });
    patch.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    httpMock
      .expectOne((r) => r.method === 'GET' && r.url.includes(`/api/venues/5`))
      .flush(oneSet('WALK_IN'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host().textContent).toContain('walk-in pool');
    expect(host().textContent).toContain('Move to online');
  });

  it('removes a set from the layout', async () => {
    await createVenue();
    await addSet();

    clickButton('Remove');
    await fixture.whenStable();
    httpMock
      .expectOne(
        (r) => r.method === 'DELETE' && r.url === `${environment.apiBaseUrl}/api/venues/5/sets/9`,
      )
      .flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    httpMock
      .expectOne((r) => r.method === 'GET' && r.url.includes(`/api/venues/5`))
      .flush(venueView(5, []));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host().textContent).toContain('Layout (0)');
    expect(host().textContent).toContain('No sets yet');
  });

  it('surfaces a failed pool move as an error without losing the existing layout', async () => {
    await createVenue();
    await addSet();

    clickButton('Move to walk-in');
    await fixture.whenStable();
    httpMock
      .expectOne((r) => r.method === 'PATCH' && r.url === `${environment.apiBaseUrl}/api/venues/5/sets/9`)
      .flush({ status: 409, code: 'CELL_TAKEN' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host().querySelector('[role="alert"]')?.textContent).toContain('grid cell');
    // The write failed, so no read-back is issued and the original set stays rendered.
    expect(host().textContent).toContain('online pool');
  });

  it('rejects a non-integer set price client-side without calling the server', async () => {
    await createVenue();
    fillAndSubmitSet('45.5'); // not clean digits → must not be truncated and sent
    await fixture.whenStable();

    httpMock.expectNone(`${environment.apiBaseUrl}/api/venues/5/sets`);
    fixture.detectChanges();
    expect(host().querySelector('[role="alert"]')?.textContent).toContain('check the form values');
  });

  const addSetErrors: readonly (readonly [string, number, string])[] = [
    ['CELL_TAKEN', 409, 'already occupies that grid cell'],
    ['DUPLICATE_POSITION', 409, 'row label and position number'],
    ['NO_SUCH_VENUE', 404, 'venue no longer exists'],
    ['NO_SUCH_SET', 404, 'set no longer exists'],
    ['BOOM', 500, 'Something went wrong'], // unrecognized code → generic UNKNOWN message
  ];
  for (const [code, status, expected] of addSetErrors) {
    it(`maps an add-set ${code} failure to its operator message`, async () => {
      await createVenue();
      fillAndSubmitSet();
      await fixture.whenStable();
      httpMock
        .expectOne(
          (r) => r.method === 'POST' && r.url === `${environment.apiBaseUrl}/api/venues/5/sets`,
        )
        .flush({ status, code }, { status, statusText: code });
      await fixture.whenStable();
      fixture.detectChanges();

      expect(host().querySelector('[role="alert"]')?.textContent).toContain(expected);
    });
  }
});
