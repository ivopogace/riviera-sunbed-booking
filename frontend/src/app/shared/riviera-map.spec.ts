import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FakeGeolocationGateway } from '../../testing/fake-geolocation';
import { FakeMapEngine, FakeMapHandle } from './fake-map-engine';
import { GeolocationGateway, GeolocationOutcome } from './geolocation';
import { LngLat, MapEngine, MapEngineOptions, MapHandle } from './map-engine';
import { HERE_MARKER, NEAR_ME_ZOOM, RIVIERA_MAP_OPTIONS, RivieraMap } from './riviera-map';

/** An engine no browser can satisfy — what a WebGL-less tourist gets. */
class NoWebGlEngine extends MapEngine {
  override create(): Promise<MapHandle> {
    return Promise.reject(new Error('Failed to initialize WebGL'));
  }
}

/**
 * The riviera map component against the fake engine: what it asks the engine for, what its
 * chrome does, and how it degrades. Everything MapLibre-specific stays behind the seam — this
 * spec would pass unchanged against any other renderer.
 */
describe('RivieraMap', () => {
  let fake: FakeMapEngine;
  let geolocation: FakeGeolocationGateway;

  /** First render only: the engine has not been asked yet, so the map is still booting. */
  function mount(
    engine: MapEngine,
    gateway: GeolocationGateway = geolocation,
  ): ComponentFixture<RivieraMap> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [RivieraMap],
      providers: [
        { provide: MapEngine, useValue: engine },
        { provide: GeolocationGateway, useValue: gateway },
      ],
    });
    const fixture = TestBed.createComponent(RivieraMap);
    fixture.detectChanges();
    return fixture;
  }

  async function render(
    engine: MapEngine = new FakeMapEngine(),
    gateway: GeolocationGateway = geolocation,
  ): Promise<ComponentFixture<RivieraMap>> {
    const fixture = mount(engine, gateway);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function host(fixture: ComponentFixture<RivieraMap>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function byTestId(fixture: ComponentFixture<RivieraMap>, id: string): HTMLElement | null {
    return host(fixture).querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }

  /**
   * The credit the tiles' licences require (OpenMapTiles' CC-BY design licence, OSM's ODbL), in the
   * order and with the links the OpenMapTiles licence gives as its example.
   */
  function expectCredit(attribution: HTMLElement | null): void {
    expect(attribution?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      '© OpenMapTiles © OpenStreetMap contributors',
    );
    const links = [...(attribution?.querySelectorAll('a') ?? [])];
    expect(links.map((a) => [a.textContent?.trim(), a.getAttribute('href')])).toEqual([
      ['OpenMapTiles', 'https://openmaptiles.org/'],
      ['OpenStreetMap', 'https://www.openstreetmap.org/copyright'],
    ]);
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
      expect(link.hasAttribute('data-touch-exempt')).toBe(true);
    }
  }

  beforeEach(() => {
    fake = new FakeMapEngine();
    geolocation = new FakeGeolocationGateway();
  });

  it('boots the engine on its canvas host with the riviera view and reports ready once loaded', async () => {
    const fixture = await render(fake);

    expect(fake.created.length).toBe(1);
    const [{ host: canvas, options }] = fake.created;
    expect(canvas).toBe(byTestId(fixture, 'riviera-map-canvas'));
    expect(options).toBe(RIVIERA_MAP_OPTIONS);
    expect(host(fixture).dataset['status']).toBe('ready');
  });

  it('asks for a same-origin style and a view that covers the riviera', () => {
    const options: MapEngineOptions = RIVIERA_MAP_OPTIONS;
    expect(options.styleUrl).toBe('/map/style.json');
    const [southWest, northEast] = options.maxBounds;
    expect(southWest.lng).toBeLessThan(options.view.center.lng);
    expect(northEast.lng).toBeGreaterThan(options.view.center.lng);
    expect(southWest.lat).toBeLessThan(options.view.center.lat);
    expect(northEast.lat).toBeGreaterThan(options.view.center.lat);
    expect(options.minZoom).toBeLessThanOrEqual(options.view.zoom);
    expect(options.maxZoom).toBeGreaterThan(options.view.zoom);
  });

  it('fences the whole of Albania, not just the coast', () => {
    const [southWest, northEast] = RIVIERA_MAP_OPTIONS.maxBounds;
    // Albania's extreme points: Sazan (west), Vërnik (east), Konispol (south), Vërmosh (north).
    expect(southWest.lng).toBeLessThanOrEqual(19.27);
    expect(northEast.lng).toBeGreaterThanOrEqual(21.07);
    expect(southWest.lat).toBeLessThanOrEqual(39.64);
    expect(northEast.lat).toBeGreaterThanOrEqual(42.66);
  });

  it('zooms through the labelled controls', async () => {
    const fixture = await render(fake);
    const zoomIn = byTestId(fixture, 'map-zoom-in') as HTMLButtonElement;
    const zoomOut = byTestId(fixture, 'map-zoom-out') as HTMLButtonElement;
    expect(zoomIn.getAttribute('aria-label')).toBe('Zoom in');
    expect(zoomOut.getAttribute('aria-label')).toBe('Zoom out');

    zoomIn.click();
    zoomIn.click();
    zoomOut.click();
    fixture.detectChanges();

    const handle = fixture.componentInstance.handle() as FakeMapHandle;
    expect(handle.view().zoom).toBe(RIVIERA_MAP_OPTIONS.view.zoom + 1);
  });

  it('always credits OpenMapTiles and OpenStreetMap, each as a link to its licence page', async () => {
    const booting = mount(new FakeMapEngine());
    expect(host(booting).dataset['status']).toBe('booting');
    expectCredit(byTestId(booting, 'map-attribution'));
    booting.destroy();

    const ready = await render(fake);
    expect(host(ready).dataset['status']).toBe('ready');
    expectCredit(byTestId(ready, 'map-attribution'));
  });

  it('destroys the engine handle with the component', async () => {
    const fixture = await render(fake);
    const handle = fixture.componentInstance.handle() as FakeMapHandle;
    expect(handle.destroyed()).toBe(false);

    fixture.destroy();

    expect(handle.destroyed()).toBe(true);
  });

  it('tells a WebGL-less browser the list has every venue, and offers no zoom', async () => {
    const fixture = await render(new NoWebGlEngine());

    expect(host(fixture).dataset['status']).toBe('unavailable');
    expect(byTestId(fixture, 'map-unavailable')?.textContent).toContain('list');
    expect(byTestId(fixture, 'map-zoom-in')).toBeNull();
    expectCredit(byTestId(fixture, 'map-attribution'));
  });

  it('lets a keyboard user skip past the map', async () => {
    const fixture = await render(fake);
    document.body.appendChild(host(fixture));
    try {
      const skip = byTestId(fixture, 'map-skip') as HTMLButtonElement;
      expect(skip.textContent).toContain('Skip map');

      skip.click();

      expect(document.activeElement).toBe(byTestId(fixture, 'map-end'));
    } finally {
      host(fixture).remove();
    }
  });

  describe('the pin', () => {
    /** Render with inputs set before the first change detection, as a call site binds them. */
    async function renderPinned(
      inputs: Record<string, unknown>,
      engine: FakeMapEngine = new FakeMapEngine(),
    ): Promise<ComponentFixture<RivieraMap>> {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [RivieraMap],
        providers: [
          { provide: MapEngine, useValue: engine },
          { provide: GeolocationGateway, useValue: new FakeGeolocationGateway(false) },
        ],
      });
      const fixture = TestBed.createComponent(RivieraMap);
      Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture;
    }

    function handleOf(fixture: ComponentFixture<RivieraMap>): FakeMapHandle {
      return fixture.componentInstance.handle() as FakeMapHandle;
    }

    it('feeds no marker when there is no pin', async () => {
      const fixture = await renderPinned({ pin: null });
      expect(handleOf(fixture).markers().size).toBe(0);
    });

    it('feeds one labelled, draggable marker for the pin', async () => {
      const fixture = await renderPinned({
        pin: { lng: 19.6482, lat: 40.1468 },
        pinDraggable: true,
        pinLabel: 'Venue location',
      });

      const markers = [...handleOf(fixture).markers().values()];
      expect(markers).toHaveLength(1);
      expect(markers[0].lngLat).toEqual({ lng: 19.6482, lat: 40.1468 });
      expect(markers[0].draggable).toBe(true);
      expect(markers[0].element.getAttribute('aria-label')).toBe('Venue location');
      // Not a control: it is dragged with a pointer, and the keyboard path lives in the consumer.
      expect(markers[0].element.tagName).toBe('DIV');
      expect(markers[0].element.getAttribute('role')).toBe('img');
    });

    it('moves the marker in place when the pin changes, keeping its element', async () => {
      const fixture = await renderPinned({
        pin: { lng: 19.6482, lat: 40.1468 },
        pinDraggable: true,
      });
      const before = [...handleOf(fixture).markers().values()][0].element;

      fixture.componentRef.setInput('pin', { lng: 19.7, lat: 40.2 });
      fixture.detectChanges();

      const markers = [...handleOf(fixture).markers().values()];
      expect(markers).toHaveLength(1);
      expect(markers[0].lngLat).toEqual({ lng: 19.7, lat: 40.2 });
      expect(markers[0].element).toBe(before);
    });

    it('re-registers the marker when pinDraggable flips, so the engine sees it', async () => {
      const fixture = await renderPinned({
        pin: { lng: 19.6482, lat: 40.1468 },
        pinDraggable: false,
      });
      expect([...handleOf(fixture).markers().values()][0].draggable).toBe(false);

      fixture.componentRef.setInput('pinDraggable', true);
      fixture.detectChanges();

      // An engine binds draggability at add time, so moving alone would leave it stale.
      const markers = [...handleOf(fixture).markers().values()];
      expect(markers).toHaveLength(1);
      expect(markers[0].draggable).toBe(true);
    });

    it('removes the marker when the pin is cleared', async () => {
      const fixture = await renderPinned({ pin: { lng: 19.6482, lat: 40.1468 } });

      fixture.componentRef.setInput('pin', null);
      fixture.detectChanges();

      expect(handleOf(fixture).markers().size).toBe(0);
    });

    it('emits mapClick with the clicked position', async () => {
      const fixture = await renderPinned({ pin: null });
      const clicks: LngLat[] = [];
      fixture.componentInstance.mapClick.subscribe((at) => clicks.push(at));

      const surface = host(fixture).querySelector<HTMLElement>('[data-testid="riviera-map-fake"]')!;
      surface.dispatchEvent(new MouseEvent('click', { clientX: 4, clientY: 4, bubbles: true }));

      expect(clicks).toHaveLength(1);
    });

    it('emits pinMoved when the marker is dragged', async () => {
      const fixture = await renderPinned({
        pin: { lng: 19.6482, lat: 40.1468 },
        pinDraggable: true,
      });
      const moves: LngLat[] = [];
      fixture.componentInstance.pinMoved.subscribe((at) => moves.push(at));

      handleOf(fixture).dragMarkerTo('venue-location-pin', { lng: 19.7, lat: 40.2 });

      expect(moves).toEqual([{ lng: 19.7, lat: 40.2 }]);
    });

    it('takes a caller camera over the riviera default', async () => {
      const engine = new FakeMapEngine();
      const custom: MapEngineOptions = { ...RIVIERA_MAP_OPTIONS, minZoom: 9 };
      await renderPinned({ options: custom }, engine);

      expect(engine.created[0].options).toBe(custom);
    });
  });
});

