import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { expectNoAxeViolations } from '../../testing/axe';
import { FakeGeolocationGateway } from '../../testing/fake-geolocation';
import { FakeMapEngine, FakeMapHandle } from '../shared/fake-map-engine';
import { GeolocationGateway } from '../shared/geolocation';
import { MapEngine } from '../shared/map-engine';
import { RivieraMap } from '../shared/riviera-map';
import { VenueLocationField } from './venue-location-field';

/**
 * Structural axe audit of the pin placer in the two states that differ structurally: no pin, and
 * the shoreline offer open — the state that adds a live region and two controls inside it.
 * Contrast is proven in `venue-tab.contrast.spec.ts`, the rendered boxes in the mocked e2e.
 */
describe('VenueLocationField accessibility', () => {
  /** Water west of this meridian; a pin dropped east of it is inland and gets an offer. */
  const COAST_LNG = 19.8;

  async function render(coastLng?: number): Promise<ComponentFixture<VenueLocationField>> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [VenueLocationField],
      providers: [
        { provide: MapEngine, useValue: new FakeMapEngine(coastLng) },
        { provide: GeolocationGateway, useValue: new FakeGeolocationGateway() },
      ],
    });
    const fixture = TestBed.createComponent(VenueLocationField);
    fixture.componentRef.setInput('location', null);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function host(fixture: ComponentFixture<VenueLocationField>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function mapHandle(fixture: ComponentFixture<VenueLocationField>): FakeMapHandle {
    const map = fixture.debugElement.query(By.directive(RivieraMap))
      .componentInstance as RivieraMap;
    return map.handle() as FakeMapHandle;
  }

  it('has no violations with no pin on the map', async () => {
    await expectNoAxeViolations(host(await render()));
  });

  it('has no violations with the shoreline offer open', async () => {
    const fixture = await render(COAST_LNG);
    const inland = mapHandle(fixture).project({ lng: 19.9, lat: 40.04 });

    host(fixture)
      .querySelector<HTMLElement>('[data-testid="riviera-map-fake"]')!
      .dispatchEvent(
        new MouseEvent('click', { clientX: inland.x, clientY: inland.y, bubbles: true }),
      );
    fixture.detectChanges();

    expect(host(fixture).querySelector('[data-testid="venue-location-proposal"]')).not.toBeNull();
    await expectNoAxeViolations(host(fixture));
  });
});
