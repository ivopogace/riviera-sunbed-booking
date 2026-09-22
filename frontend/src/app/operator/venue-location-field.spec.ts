import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { FakeMapEngine, FakeMapHandle } from '../shared/fake-map-engine';
import { FakeGeolocationGateway } from '../../testing/fake-geolocation';
import { GeolocationGateway } from '../shared/geolocation';
import { LngLat, MapEngine } from '../shared/map-engine';
import { RivieraMap } from '../shared/riviera-map';
import { VenueLocation } from '../shared/venue-views';
import { VenueLocationField } from './venue-location-field';

function host(fixture: ComponentFixture<VenueLocationField>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

function byTestId(fixture: ComponentFixture<VenueLocationField>, id: string): HTMLElement | null {
  return host(fixture).querySelector<HTMLElement>(`[data-testid="${id}"]`);
}

function mapHandle(fixture: ComponentFixture<VenueLocationField>): FakeMapHandle {
  const map = fixture.debugElement.query(By.directive(RivieraMap)).componentInstance as RivieraMap;
  return map.handle() as FakeMapHandle;
}

/**
 * The operator's pin placer against the fake map engine: what it feeds the map, what it does with
 * the map's answers, and what it tells the operator it has. Engine-agnostic by construction — it
 * only ever sees the seam.
 */
describe('VenueLocationField', () => {
  let geolocation: FakeGeolocationGateway;

  async function render(
    location: VenueLocation | null = null,
  ): Promise<ComponentFixture<VenueLocationField>> {
    geolocation = new FakeGeolocationGateway();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [VenueLocationField],
      providers: [
        { provide: MapEngine, useValue: new FakeMapEngine() },
        { provide: GeolocationGateway, useValue: geolocation },
      ],
    });
    const fixture = TestBed.createComponent(VenueLocationField);
    fixture.componentRef.setInput('location', location);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('starts with no pin and says so', async () => {
    const fixture = await render(null);

    expect(mapHandle(fixture).markers().size).toBe(0);
    expect(byTestId(fixture, 'venue-location-readout')?.textContent).toContain('No pin');
  });

  it('feeds an existing location to the map as one draggable pin', async () => {
    const fixture = await render({ latitude: 40.1468, longitude: 19.6482 });

    const markers = [...mapHandle(fixture).markers().values()];
    expect(markers).toHaveLength(1);
    expect(markers[0].lngLat).toEqual({ lng: 19.6482, lat: 40.1468 });
    expect(markers[0].draggable).toBe(true);
  });

  it('drops a pin where the map was clicked and reads the coordinates back', async () => {
    const fixture = await render(null);
    const surface = byTestId(fixture, 'riviera-map-fake')!;

    surface.dispatchEvent(new MouseEvent('click', { clientX: 0, clientY: 0, bubbles: true }));
    fixture.detectChanges();

    const dropped = fixture.componentInstance.location();
    expect(dropped).not.toBeNull();
    expect(mapHandle(fixture).markers().size).toBe(1);
    const readout = byTestId(fixture, 'venue-location-readout')?.textContent ?? '';
    expect(readout).toContain(dropped!.latitude.toFixed(6));
    expect(readout).toContain(dropped!.longitude.toFixed(6));
  });

  it('follows the pin when it is dragged', async () => {
    const fixture = await render({ latitude: 40.1468, longitude: 19.6482 });

    mapHandle(fixture).dragMarkerTo('venue-location-pin', { lng: 19.7, lat: 40.2 });
    fixture.detectChanges();

    expect(fixture.componentInstance.location()).toEqual({ latitude: 40.2, longitude: 19.7 });
  });

  it('clears the pin and tells the map to drop its marker', async () => {
    const fixture = await render({ latitude: 40.1468, longitude: 19.6482 });

    byTestId(fixture, 'venue-location-clear')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.location()).toBeNull();
    expect(mapHandle(fixture).markers().size).toBe(0);
    expect(byTestId(fixture, 'venue-location-readout')?.textContent).toContain('No pin');
  });

  it('rounds what it stores to the six decimals the server keeps', async () => {
    const fixture = await render(null);

    fixture.componentInstance.location.set({ latitude: 40.14681234, longitude: 19.64829876 });
    fixture.detectChanges();

    // A save echoes what the server stored, so the placer must not hold more precision than that.
    byTestId(fixture, 'riviera-map-fake')!.dispatchEvent(
      new MouseEvent('click', { clientX: 0, clientY: 0, bubbles: true }),
    );
    fixture.detectChanges();
    const { latitude, longitude } = fixture.componentInstance.location()!;
    expect(latitude).toBe(Number(latitude.toFixed(6)));
    expect(longitude).toBe(Number(longitude.toFixed(6)));
  });

  it('does not move the venue when the pin itself is tapped', async () => {
    const fixture = await render({ latitude: 40.1468, longitude: 19.6482 });
    const pin = byTestId(fixture, 'map-pin')!;

    // A tap on the marker is a grab, not a new position: it must not reach the map-click handler.
    pin.dispatchEvent(new MouseEvent('click', { clientX: 5, clientY: 5, bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.location()).toEqual({ latitude: 40.1468, longitude: 19.6482 });
  });

  it('places the pin at the map centre without a pointer', async () => {
    const fixture = await render(null);

    byTestId(fixture, 'venue-location-place')?.click();
    fixture.detectChanges();

    // The map's own controls choose the spot; this is the keyboard twin of a tap (WCAG 2.1.1).
    const centre = mapHandle(fixture).view().center;
    expect(fixture.componentInstance.location()).toEqual({
      latitude: Number(centre.lat.toFixed(6)),
      longitude: Number(centre.lng.toFixed(6)),
    });
  });

  it('moves an existing pin to the map centre rather than refusing', async () => {
    const fixture = await render({ latitude: 40.1468, longitude: 19.6482 });

    byTestId(fixture, 'venue-location-place')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.location()).not.toEqual({
      latitude: 40.1468,
      longitude: 19.6482,
    });
    expect(mapHandle(fixture).markers().size).toBe(1);
  });

  it('never disables the control it was pressed on, so focus is not stranded', async () => {
    const fixture = await render({ latitude: 40.1468, longitude: 19.6482 });
    const clear = byTestId(fixture, 'venue-location-clear')!;
    expect(clear.getAttribute('aria-disabled')).toBeNull();

    clear.click();
    fixture.detectChanges();

    // aria-disabled, never the disabled property: the pressed button keeps focus (WCAG 2.4.3).
    expect(clear.hasAttribute('disabled')).toBe(false);
    expect(clear.getAttribute('aria-disabled')).toBe('true');
    expect(fixture.componentInstance.location()).toBeNull();
  });

  it('does nothing when asked to place before the map has booted', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [VenueLocationField],
      providers: [
        { provide: MapEngine, useValue: new FakeMapEngine() },
        { provide: GeolocationGateway, useValue: new FakeGeolocationGateway() },
      ],
    });
    const fixture = TestBed.createComponent(VenueLocationField);
    fixture.componentRef.setInput('location', null);
    fixture.detectChanges(); // rendered, but the engine has not resolved yet

    byTestId(fixture, 'venue-location-place')?.click();

    expect(fixture.componentInstance.location()).toBeNull();
  });

  it('keeps the read-out announced but never editable', async () => {
    const fixture = await render({ latitude: 40.1468, longitude: 19.6482 });
    const readout = byTestId(fixture, 'venue-location-readout');

    expect(readout?.tagName).toBe('OUTPUT');
    expect(readout?.getAttribute('aria-live')).toBe('polite');
    expect(host(fixture).querySelectorAll('input')).toHaveLength(0);
  });

  /**
   * The operator standing on their own beach: the map's near-me control centres on them, and the
   * placer's keyboard twin then drops the pin on what the map is showing. Two controls that know
   * nothing about each other, composing through the camera.
   */
  it('places the pin where Near me centred the map', async () => {
    const fixture = await render(null);

    byTestId(fixture, 'map-near-me')?.click();
    geolocation.answerWith({ kind: 'located', at: { lng: 20.0053, lat: 39.8756 } });
    await fixture.whenStable();
    fixture.detectChanges();

    byTestId(fixture, 'venue-location-place')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.location()).toEqual({
      latitude: 39.8756,
      longitude: 20.0053,
    });
    expect(byTestId(fixture, 'venue-location-readout')?.textContent).toContain('39.875600');
  });

  it('leaves the venue pin alone when the you-are-here dot is tapped', async () => {
    const fixture = await render({ latitude: 40.1468, longitude: 19.6482 });

    byTestId(fixture, 'map-near-me')?.click();
    geolocation.answerWith({ kind: 'located', at: { lng: 20.0053, lat: 39.8756 } });
    await fixture.whenStable();
    fixture.detectChanges();

    // Without this the click below would be a no-op and the assertion a false green.
    expect(byTestId(fixture, 'map-here')).not.toBeNull();
    byTestId(fixture, 'map-here')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.location()).toEqual({
      latitude: 40.1468,
      longitude: 19.6482,
    });
  });
});