/**
 * The near-me control: the visitor's own position, asked for through the geolocation seam and
 * consumed here and nowhere else. Every outcome the browser can give is driven through the fake
 * gateway, so none of it needs a real prompt — what a granted position must NOT do (reach a
 * request, a store or a log) is the mocked e2e's network guard, not a jsdom assertion.
 */
const SARANDE: LngLat = { lng: 20.0053, lat: 39.8756 };
const DHERMI: LngLat = { lng: 19.6482, lat: 40.1468 };
/** Well outside the map's own fence — a tourist who pressed the control before arriving. */
const MUNICH: LngLat = { lng: 11.5755, lat: 48.1374 };

describe('RivieraMap near me', () => {
  let geolocation: FakeGeolocationGateway;

  function mount(gateway: GeolocationGateway, nearMe = true): ComponentFixture<RivieraMap> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [RivieraMap],
      providers: [
        { provide: MapEngine, useValue: new FakeMapEngine() },
        { provide: GeolocationGateway, useValue: gateway },
      ],
    });
    const fixture = TestBed.createComponent(RivieraMap);
    fixture.componentRef.setInput('nearMe', nearMe);
    fixture.detectChanges();
    return fixture;
  }

  async function render(
    gateway: GeolocationGateway = geolocation,
    nearMe = true,
  ): Promise<ComponentFixture<RivieraMap>> {
    const fixture = mount(gateway, nearMe);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function control(fixture: ComponentFixture<RivieraMap>): HTMLButtonElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="map-near-me"]',
    );
  }

  function handleOf(fixture: ComponentFixture<RivieraMap>): FakeMapHandle {
    return fixture.componentInstance.handle() as FakeMapHandle;
  }

  function message(fixture: ComponentFixture<RivieraMap>): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-testid="map-near-me-message"]',
    );
  }

  function dismissButton(fixture: ComponentFixture<RivieraMap>): HTMLButtonElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid="map-near-me-dismiss"]',
    );
  }

  /** Press the control and let the browser answer, as one act. */
  async function press(
    fixture: ComponentFixture<RivieraMap>,
    outcome: GeolocationOutcome,
  ): Promise<void> {
    control(fixture)?.click();
    geolocation.answerWith(outcome);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    geolocation = new FakeGeolocationGateway();
  });

  it('offers the control only where it is asked for and the browser can answer', async () => {
    expect(control(await render(geolocation, true))).not.toBeNull();
    expect(control(await render(geolocation, false))).toBeNull();
    expect(control(await render(new FakeGeolocationGateway(false), true))).toBeNull();
  });

  it('names the control for every reader', async () => {
    const button = control(await render());

    expect(button?.textContent?.trim()).toBe('Near me');
    expect(button?.tagName).toBe('BUTTON');
    expect(button?.hasAttribute('disabled')).toBe(false);
  });

  it('centres on the visitor and marks the spot', async () => {
    const fixture = await render();

    await press(fixture, { kind: 'located', at: SARANDE });

    const handle = handleOf(fixture);
    expect(handle.view()).toEqual({ center: SARANDE, zoom: NEAR_ME_ZOOM });
    const marker = handle.markers().get(HERE_MARKER);
    expect(marker?.lngLat).toEqual(SARANDE);
    expect(marker?.draggable).toBeFalsy();
    expect(marker?.element.getAttribute('role')).toBe('img');
    expect(marker?.element.getAttribute('aria-label')).toBe('You are here');
    expect(marker?.element.tabIndex).toBeLessThan(0);
  });

  it('re-centres and moves the one marker on a second press', async () => {
    const fixture = await render();
    await press(fixture, { kind: 'located', at: SARANDE });
    const first = handleOf(fixture).markers().get(HERE_MARKER)?.element;

    handleOf(fixture).setView({ center: { lng: 19.5, lat: 41.3 }, zoom: 9 });
    await press(fixture, { kind: 'located', at: DHERMI });

    const handle = handleOf(fixture);
    expect(handle.view()).toEqual({ center: DHERMI, zoom: NEAR_ME_ZOOM });
    expect(handle.markers().size).toBe(1);
    expect(handle.markers().get(HERE_MARKER)?.lngLat).toEqual(DHERMI);
    // The same element: re-adding it would detach whatever the map had mounted.
    expect(handle.markers().get(HERE_MARKER)?.element).toBe(first);
  });

  it.each([
    ['denied' as const, 'Location permission was declined. The map hasn’t moved.'],
    ['unavailable' as const, 'Your location isn’t available right now.'],
    ['timeout' as const, 'Finding your location took too long. Try again.'],
  ])('reports a %s answer without moving the map', async (kind, expected) => {
    const fixture = await render();
    const before = handleOf(fixture).view();

    await press(fixture, { kind });

    expect(message(fixture)?.textContent?.trim()).toBe(expected);
    expect(message(fixture)?.getAttribute('role')).toBe('alert');
    expect(handleOf(fixture).view()).toEqual(before);
    expect(handleOf(fixture).markers().size).toBe(0);
    // Still pressable: a declined permission is fixable in the browser, a timeout is worth retrying.
    expect(control(fixture)?.getAttribute('aria-disabled')).toBeNull();
  });

  it('refuses a position off the riviera rather than letting the fence clamp the camera', async () => {
    const fixture = await render();
    const before = handleOf(fixture).view();

    await press(fixture, { kind: 'located', at: MUNICH });

    expect(message(fixture)?.textContent?.trim()).toBe(
      'You don’t seem to be on the Albanian riviera — the map hasn’t moved.',
    );
    expect(handleOf(fixture).view()).toEqual(before);
    expect(handleOf(fixture).markers().size).toBe(0);
  });

  it('clears the message once a retry succeeds', async () => {
    const fixture = await render();
    await press(fixture, { kind: 'denied' });
    expect(message(fixture)).not.toBeNull();

    await press(fixture, { kind: 'located', at: SARANDE });

    expect(message(fixture)).toBeNull();
    expect(handleOf(fixture).view().center).toEqual(SARANDE);
  });

  it('is dismissible, and leaves the map exactly where it was', async () => {
    const fixture = await render();
    const before = handleOf(fixture).view();
    await press(fixture, { kind: 'denied' });
    expect(message(fixture)).not.toBeNull();

    dismissButton(fixture)?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(message(fixture)).toBeNull();
    expect(dismissButton(fixture)).toBeNull();
    expect(handleOf(fixture).view()).toEqual(before);
  });

  // The teardown takes the dismiss button itself, which just held focus (WCAG 2.4.3).
  it('moves focus onto Near me rather than stranding it on the dismissed button', async () => {
    const fixture = await render();
    await press(fixture, { kind: 'denied' });
    dismissButton(fixture)!.focus();

    dismissButton(fixture)?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.activeElement).toBe(control(fixture));
  });

  it('can raise the message again after a dismissal', async () => {
    const fixture = await render();
    await press(fixture, { kind: 'denied' });
    dismissButton(fixture)?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(message(fixture)).toBeNull();

    await press(fixture, { kind: 'denied' });

    expect(message(fixture)?.textContent?.trim()).toBe(
      'Location permission was declined. The map hasn’t moved.',
    );
  });

  it('is busy rather than disabled while the browser is answering', async () => {
    const fixture = await render();
    const button = control(fixture)!;
    button.focus();

    button.click();
    fixture.detectChanges();

    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
    // Disabling the pressed control would blur it to <body> (WCAG 2.4.3).
    expect((fixture.nativeElement as HTMLElement).ownerDocument.activeElement).toBe(button);

    button.click();
    expect(geolocation.calls).toBe(1);

    geolocation.answerWith({ kind: 'located', at: SARANDE });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(button.getAttribute('aria-disabled')).toBeNull();
  });

  it('keeps a tap on the you-are-here marker off the map underneath', async () => {
    const fixture = await render();
    const clicked: LngLat[] = [];
    fixture.componentInstance.mapClick.subscribe((at: LngLat) => clicked.push(at));
    await press(fixture, { kind: 'located', at: SARANDE });

    handleOf(fixture).markers().get(HERE_MARKER)?.element.click();

    expect(clicked).toEqual([]);
  });
});
