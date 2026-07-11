import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { OperatorAuth } from '../core/operator-auth';
import { VenueProfileView } from './operator-console.model';
import { VenueTab } from './venue-tab';

/**
 * The O8 Venue & commodities tab (#177). Reads `:venueId` from the PARENT route (child routes don't
 * inherit it — the O1 finding), loads the owner profile, and seeds: the details form, the read-only
 * commission (as a %) + payout currency, the amenity toggle set, and the distance. Drives: the
 * widened owner-asserted save (commission + payout currency are NEVER in the body); the amenity
 * toggle reflected in the save; the required-name guard disabling save; the 403 / load-error copy;
 * and the photo placeholders referencing the deferred #142.
 */
describe('VenueTab (#177)', () => {
  let fixture: ComponentFixture<VenueTab>;
  let http: HttpTestingController;
  let host: HTMLElement;

  const PROFILE: VenueProfileView = {
    name: 'Miramar',
    beach: 'Ksamil',
    region: 'Riviera',
    description: 'lovely',
    bookingMode: 'INSTANT',
    bookingCutoff: '18:00',
    commissionBps: 1500,
    payoutCurrency: 'EUR',
    amenities: ['WIFI', 'BEACH_BAR'],
    distanceToWaterM: 20,
    version: 7, // a non-zero token so tests prove it's echoed from the load, not hardcoded
  };

  function configure(parentVenueId: Record<string, string> = { venueId: '1' }): void {
    TestBed.configureTestingModule({
      imports: [VenueTab],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({}) },
            parent: { snapshot: { paramMap: convertToParamMap(parentVenueId) } },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(VenueTab);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    // OperatorAuth restores the session on construction — settle it signed-out (the shell gates access).
    http
      .expectOne((r) => r.url.includes('/api/auth/me'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
  }

  function render(profile: VenueProfileView = PROFILE): void {
    configure();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/profile'))
      .flush(profile);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  }

  afterEach(() => http.verify());

  function byId(id: string): HTMLElement {
    return host.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
  }

  function setValue(testid: string, value: string): void {
    const el = byId(testid) as HTMLInputElement;
    el.value = value;
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  async function save(): Promise<void> {
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('loads the owner profile and seeds the form + read-only display fields', () => {
    render();

    expect((byId('venue-name') as HTMLInputElement).value).toBe('Miramar');
    expect((byId('venue-booking-mode') as HTMLSelectElement).value).toBe('INSTANT');
    expect((byId('venue-cutoff') as HTMLInputElement).value).toBe('18:00');
    expect((byId('venue-distance') as HTMLInputElement).value).toBe('20');
    // Read-only display: commission as a %, payout currency as-is.
    expect(byId('venue-commission').textContent).toContain('15%');
    expect(byId('venue-commission').tagName).toBe('OUTPUT'); // not an editable input
    expect(byId('venue-payout-currency').textContent).toContain('EUR');
    // Amenity toggles reflect the loaded set.
    expect(byId('amenity-toggle-WIFI').getAttribute('aria-pressed')).toBe('true');
    expect(byId('amenity-toggle-RESTAURANT').getAttribute('aria-pressed')).toBe('false');
  });

  it('saves the widened profile WITHOUT commission or payout currency', async () => {
    render();

    await save();

    const req = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/api/venues/1'));
    expect(req.request.body).toEqual({
      name: 'Miramar',
      beach: 'Ksamil',
      region: 'Riviera',
      description: 'lovely',
      bookingMode: 'INSTANT',
      bookingCutoff: '18:00',
      amenities: ['WIFI', 'BEACH_BAR'],
      distanceToWaterM: 20,
      expectedVersion: 7, // the loaded optimistic-concurrency token (#224)
    });
    // Read-only fields must not be on the wire.
    expect(req.request.body.commissionBps).toBeUndefined();
    expect(req.request.body.payoutCurrency).toBeUndefined();
    req.flush(null);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(byId('venue-saved')).toBeTruthy();
  });

  it('reflects an amenity toggle + a name edit in the saved body', async () => {
    render();

    byId('amenity-toggle-RESTAURANT').click(); // add
    byId('amenity-toggle-WIFI').click(); // remove
    fixture.detectChanges();
    setValue('venue-name', 'Miramar Renamed');

    await save();

    const req = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/api/venues/1'));
    expect(req.request.body.name).toBe('Miramar Renamed');
    expect(req.request.body.amenities).toContain('RESTAURANT');
    expect(req.request.body.amenities).toContain('BEACH_BAR');
    expect(req.request.body.amenities).not.toContain('WIFI');
    req.flush(null);
  });

  it('save sends the loaded expectedVersion token (#224)', async () => {
    render(); // loaded at version 7

    await save();

    const req = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/api/venues/1'));
    expect(req.request.body.expectedVersion).toBe(7);
    req.flush(null);
  });

  it('shows the stale-write banner and PRESERVES the operator’s edits on a 409 (#224)', async () => {
    render();

    setValue('venue-name', 'Edited Locally');
    await save();
    http
      .expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/api/venues/1'))
      .flush({ code: 'STALE_WRITE' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    // The dedicated conflict banner + Reload action is shown — not the generic error span.
    expect(byId('venue-stale-banner')).toBeTruthy();
    expect(byId('venue-stale-reload')).toBeTruthy();
    expect(host.querySelector('[data-testid="venue-error"]')).toBeNull();
    // The operator’s edit survives — never silently discarded.
    expect((byId('venue-name') as HTMLInputElement).value).toBe('Edited Locally');
  });

  it('reload re-seeds from the server, clears the banner, and sends the fresh version next save (#224)', async () => {
    render();

    setValue('venue-name', 'Edited Locally');
    await save();
    http
      .expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/api/venues/1'))
      .flush({ code: 'STALE_WRITE' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(byId('venue-stale-banner')).toBeTruthy();

    // Reload pulls the latest server profile (new name + bumped version) and clears the banner.
    byId('venue-stale-reload').click();
    const reloaded: VenueProfileView = { ...PROFILE, name: 'Server Name', version: 8 };
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/profile'))
      .flush(reloaded);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="venue-stale-banner"]')).toBeNull();
    expect((byId('venue-name') as HTMLInputElement).value).toBe('Server Name');

    // The next save now carries the reloaded version (8), never the stale 7.
    await save();
    const req = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/api/venues/1'));
    expect(req.request.body.expectedVersion).toBe(8);
    req.flush(null);
  });

  it('changing booking mode to REQUEST is sent (flips the tourist flow server-side)', async () => {
    render();

    const select = byId('venue-booking-mode') as HTMLSelectElement;
    select.value = 'REQUEST';
    select.dispatchEvent(new Event('input'));
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    await save();

    const req = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/api/venues/1'));
    expect(req.request.body.bookingMode).toBe('REQUEST');
    req.flush(null);
  });

  it('disables save and sends nothing when the required name is blank', async () => {
    render();

    setValue('venue-name', '');

    expect((byId('venue-save') as HTMLButtonElement).disabled).toBe(true);
    // A submit while invalid must not PATCH (Signal Forms blocks it; afterEach http.verify() asserts none).
    await save();
    http.expectNone((r) => r.method === 'PATCH');
  });

  it('shows the not-owner message on a 403 and keeps the form', async () => {
    render();

    await save();
    http
      .expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/api/venues/1'))
      .flush({ code: 'NOT_VENUE_OWNER' }, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byId('venue-error').textContent?.toLowerCase()).toContain('manage');
    expect(byId('venue-save')).toBeTruthy();
  });

  it('drops the lost session on a 401 save', async () => {
    render();
    const auth = TestBed.inject(OperatorAuth);
    const lost = vi.spyOn(auth, 'sessionLost');

    await save();
    http
      .expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/api/venues/1'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(lost).toHaveBeenCalled();
    expect(byId('venue-error').textContent?.toLowerCase()).toContain('session');
  });

  it('clears the Saved notice when a details field is edited after saving (no silent lost edit)', async () => {
    render();

    await save();
    http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/api/venues/1')).flush(null);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(byId('venue-saved')).toBeTruthy();

    // Editing any details field after the save must drop the stale confirmation.
    setValue('venue-name', 'Edited After Save');

    expect(host.querySelector('[data-testid="venue-saved"]')).toBeNull();
  });

  it('shows a field-level distance error (not the generic message) for a bad metres value and sends no PATCH', async () => {
    render();

    setValue('venue-distance', '4.5'); // not a whole number of metres
    await save();

    http.expectNone((r) => r.method === 'PATCH');
    expect(byId('venue-distance-error')).toBeTruthy();
    // The generic form-wide error must NOT fire — the operator sees exactly which field is wrong.
    expect(host.querySelector('[data-testid="venue-error"]')).toBeNull();

    // Re-typing a valid value clears the field error.
    setValue('venue-distance', '20');
    expect(host.querySelector('[data-testid="venue-distance-error"]')).toBeNull();
  });

  it('shows a load-error message (not a blank form) when the profile read fails', () => {
    configure();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/profile'))
      .flush({ code: 'INTERNAL' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;

    expect(byId('venue-load-error')).toBeTruthy();
    expect(host.querySelector('form')).toBeNull();
  });

  it('renders three photo placeholders referencing the deferred #142 and no upload control', () => {
    render();

    expect(host.querySelectorAll('[data-testid="photo-slot"]')).toHaveLength(3);
    expect(byId('photos-deferred').textContent).toContain('#142');
    expect(host.querySelector('input[type="file"]')).toBeNull();
  });

  it('shows an invalid-link state when the parent route has no venue id', () => {
    configure({});
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;

    expect(byId('venue-invalid')).toBeTruthy();
    // No profile read is attempted without a venue id (afterEach http.verify() asserts none).
    expect(host.querySelector('form')).toBeNull();
  });
});
