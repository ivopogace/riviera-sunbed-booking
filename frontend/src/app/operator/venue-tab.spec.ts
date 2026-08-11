import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { OperatorAuth } from '../core/operator-auth';
import { VenueProfileView } from './operator-console.model';
import { VenueTab } from './venue-tab';

/**
 * The Venue & commodities tab. Reads `:venueId` from the PARENT route (child routes don't
 * inherit it), loads the owner profile, and seeds: the details form, the read-only
 * commission (as a %) + payout currency, the amenity toggle set, and the distance. Drives: the
 * widened owner-asserted save (commission + payout currency are NEVER in the body); the amenity
 * toggle reflected in the save; the required-name guard disabling save; the 403 / load-error copy;
 * and the real photo slots: seeding from the profile, multipart upload with the returned
 * preview, delete, server-side validation copy, and the 401 session drop.
 */
describe('VenueTab (#177)', () => {
  let fixture: ComponentFixture<VenueTab>;
  let params$: BehaviorSubject<ParamMap>;
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
    photos: {
      cover: { previewUrl: '/api/venues/1/photos/cc03' },
      sunbeds: { previewUrl: null },
      bar: { previewUrl: null },
    },
  };

  /** The service resolves photo paths against the API origin, so rendered src attrs carry it. */
  const API = 'http://localhost:8080';

  function configure(parentVenueId: Record<string, string> = { venueId: '1' }): void {
    params$ = new BehaviorSubject(convertToParamMap(parentVenueId));
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
            parent: { snapshot: { paramMap: params$.value }, paramMap: params$ },
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
      expectedVersion: 7, // the loaded optimistic-concurrency token
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

  it('a second consecutive save sends the bumped version without a reload (#224)', async () => {
    render(); // loaded at version 7

    await save();
    http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/api/venues/1')).flush(null);
    // Let the first submit fully settle: Signal Forms no-ops a submit() while one is still "in
    // progress", and its submitting() flag resets a promise-turn after the action — past whenStable().
    // A real operator saving twice has ample wall-clock time; the test just flushes a macrotask.
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();

    // Edit again and save; the tab must now send 8 (the write bumped the row), not the stale 7 —
    // the same operator saving twice in a row must not spuriously 409.
    setValue('venue-name', 'Second Edit');
    await save();
    const req = http.expectOne((r) => r.method === 'PATCH' && r.url.endsWith('/api/venues/1'));
    expect(req.request.body.expectedVersion).toBe(8);
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

  // ---- Photo slots: pick = upload = replace; server-validated; per-slot state ----

  /** Simulate the operator picking `file` in a slot's (hidden) file input — jsdom has no picker. */
  function pickFile(slot: string, file: File): void {
    const input = byId(`photo-input-${slot}`) as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  const JPEG = () => new File(['jpeg-bytes'], 'beach.jpg', { type: 'image/jpeg' });

  it('seeds the slots from the profile: occupied cover shows preview + Replace/Remove, empty slots offer Add photo', () => {
    render();

    const preview = byId('photo-preview-cover') as HTMLImageElement;
    expect(preview.getAttribute('src')).toBe(`${API}/api/venues/1/photos/cc03`);
    expect(preview.alt).not.toBe(''); // the preview image is named for AT
    expect(byId('photo-pick-cover').textContent).toContain('Replace');
    expect(byId('photo-remove-cover')).toBeTruthy();

    expect(host.querySelector('[data-testid="photo-preview-sunbeds"]')).toBeNull();
    expect(byId('photo-pick-sunbeds').textContent).toContain('Add photo');
    expect(host.querySelector('[data-testid="photo-remove-sunbeds"]')).toBeNull();
  });

  it('uploads a picked file as one multipart "file" part and shows the returned preview', async () => {
    render();

    pickFile('sunbeds', JPEG());
    await fixture.whenStable();

    const req = http.expectOne(
      (r) => r.method === 'POST' && r.url.endsWith('/api/venues/1/photos/sunbeds'),
    );
    expect(req.request.body).toBeInstanceOf(FormData);
    expect((req.request.body as FormData).get('file')).toBeInstanceOf(File);
    req.flush({
      slot: 'sunbeds',
      variants: [{ surface: 'preview', url: '/api/venues/1/photos/dd04', width: 480, height: 360 }],
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect((byId('photo-preview-sunbeds') as HTMLImageElement).getAttribute('src')).toBe(
      `${API}/api/venues/1/photos/dd04`,
    );
    expect(byId('photo-pick-sunbeds').textContent).toContain('Replace');
  });

  it('Remove DELETEs the slot and clears the preview back to Add photo', async () => {
    render();

    byId('photo-remove-cover').click();
    await fixture.whenStable();

    http
      .expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/api/venues/1/photos/cover'))
      .flush(null);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="photo-preview-cover"]')).toBeNull();
    expect(byId('photo-pick-cover').textContent).toContain('Add photo');
  });

  it('shows slot-level copy for a server-side validation rejection and keeps the old preview', async () => {
    render();

    pickFile('cover', JPEG());
    await fixture.whenStable();
    http
      .expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/venues/1/photos/cover'))
      .flush({ code: 'UNSUPPORTED_FORMAT' }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byId('photo-error-cover').textContent).toContain('JPEG, PNG, or WebP');
    // The rejected upload never touches the existing photo — the old preview survives.
    expect((byId('photo-preview-cover') as HTMLImageElement).getAttribute('src')).toBe(
      `${API}/api/venues/1/photos/cc03`,
    );
  });

  it('drops the lost session on a 401 photo upload', async () => {
    render();
    const auth = TestBed.inject(OperatorAuth);
    const lost = vi.spyOn(auth, 'sessionLost');

    pickFile('bar', JPEG());
    await fixture.whenStable();
    http
      .expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/venues/1/photos/bar'))
      .flush({ code: 'UNAUTHENTICATED' }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(lost).toHaveBeenCalled();
    expect(byId('photo-error-bar').textContent?.toLowerCase()).toContain('session');
  });

  it('shows an invalid-link state when the parent route has no venue id', () => {
    configure({});
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;

    expect(byId('venue-invalid')).toBeTruthy();
    // No profile read is attempted without a venue id (afterEach http.verify() asserts none).
    expect(host.querySelector('form')).toBeNull();
  });

  it('re-loads for the new venue when the parent param changes in place (#180)', () => {
    render();
    expect((byId('venue-name') as HTMLInputElement).value).toBe('Miramar');

    params$.next(convertToParamMap({ venueId: '2' }));
    fixture.detectChanges();

    // Venue 1's details (and its version token) must not stay in the form while venue 2 loads.
    expect(host.querySelector('form')).toBeNull();
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/2/profile'))
      .flush({ ...PROFILE, name: 'Second Venue', version: 9 });
    fixture.detectChanges();

    expect((byId('venue-name') as HTMLInputElement).value).toBe('Second Venue');
  });

  it('ignores the old venue’s late profile response after a venue switch (#180)', () => {
    configure();
    params$.next(convertToParamMap({ venueId: '2' }));
    fixture.detectChanges();

    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/2/profile'))
      .flush({ ...PROFILE, name: 'Second Venue', version: 9 });
    // The superseded venue-1 response resolves late — it must not re-seed venue 2's form.
    http
      .expectOne((r) => r.method === 'GET' && r.url.includes('/api/venues/1/profile'))
      .flush(PROFILE);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;

    expect((byId('venue-name') as HTMLInputElement).value).toBe('Second Venue');
  });
});
