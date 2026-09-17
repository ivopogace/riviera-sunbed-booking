import { TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../testing/axe';
import { FakeGeolocationGateway } from '../../testing/fake-geolocation';
import { FakeMapEngine } from './fake-map-engine';
import { GeolocationGateway } from './geolocation';
import { MapEngine, MapHandle } from './map-engine';
import { RivieraMap } from './riviera-map';

class NoWebGlEngine extends MapEngine {
  override create(): Promise<MapHandle> {
    return Promise.reject(new Error('Failed to initialize WebGL'));
  }
}

/**
 * Structural axe audit of the map chrome in each state: the labelled zoom group, the skip control
 * and the attribution over a live map, the same with a pin on it, and the unavailable message
 * without one. Contrast
 * is proven in `riviera-map.contrast.spec.ts`; the real-browser audit with a rendered map is the
 * mocked e2e.
 */
describe('RivieraMap accessibility', () => {
  let geolocation: FakeGeolocationGateway;

  async function renderWith(
    engine: MapEngine,
    inputs: Record<string, unknown> = {},
  ): Promise<HTMLElement> {
    geolocation = new FakeGeolocationGateway();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [RivieraMap],
      providers: [
        { provide: MapEngine, useValue: engine },
        { provide: GeolocationGateway, useValue: geolocation },
      ],
    });
    const fixture = TestBed.createComponent(RivieraMap);
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('has no serious violations with a live map', async () => {
    await expectNoAxeViolations(await renderWith(new FakeMapEngine()));
  });

  it('has no serious violations with a pin on the map', async () => {
    const host = await renderWith(new FakeMapEngine(), {
      pin: { lng: 19.6482, lat: 40.1468 },
      pinDraggable: true,
      pinLabel: 'Venue location',
    });

    // The marker is a labelled image, not a control: it carries no action a keyboard could reach.
    const pin = host.querySelector('[data-testid="map-pin"]');
    expect(pin?.getAttribute('role')).toBe('img');
    expect(pin?.getAttribute('aria-label')).toBe('Venue location');
    await expectNoAxeViolations(host);
  });

  it('has no serious violations when the map is unavailable', async () => {
    await expectNoAxeViolations(await renderWith(new NoWebGlEngine()));
  });

  it('has no serious violations with the near-me control, before and after it reports a problem', async () => {
    const host = await renderWith(new FakeMapEngine(), { nearMe: true });
    const control = host.querySelector<HTMLButtonElement>('[data-testid="map-near-me"]');
    expect(control).not.toBeNull();
    await expectNoAxeViolations(host);

    control?.click();
    geolocation.answerWith({ kind: 'denied' });
    await Promise.resolve();
    TestBed.tick();

    expect(host.querySelector('[data-testid="map-near-me-message"]')).not.toBeNull();
    await expectNoAxeViolations(host);

    host.querySelector<HTMLButtonElement>('[data-testid="map-near-me-dismiss"]')?.click();
    TestBed.tick();

    expect(host.querySelector('[data-testid="map-near-me-message"]')).toBeNull();
    await expectNoAxeViolations(host);
  });
});
