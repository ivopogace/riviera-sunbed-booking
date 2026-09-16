import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FakeMapEngine, FakeMapHandle } from './fake-map-engine';
import { MapEngine, MapEngineOptions, MapHandle } from './map-engine';
import { RIVIERA_MAP_OPTIONS, RivieraMap } from './riviera-map';

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

  /** First render only: the engine has not been asked yet, so the map is still booting. */
  function mount(engine: MapEngine): ComponentFixture<RivieraMap> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [RivieraMap],
      providers: [{ provide: MapEngine, useValue: engine }],
    });
    const fixture = TestBed.createComponent(RivieraMap);
    fixture.detectChanges();
    return fixture;
  }

  async function render(
    engine: MapEngine = new FakeMapEngine(),
  ): Promise<ComponentFixture<RivieraMap>> {
    const fixture = mount(engine);
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

    const handle = fixture.componentInstance.currentHandle() as FakeMapHandle;
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
    const handle = fixture.componentInstance.currentHandle() as FakeMapHandle;
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
});
