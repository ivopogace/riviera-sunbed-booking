import { ComponentFixture, TestBed } from '@angular/core/testing';

import { venueCard } from '../../../testing/venue-cards';
import { FakeMapEngine, FakeMapHandle } from '../../shared/fake-map-engine';
import { LngLat } from '../../shared/map-engine';
import { RIVIERA_MAP_OPTIONS } from '../../shared/riviera-map-options';
import { VenuePin } from './pin-crowding';
import { VenuePinLayer } from './venue-pin-layer';

/** Ksamil: two venues ~120 m apart — one blob at the riviera-wide view, two pins from zoom ~15. */
const MIRAMAR: VenuePin = {
  id: '1',
  at: { lng: 20.0021, lat: 39.7712 },
  card: venueCard({ id: 1, name: 'Miramar Beach Club', beach: 'KSAMIL' }),
};
const LORI: VenuePin = {
  id: '2',
  at: { lng: 20.00317, lat: 39.77227 },
  card: venueCard({
    id: 2,
    name: 'Lori Beach',
    beach: 'KSAMIL',
    priceLabel: '€21',
    fromPrice: { minorUnits: 2100, currency: 'EUR' },
  }),
};
/** Dhërmi, 0.4° up the coast: on its own at every zoom. */
const AURORA: VenuePin = {
  id: '3',
  at: { lng: 19.6401, lat: 40.1573 },
  card: venueCard({
    id: 3,
    name: 'Aurora Bay',
    beach: 'DHERMI',
    priceLabel: '€30',
    fromPrice: { minorUnits: 3000, currency: 'EUR' },
  }),
};

/** Three venues on one spot: no zoom the map offers separates them. */
const DHERMI: LngLat = { lng: 19.63925, lat: 40.14831 };
const HAVANA: VenuePin = {
  id: '11',
  at: DHERMI,
  card: venueCard({
    id: 11,
    name: 'Havana Beach',
    beach: 'DHERMI',
    priceLabel: '€24',
    fromPrice: { minorUnits: 2400, currency: 'EUR' },
  }),
};
const FOLIE: VenuePin = {
  id: '12',
  at: DHERMI,
  card: venueCard({
    id: 12,
    name: 'Folie Marine',
    beach: 'DHERMI',
    priceLabel: '€39',
    fromPrice: { minorUnits: 3900, currency: 'EUR' },
  }),
};
const SUN_CLUB: VenuePin = {
  id: '13',
  at: DHERMI,
  card: venueCard({
    id: 13,
    name: 'Dhërmi Sun Club',
    beach: 'DHERMI',
    priceLabel: '€18',
    fromPrice: { minorUnits: 1800, currency: 'EUR' },
  }),
};