/**
 * The shoreline offer. The fake map draws a straight coast at {@link COAST_LNG} — water
 * west of it, land east — and jsdom lays nothing out, so the map's box runs east and south FROM
 * the camera's centre (19.75, 40.05 at zoom 8.6, about 552 px per degree of longitude). Every
 * position below is chosen against that geometry: the shore sits about 28 px into the box.
 */
describe('VenueLocationField shoreline offer', () => {
  const COAST_LNG = 19.8;
  /** Well inland: about 83 px into the box, some 55 px from the shore. */
  const INLAND = { lng: 19.9, lat: 40.04 };
  /** At sea, about 6 px into the box — west of the coast, still on the map. */
  const AT_SEA = { lng: 19.76, lat: 40.04 };
  /** On the sand within the shore band: about 30 px in, 3 px from the water. */
  const ON_THE_SHORE = { lng: 19.805, lat: 40.04 };

  let geolocation: FakeGeolocationGateway;

  async function renderOnACoast(
    location: VenueLocation | null = null,
    coastLng: number | null = COAST_LNG,
  ): Promise<ComponentFixture<VenueLocationField>> {
    geolocation = new FakeGeolocationGateway();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [VenueLocationField],
      providers: [
        { provide: MapEngine, useValue: new FakeMapEngine(coastLng ?? undefined) },
        { provide: GeolocationGateway, useValue: geolocation },
      ],
    });
    const fixture = TestBed.createComponent(VenueLocationField);
    fixture.componentRef.setInput('location', location);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function pick(fixture: ComponentFixture<VenueLocationField>, at: LngLat): void {
    const { x, y } = mapHandle(fixture).project(at);
    host(fixture)
      .querySelector<HTMLElement>('[data-testid="riviera-map-fake"]')!
      .dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
    fixture.detectChanges();
  }

  async function press(
    fixture: ComponentFixture<VenueLocationField>,
    testId: string,
  ): Promise<void> {
    byTestId(fixture, testId)!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function offer(fixture: ComponentFixture<VenueLocationField>): string {
    return byTestId(fixture, 'venue-location-proposal')?.textContent?.trim() ?? '';
  }

  it('offers the shoreline for a pin dropped inland, and stores it when accepted', async () => {
    const fixture = await renderOnACoast();

    pick(fixture, INLAND);

    // The operator's own point is stored first: the offer is an offer, not a redirection.
    expect(fixture.componentInstance.location()).toEqual({ latitude: 40.04, longitude: 19.9 });
    expect(offer(fixture)).toContain('inland');
    expect(offer(fixture)).toMatch(/\d+(\.\d)? ?(m|km)\b/);

    await press(fixture, 'venue-location-snap-accept');

    const stored = fixture.componentInstance.location()!;
    expect(stored.longitude).toBeGreaterThan(COAST_LNG);
    expect(stored.longitude).toBeLessThan(COAST_LNG + 0.02);
    expect(byTestId(fixture, 'venue-location-proposal')).toBeNull();
  });

  it('keeps the operator’s own point when the offer is declined, and never strands focus', async () => {
    const fixture = await renderOnACoast();

    pick(fixture, INLAND);
    await press(fixture, 'venue-location-snap-keep');

    expect(fixture.componentInstance.location()).toEqual({ latitude: 40.04, longitude: 19.9 });
    expect(byTestId(fixture, 'venue-location-proposal')).toBeNull();
    expect(document.activeElement).toBe(byTestId(fixture, 'venue-location-place'));
  });

  it('says nothing about a pin already on the shore', async () => {
    const fixture = await renderOnACoast();

    pick(fixture, ON_THE_SHORE);

    expect(byTestId(fixture, 'venue-location-proposal')).toBeNull();
  });

  it('takes a pin dropped at sea onto the land, and says which way it went', async () => {
    const fixture = await renderOnACoast();

    pick(fixture, AT_SEA);
    expect(offer(fixture)).toContain('out to sea');

    await press(fixture, 'venue-location-snap-accept');

    expect(fixture.componentInstance.location()!.longitude).toBeGreaterThan(COAST_LNG);
  });

  it('offers the shoreline for a dragged pin too, not only a tapped one', async () => {
    const fixture = await renderOnACoast({ latitude: 40.04, longitude: 19.805 });

    mapHandle(fixture).dragMarkerTo('venue-location-pin', INLAND);
    fixture.detectChanges();

    expect(offer(fixture)).toContain('inland');
  });

  it('offers nothing at all when the map draws no imagery it can read', async () => {
    const fixture = await renderOnACoast(null, null);

    pick(fixture, INLAND);

    expect(fixture.componentInstance.location()).toEqual({ latitude: 40.04, longitude: 19.9 });
    expect(byTestId(fixture, 'venue-location-proposal')).toBeNull();
  });

  it('drops an open offer when the pin it was about is cleared', async () => {
    const fixture = await renderOnACoast();

    pick(fixture, INLAND);
    expect(byTestId(fixture, 'venue-location-proposal')).not.toBeNull();

    await press(fixture, 'venue-location-clear');

    expect(fixture.componentInstance.location()).toBeNull();
    expect(byTestId(fixture, 'venue-location-proposal')).toBeNull();
  });

  /**
   * Neither control may be `disabled`: the one just pressed destroys the block it sits in, and a
   * disabled button cannot hold focus long enough to be moved off (WCAG 2.4.3). Both are real
   * buttons carrying the touch-target floor, so the offer has the keyboard twin every gesture in
   * this field has (WCAG 2.1.1).
   */
  /**
   * The rule RV-FE-10 exists for: a live region is announced for text that mutates while it is
   * already in the DOM, so a region that arrives holding its sentence reads as silence. Asserting
   * the text would pass either way, so this asserts the ELEMENT is the same one before and after.
   */
  it('speaks the offer through one region that was already there', async () => {
    const fixture = await renderOnACoast();
    const before = byTestId(fixture, 'venue-location-proposal-status');

    expect(before).not.toBeNull();
    expect(before?.textContent?.trim()).toBe('');

    pick(fixture, INLAND);

    expect(byTestId(fixture, 'venue-location-proposal-status')).toBe(before);
    expect(before?.textContent).toContain('inland');
  });

  it('offers two real buttons, at the floor and never disabled', async () => {
    const fixture = await renderOnACoast();

    pick(fixture, INLAND);

    for (const testId of ['venue-location-snap-accept', 'venue-location-snap-keep']) {
      const control = byTestId(fixture, testId)!;
      expect(control.tagName).toBe('BUTTON');
      expect(control.hasAttribute('disabled')).toBe(false);
      expect(control.hasAttribute('appTouchTarget')).toBe(true);
    }
  });
});
