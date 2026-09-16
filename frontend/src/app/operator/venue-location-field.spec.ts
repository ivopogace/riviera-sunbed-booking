import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { FakeMapEngine, FakeMapHandle } from '../shared/fake-map-engine';
import { MapEngine } from '../shared/map-engine';
import { RivieraMap } from '../shared/riviera-map';
import { VenueLocation } from '../shared/venue-views';
import { VenueLocationField } from './venue-location-field';

/**
 * The operator's pin placer against the fake map engine: what it feeds the map, what it does with
 * the map's answers, and what it tells the operator it has. Engine-agnostic by construction — it
 * only ever sees the seam.
 */
describe('VenueLocationField', () => {
  async function render(
    location: VenueLocation | null = null,
  ): Promise<ComponentFixture<VenueLocationField>> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [VenueLocationField],
      providers: [{ provide: MapEngine, useValue: new FakeMapEngine() }],
    });
    const fixture = TestBed.createComponent(VenueLocationField);
    fixture.componentRef.setInput('location', location);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function host(fixture: ComponentFixture<VenueLocationField>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function byTestId(fixture: ComponentFixture<VenueLocationField>, id: string): HTMLElement | null {
    return host(fixture).querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }

  function mapHandle(fixture: ComponentFixture<VenueLocationField>): FakeMapHandle {
    const map = fixture.debugElement.query(By.directive(RivieraMap))
      .componentInstance as RivieraMap;
    return map.currentHandle() as FakeMapHandle;
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

  it('keeps the read-out announced but never editable', async () => {
    const fixture = await render({ latitude: 40.1468, longitude: 19.6482 });
    const readout = byTestId(fixture, 'venue-location-readout');

    expect(readout?.tagName).toBe('OUTPUT');
    expect(readout?.getAttribute('aria-live')).toBe('polite');
    expect(host(fixture).querySelectorAll('input')).toHaveLength(0);
  });
});