describe('VenuePinLayer', () => {
  let handle: FakeMapHandle;
  let fixture: ComponentFixture<VenuePinLayer>;
  let chosen: string[];
  let narrowed: string[];

  async function render(pins: readonly VenuePin[], selected: string | null = null): Promise<void> {
    handle = await new FakeMapEngine().create(document.createElement('div'), RIVIERA_MAP_OPTIONS);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [VenuePinLayer] });
    fixture = TestBed.createComponent(VenuePinLayer);
    fixture.componentRef.setInput('pins', pins);
    fixture.componentRef.setInput('map', handle);
    fixture.componentRef.setInput('selected', selected);
    fixture.componentRef.setInput('maxZoom', RIVIERA_MAP_OPTIONS.maxZoom);
    chosen = [];
    narrowed = [];
    fixture.componentInstance.chosen.subscribe((id) => chosen.push(id));
    fixture.componentInstance.narrowed.subscribe((beach) => narrowed.push(beach));
    fixture.detectChanges();
  }

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function buttons(testId?: string): HTMLButtonElement[] {
    const selector = testId ? `button[data-testid="${testId}"]` : 'button';
    return [...host().querySelectorAll<HTMLButtonElement>(selector)];
  }

  function labels(testId?: string): (string | null)[] {
    return buttons(testId).map((button) => button.getAttribute('aria-label'));
  }

  function text(button: HTMLElement): string {
    return button.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function select(id: string | null): void {
    fixture.componentRef.setInput('selected', id);
    fixture.detectChanges();
  }

  describe('a venue on its own', () => {
    it("draws production's priced pin: the price on its face, the name and price as its name", async () => {
      await render([AURORA]);

      const [pin] = buttons('map-venue-pin');
      expect(buttons()).toHaveLength(1);
      expect(pin.type).toBe('button');
      expect(text(pin)).toBe('€30');
      expect(pin.getAttribute('aria-label')).toBe('Aurora Bay, from €30');
      expect(pin.getAttribute('aria-expanded')).toBe('false');
      expect(pin.hasAttribute('data-here')).toBe(false);
    });

    it('draws a plain dot under the name alone for a venue with no priced set', async () => {
      await render([{ ...AURORA, card: { ...AURORA.card, priceLabel: null, fromPrice: null } }]);

      const [pin] = buttons('map-venue-pin');
      expect(pin.querySelector('app-dot-icon svg')).not.toBeNull();
      expect(text(pin)).toBe('');
      expect(pin.querySelector('.pin-price')).toBeNull();
      expect(pin.getAttribute('aria-label')).toBe('Aurora Bay');
    });

    it('marks the selected pin expanded, keeping its element', async () => {
      await render([AURORA]);
      const [before] = buttons('map-venue-pin');

      select('3');

      expect(buttons('map-venue-pin')[0]).toBe(before);
      expect(before.getAttribute('aria-expanded')).toBe('true');
    });

    it('reports the pressed venue', async () => {
      await render([AURORA]);

      buttons('map-venue-pin')[0].click();

      expect(chosen).toEqual(['3']);
      expect(narrowed).toEqual([]);
    });

    it('sits where the map projects it', async () => {
      await render([AURORA]);
      const { x, y } = handle.project(AURORA.at);

      const [pin] = buttons('map-venue-pin');
      expect(pin.style.left).toBe(`${x}px`);
      expect(pin.style.top).toBe(`${y}px`);
    });

    it('draws nothing before the map has booted', async () => {
      await render([AURORA]);
      fixture.componentRef.setInput('map', undefined);
      fixture.detectChanges();

      expect(buttons()).toEqual([]);
    });
  });

  describe('a crowd', () => {
    it('draws one place pill — the beach, its lowest from-price, the count — and n real buttons in feed order', async () => {
      await render([MIRAMAR, LORI, AURORA]);

      expect(buttons().map((button) => button.dataset['testid'])).toEqual([
        'map-place-pill',
        'map-crowd-member',
        'map-venue-pin',
      ]);
      const [pill] = buttons('map-place-pill');
      expect(text(pill)).toBe('Ksamil from €21 2');
      expect(pill.getAttribute('aria-label')).toBe(
        '2 venues at Ksamil, from €21; press to zoom to them',
      );
      expect(pill.getAttribute('aria-expanded')).toBe('false');
      expect(labels('map-crowd-member')).toEqual(['Lori Beach, 2 of 2 venues at Ksamil']);
      expect(buttons('map-crowd-member')[0].getAttribute('aria-expanded')).toBe('false');
    });

    it('names a crowd across two beaches by both, and beyond that by their count', async () => {
      const elsewhere = { ...LORI, card: { ...LORI.card, beach: 'DHERMI' as const } };
      await render([MIRAMAR, elsewhere]);
      expect(text(buttons('map-place-pill')[0])).toContain('Ksamil & Dhërmi');

      const third = { ...AURORA, at: MIRAMAR.at, card: { ...AURORA.card, beach: 'JALE' as const } };
      await render([MIRAMAR, elsewhere, third]);
      expect(text(buttons('map-place-pill')[0])).toContain('3 beaches');
    });

    it('leaves the from-price off a crowd with no priced member', async () => {
      const unpriced = (pin: VenuePin): VenuePin => ({
        ...pin,
        card: { ...pin.card, priceLabel: null, fromPrice: null },
      });
      await render([unpriced(MIRAMAR), unpriced(LORI)]);

      const [pill] = buttons('map-place-pill');
      expect(text(pill)).toBe('Ksamil 2');
      expect(pill.getAttribute('aria-label')).toBe('2 venues at Ksamil; press to zoom to them');
    });

    it('a crowd member opens its own venue directly', async () => {
      await render([MIRAMAR, LORI]);

      buttons('map-crowd-member')[0].click();

      expect(chosen).toEqual(['2']);
    });

    it('pressing a place goes there, narrows to its one beach and keeps focus on the same element', async () => {
      await render([MIRAMAR, LORI, AURORA]);
      document.body.appendChild(host());
      try {
        const [pill] = buttons('map-place-pill');
        pill.focus();

        pill.click();
        fixture.detectChanges();

        const { zoom, center } = handle.view();
        expect(zoom).toBeGreaterThan(RIVIERA_MAP_OPTIONS.view.zoom);
        expect(zoom).toBeLessThan(RIVIERA_MAP_OPTIONS.maxZoom);
        expect(center.lng).toBeCloseTo((MIRAMAR.at.lng + LORI.at.lng) / 2, 9);
        expect(center.lat).toBeCloseTo((MIRAMAR.at.lat + LORI.at.lat) / 2, 9);
        expect(narrowed).toEqual(['KSAMIL']);
        expect(chosen).toEqual([]);

        // The members separate into production's own pins, prices side by side; nothing was rebuilt.
        expect(buttons('map-place-pill')).toEqual([]);
        expect(labels('map-venue-pin')).toEqual([
          'Miramar Beach Club, from €25',
          'Lori Beach, from €21',
          'Aurora Bay, from €30',
        ]);
        expect(buttons('map-venue-pin')[0]).toBe(pill);
        expect(document.activeElement).toBe(pill);
      } finally {
        host().remove();
      }
    });

    it('a crowd spanning beaches narrows nothing when pressed', async () => {
      await render([MIRAMAR, { ...LORI, card: { ...LORI.card, beach: 'DHERMI' as const } }]);

      buttons('map-place-pill')[0].click();

      expect(handle.view().zoom).toBeGreaterThan(RIVIERA_MAP_OPTIONS.view.zoom);
      expect(narrowed).toEqual([]);
    });

    it('re-groups on every camera move, keeping each venue’s element', async () => {
      await render([MIRAMAR, LORI]);
      const before = buttons();

      handle.setView({ center: MIRAMAR.at, zoom: RIVIERA_MAP_OPTIONS.maxZoom });
      fixture.detectChanges();

      expect(buttons('map-venue-pin')).toEqual(before);
      handle.setView(RIVIERA_MAP_OPTIONS.view);
      fixture.detectChanges();
      expect(buttons('map-place-pill')).toEqual([before[0]]);
    });
  });

  describe('a crowd the camera cannot separate', () => {
    async function renderDhermi(selected: string | null = null): Promise<void> {
      await render([HAVANA, FOLIE, SUN_CLUB], selected);
      handle.setView({ center: DHERMI, zoom: RIVIERA_MAP_OPTIONS.maxZoom });
      fixture.detectChanges();
    }

    it('inverts its pill and offers to open the first venue', async () => {
      await renderDhermi();

      const [pill] = buttons('map-place-pill');
      expect(pill.hasAttribute('data-here')).toBe(true);
      expect(text(pill)).toBe('Dhërmi See each venue 3');
      expect(pill.getAttribute('aria-label')).toBe(
        '3 venues at Dhërmi, from €18; press to open Havana Beach',
      );
      expect(labels('map-crowd-member')).toEqual([
        'Folie Marine, 2 of 3 venues at Dhërmi',
        'Dhërmi Sun Club, 3 of 3 venues at Dhërmi',
      ]);
    });

    it('presses through: narrows to the beach and opens the first venue', async () => {
      await renderDhermi();

      buttons('map-place-pill')[0].click();

      expect(narrowed).toEqual(['DHERMI']);
      expect(chosen).toEqual(['11']);
      expect(handle.view().zoom).toBe(RIVIERA_MAP_OPTIONS.maxZoom);
    });

    it('wears the open venue, counts its place, and walks to the next on the next press, wrapping', async () => {
      await renderDhermi('11');

      const [pill] = buttons('map-place-pill');
      expect(text(pill)).toBe('Havana Beach from €24 1/3');
      expect(pill.getAttribute('aria-expanded')).toBe('true');
      expect(pill.getAttribute('aria-label')).toBe(
        'Havana Beach, 1 of 3 venues at Dhërmi; press again for Folie Marine',
      );
      pill.click();
      expect(chosen).toEqual(['12']);

      select('13');
      const [last] = buttons('map-place-pill');
      expect(text(last)).toBe('Dhërmi Sun Club from €18 3/3');
      last.click();
      expect(chosen).toEqual(['12', '11']);
      expect(narrowed).toEqual([]);
    });

    it('exposes the open venue’s place in an inseparable crowd, wrapping at both ends', async () => {
      await renderDhermi('12');
      expect(fixture.componentInstance.stack()).toEqual({
        index: 1,
        count: 3,
        place: 'Dhërmi',
        prevId: '11',
        nextId: '13',
      });

      select('11');
      expect(fixture.componentInstance.stack()).toMatchObject({
        index: 0,
        prevId: '13',
        nextId: '12',
      });

      select('13');
      expect(fixture.componentInstance.stack()).toMatchObject({
        index: 2,
        prevId: '12',
        nextId: '11',
      });
    });

    it('exposes no stack for nothing open, a lone pin, or a crowd the camera can still separate', async () => {
      await renderDhermi();
      expect(fixture.componentInstance.stack()).toBeNull();

      await render([AURORA], '3');
      expect(fixture.componentInstance.stack()).toBeNull();

      await render([MIRAMAR, LORI], '1');
      expect(buttons('map-place-pill')[0].hasAttribute('data-here')).toBe(false);
      expect(fixture.componentInstance.stack()).toBeNull();
    });

    it('makes the open venue’s own button the pill, so the element that opened it keeps focus', async () => {
      await renderDhermi();
      const [havana, folie] = buttons();

      select('12');

      expect(buttons('map-place-pill')).toEqual([folie]);
      expect(buttons('map-crowd-member')).toContain(havana);
      expect(havana.getAttribute('aria-label')).toBe('Havana Beach, 1 of 3 venues at Dhërmi');
    });
  });

  describe('dusk', () => {
    function closed(pin: VenuePin): VenuePin {
      return { ...pin, card: { ...pin.card, salesClosed: true } };
    }

    it('greys a lone pin whose own sales for the day have closed', async () => {
      await render([closed(AURORA)]);
      expect(buttons('map-venue-pin')[0].hasAttribute('data-dusk')).toBe(true);
    });

    it('leaves a lone pin still selling alone', async () => {
      await render([AURORA]);
      expect(buttons('map-venue-pin')[0].hasAttribute('data-dusk')).toBe(false);
    });

    it('greys a crowd only when every member has closed', async () => {
      await render([closed(MIRAMAR), LORI]);
      expect(buttons('map-place-pill')[0].hasAttribute('data-dusk')).toBe(false);

      await render([closed(MIRAMAR), closed(LORI)]);
      expect(buttons('map-place-pill')[0].hasAttribute('data-dusk')).toBe(true);
    });

    it('strikes the price and leaves the name, so dusk is never carried by colour alone', async () => {
      await render([closed(MIRAMAR), closed(LORI)]);

      const [pill] = buttons('map-place-pill');
      expect(pill.querySelector('.pin-price')?.textContent?.trim()).toBe('from €21');
      expect(pill.className).toContain('data-dusk:[&_.pin-price]:line-through');
    });
  });

  describe('the row the pointer is on', () => {
    function light(id: string | null): void {
      fixture.componentRef.setInput('highlighted', id);
      fixture.detectChanges();
    }

    it('lights the lone pin of the venue whose row is under the pointer', async () => {
      await render([AURORA]);
      expect(buttons('map-venue-pin')[0].hasAttribute('data-hover')).toBe(false);

      light('3');

      expect(buttons('map-venue-pin')[0].hasAttribute('data-hover')).toBe(true);
    });

    it('lights a crowd’s pill for any one of its members, since the pill is what is drawn', async () => {
      await render([MIRAMAR, LORI]);

      light('2');

      expect(buttons('map-place-pill')[0].hasAttribute('data-hover')).toBe(true);
    });

    it('lights nothing once the pointer has left the list', async () => {
      await render([AURORA]);
      light('3');

      light(null);

      expect(buttons('map-venue-pin')[0].hasAttribute('data-hover')).toBe(false);
    });
  });

  describe('the placement inputs the host hands in', () => {
    /** The trio sits on the camera's centre, which in jsdom is the layer's own corner. */
    async function renderDhermi(): Promise<void> {
      await render([HAVANA, FOLIE, SUN_CLUB]);
      handle.setView({ center: DHERMI, zoom: RIVIERA_MAP_OPTIONS.maxZoom });
      fixture.detectChanges();
    }

    function place(input: 'noGo' | 'window', value: unknown): HTMLButtonElement {
      fixture.componentRef.setInput(input, value);
      fixture.detectChanges();
      return buttons('map-place-pill')[0];
    }

    it('reports every lone pin’s box, for a host deciding where its own chrome goes', async () => {
      await render([AURORA]);
      const { x, y } = handle.project(AURORA.at);

      expect(fixture.componentInstance.loneBoxes()).toEqual([
        { left: x - 28.5, top: y - 22, right: x + 28.5, bottom: y + 22 },
      ]);
    });

    it('reports no box for a crowd, whose pill is free to move around the chrome', async () => {
      await render([MIRAMAR, LORI]);
      expect(fixture.componentInstance.loneBoxes()).toEqual([]);
    });

    it('sits a pill on its point when the host hands nothing', async () => {
      await renderDhermi();
      const [pill] = buttons('map-place-pill');

      expect(pill.style.translate).toBe('-50% -50%');
      expect(pill.style.top).toBe('0px');
    });

    it('hangs a pill clear of a no-go box', async () => {
      await renderDhermi();
      // Over the pill's own line and the one above it, leaving the line below free.
      const chrome = { left: -100, top: -60, right: 100, bottom: -10 };

      expect(place('noGo', [chrome]).style.top).toBe('32px');
    });

    it('confines a pill to the window', async () => {
      await renderDhermi();
      const underHeader = { left: -200, top: -10, right: 200, bottom: 100 };

      expect(place('window', underHeader).style.top).toBe('32px');
    });

    it('leaves the crowd’s own members on its point while the pill hangs', async () => {
      await renderDhermi();
      place('window', { left: -200, top: -10, right: 200, bottom: 100 });

      expect(buttons('map-crowd-member').map((member) => member.style.top)).toEqual(['0px', '0px']);
    });

    it('collapses a pill the window leaves no room for at all', async () => {
      await renderDhermi();
      const sliver = { left: -200, top: -10, right: 200, bottom: 0 };
      const pill = place('window', sliver);

      expect(pill.style.top).toBe('0px');
      expect(text(pill)).toBe('3');
    });
  });

  describe('focus', () => {
    it("focuses a venue's button on request, whichever face it wears", async () => {
      await render([MIRAMAR, LORI, AURORA]);
      document.body.appendChild(host());
      try {
        fixture.componentInstance.focusPin('2');
        expect(document.activeElement).toBe(buttons('map-crowd-member')[0]);

        fixture.componentInstance.focusPin('1');
        expect(document.activeElement).toBe(buttons('map-place-pill')[0]);

        fixture.componentInstance.focusPin('3');
        expect(document.activeElement).toBe(buttons('map-venue-pin')[0]);
      } finally {
        host().remove();
      }
    });

    it('ignores a focus request for a venue it does not draw', async () => {
      await render([AURORA]);

      expect(() => fixture.componentInstance.focusPin('404')).not.toThrow();
    });
  });
});
