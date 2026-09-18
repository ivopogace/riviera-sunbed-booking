import { ComponentFixture, TestBed } from '@angular/core/testing';

import { expectNoAxeViolations } from '../../../testing/axe';
import { venueCard } from '../../../testing/venue-cards';
import { FakeMapEngine, FakeMapHandle } from '../../shared/fake-map-engine';
import { RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map';
import { VenuePin } from './pin-crowding';
import { VenuePinLayer } from './venue-pin-layer';

/**
 * Automated axe-core audit of the pin layer in every face it wears: a lone priced pin, a lone dot,
 * a place pill with its invisible members, the inverted pill, and the pill wearing an open venue.
 * Colour contrast is proven deterministically in `venue-pin-layer.contrast.spec.ts` — axe cannot
 * measure it under jsdom.
 */
const KSAMIL = { lng: 20.0021, lat: 39.7712 };
const DHERMI = { lng: 19.6401, lat: 40.1573 };

const PINS: readonly VenuePin[] = [
  { id: '1', at: KSAMIL, card: venueCard({ id: 1, name: 'Miramar Beach Club' }) },
  {
    id: '2',
    at: { lng: 20.00317, lat: 39.77227 },
    card: venueCard({ id: 2, name: 'Lori Beach' }),
  },
  {
    id: '3',
    at: DHERMI,
    card: venueCard({ id: 3, name: 'Aurora Bay', beach: 'DHERMI' }),
  },
  {
    id: '4',
    at: { lng: 19.9, lat: 40.3 },
    card: venueCard({
      id: 4,
      name: 'Quiet Cove',
      beach: 'PALASE',
      priceLabel: null,
      fromPrice: null,
    }),
  },
];

describe('VenuePinLayer accessibility', () => {
  let fixture: ComponentFixture<VenuePinLayer>;
  let handle: FakeMapHandle;

  async function render(selected: string | null = null): Promise<HTMLElement> {
    handle = await new FakeMapEngine().create(document.createElement('div'), RIVIERA_MAP_OPTIONS);
    TestBed.configureTestingModule({ imports: [VenuePinLayer] });
    fixture = TestBed.createComponent(VenuePinLayer);
    fixture.componentRef.setInput('pins', PINS);
    fixture.componentRef.setInput('map', handle);
    fixture.componentRef.setInput('selected', selected);
    fixture.componentRef.setInput('maxZoom', RIVIERA_MAP_OPTIONS.maxZoom);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('has no serious violations with lone pins, a dot and a place pill drawn', async () => {
    const host = await render();

    expect(host.querySelectorAll('[data-testid="map-place-pill"]').length).toBe(1);
    expect(host.querySelectorAll('[data-testid="map-crowd-member"]').length).toBe(1);
    expect(host.querySelectorAll('[data-testid="map-venue-pin"]').length).toBe(2);
    await expectNoAxeViolations(host);
  });

  it('has no serious violations with a lone pin selected and a member focused', async () => {
    const host = await render('3');
    document.body.appendChild(host);
    try {
      fixture.componentInstance.focusPin('2');
      expect(document.activeElement?.getAttribute('data-testid')).toBe('map-crowd-member');
    } finally {
      host.remove();
    }

    await expectNoAxeViolations(host);
  });

  it('has no serious violations with the pill inverted, and then wearing an open venue', async () => {
    const host = await render();
    handle.setView({ center: { lng: 20.00264, lat: 39.77174 }, zoom: 13 });
    fixture.componentRef.setInput(
      'pins',
      PINS.map((pin) => (pin.id === '2' ? { ...pin, at: KSAMIL } : pin)),
    );
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="map-place-pill"]')?.hasAttribute('data-here')).toBe(
      false,
    );

    handle.setView({ center: KSAMIL, zoom: RIVIERA_MAP_OPTIONS.maxZoom });
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="map-place-pill"]')?.hasAttribute('data-here')).toBe(
      true,
    );
    await expectNoAxeViolations(host);

    fixture.componentRef.setInput('selected', '1');
    fixture.detectChanges();
    expect(
      host.querySelector('[data-testid="map-place-pill"]')?.getAttribute('aria-expanded'),
    ).toBe('true');
    await expectNoAxeViolations(host);
  });
});
