import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { FakeGeolocationGateway } from '../../../testing/fake-geolocation';
import { venueCard } from '../../../testing/venue-cards';
import { FakeMapEngine, FakeMapHandle } from '../../shared/fake-map-engine';
import { GeolocationGateway } from '../../shared/geolocation';
import { MapEngine } from '../../shared/map-engine';
import { RivieraMap } from '../../shared/riviera-map';
import { CoastPicker, coastIndex, PickerRegion } from './coast-picker';

/** Three regions with a venue, as the picker is fed them. */
const REGIONS: readonly PickerRegion[] = [
  {
    code: 'DURRES',
    label: 'Durrës',
    venues: 3,
    from: '€20',
    beaches: [
      { code: 'GOLEM', label: 'Golem', venues: 2, from: '€20' },
      { code: 'QERRET', label: 'Qerret', venues: 1, from: '€22' },
    ],
  },
  {
    code: 'HIMARE',
    label: 'Himarë',
    venues: 2,
    from: '€25',
    beaches: [
      { code: 'PALASE', label: 'Palasë', venues: 1, from: '€26' },
      { code: 'DHERMI', label: 'Dhërmi', venues: 1, from: '€25' },
    ],
  },
  {
    code: 'SARANDE',
    label: 'Sarandë',
    venues: 1,
    from: null,
    beaches: [{ code: 'KSAMIL', label: 'Ksamil', venues: 1, from: null }],
  },
];

describe('CoastPicker', () => {
  let fixture: ComponentFixture<CoastPicker>;
  let engine: FakeMapEngine;

  function render(
    region = 'HIMARE',
    beach = '',
    attach = false,
    regions: readonly PickerRegion[] = REGIONS,
  ): ComponentFixture<CoastPicker> {
    engine = new FakeMapEngine();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CoastPicker],
      providers: [
        { provide: MapEngine, useValue: engine },
        { provide: GeolocationGateway, useValue: new FakeGeolocationGateway() },
      ],
    });
    fixture = TestBed.createComponent(CoastPicker);
    if (attach) {
      document.body.appendChild(fixture.nativeElement as HTMLElement);
    }
    fixture.componentRef.setInput('regions', regions);
    fixture.componentRef.setInput('region', region);
    fixture.componentRef.setInput('beach', beach);
    fixture.componentRef.setInput('located', false);
    fixture.detectChanges();
    return fixture;
  }

  /**
   * Rendered with the ribbon's map booted, as it is by the time a person sees it: the handle's
   * arrival lays the ribbon out in a render hook, and the pass the app then runs on its own is
   * this fixture's second `detectChanges`.
   */
  async function renderBooted(): Promise<ComponentFixture<CoastPicker>> {
    render();
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.detectChanges();
    return fixture;
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function byTestId(id: string): HTMLElement | null {
    return el().querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }

  function allByTestId(id: string): HTMLElement[] {
    return [...el().querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
  }

  function text(node: Element | null | undefined): string {
    return node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function rows(): HTMLElement[] {
    return allByTestId('picker-row');
  }

  function ribbonHandle(): FakeMapHandle {
    const map = fixture.debugElement.query(By.directive(RivieraMap))
      .componentInstance as RivieraMap;
    return map.handle() as FakeMapHandle;
  }

  function lit(id: string): string[] {
    return allByTestId(id)
      .filter((node) => node.hasAttribute('data-lit'))
      .map((node) => node.dataset['beach']!);
  }

  it('is a named dialog listing the coast north to south, regions and their beaches, with no whole coast', () => {
    render();

    const dialog = byTestId('coast-picker')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-label')).toBe('Choose a place on the coast');
    expect(rows().map(text)).toEqual([
      'Durrës 3 venues from €20',
      'Golem 2 venues from €20',
      'Qerret 1 venue from €22',
      'Himarë 2 venues from €25',
      'Palasë 1 venue from €26',
      'Dhërmi 1 venue from €25',
      'Sarandë 1 venue',
      'Ksamil 1 venue',
    ]);
    expect(el().textContent).not.toContain('Whole coast');
  });

  it('marks the chosen region, or the chosen beach, as current', () => {
    render('HIMARE', '');
    expect(rows().map((r) => r.getAttribute('aria-current'))).toEqual([
      null,
      null,
      null,
      'true',
      null,
      null,
      null,
      null,
    ]);

    render('HIMARE', 'DHERMI');
    expect(rows().map((r) => r.getAttribute('aria-current'))).toEqual([
      null,
      null,
      null,
      null,
      null,
      'true',
      null,
      null,
    ]);
  });

  it('emits the region for a region row and the beach with its region for a beach row', () => {
    render();
    const picked = vi.fn();
    fixture.componentInstance.picked.subscribe(picked);

    rows()[0].click();
    expect(picked).toHaveBeenLastCalledWith({ region: 'DURRES', beach: '' });
    rows()[5].click();
    expect(picked).toHaveBeenLastCalledWith({ region: 'HIMARE', beach: 'DHERMI' });
  });

  it('offers Near me first, lit once located', () => {
    render();
    const nearMe = vi.fn();
    fixture.componentInstance.nearMe.subscribe(nearMe);
    const button = byTestId('picker-near-me')!;
    expect(button.getAttribute('aria-pressed')).toBe('false');

    button.click();
    expect(nearMe).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('located', true);
    fixture.detectChanges();
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('closes from its button, its backdrop and Escape', () => {
    render();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    byTestId('picker-close')!.click();
    byTestId('picker-backdrop')!.click();
    el().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toHaveBeenCalledTimes(3);
  });

  it('takes focus on open, so a keyboard user is inside the dialog (WCAG 2.4.3)', async () => {
    render('HIMARE', '', true);
    try {
      await fixture.whenStable();
      fixture.detectChanges();
      expect(byTestId('coast-picker')!.contains(document.activeElement)).toBe(true);
    } finally {
      el().remove();
    }
  });

  it('declares the touch floor on every row and control', () => {
    render();
    for (const control of el().querySelectorAll('button')) {
      expect(control.classList.contains('min-h-11'), control.outerHTML).toBe(true);
    }
  });

  describe('the ribbon', () => {
    it('creates its ribbon map with the picker, non-interactive, and destroys it with it', async () => {
      await renderBooted();

      expect(engine.created).toHaveLength(1);
      expect(engine.created[0].options.interactive).toBe(false);
      expect(byTestId('picker-ribbon')!.contains(engine.created[0].host)).toBe(true);
      const handle = ribbonHandle();
      expect(handle.destroyed()).toBe(false);

      fixture.destroy();
      expect(handle.destroyed()).toBe(true);
    });

    it('is 150 px, hidden from assistive technology, takes no pointer, and leaves the index’s names alone', async () => {
      await renderBooted();

      const ribbon = byTestId('picker-ribbon')!;
      expect(ribbon.getAttribute('aria-hidden')).toBe('true');
      for (const cls of ['w-[150px]', 'shrink-0', 'pointer-events-none']) {
        expect(ribbon.classList.contains(cls), cls).toBe(true);
      }
      expect(byTestId('picker-leaders')!.getAttribute('aria-hidden')).toBe('true');
      expect(ribbon.querySelector('button, a:not([tabindex="-1"]), [tabindex="0"]')).toBeNull();
      const names = [...byTestId('coast-picker')!.querySelectorAll('button')].map(
        (button) => button.getAttribute('aria-label') ?? text(button),
      );
      expect(names).toEqual([
        'Close',
        '◎ Near me',
        'Durrës 3 venues from €20',
        'Golem 2 venues from €20',
        'Qerret 1 venue from €22',
        'Himarë 2 venues from €25',
        'Palasë 1 venue from €26',
        'Dhërmi 1 venue from €25',
        'Sarandë 1 venue',
        'Ksamil 1 venue',
      ]);
    });

    it('draws one dot per index beach at its catalogue place, and one leader per beach row', async () => {
      await renderBooted();

      const dots = allByTestId('ribbon-dot');
      expect(dots.map((dot) => dot.dataset['beach'])).toEqual([
        'GOLEM',
        'QERRET',
        'PALASE',
        'DHERMI',
        'KSAMIL',
      ]);
      // Projected through the ribbon's own camera: Golem is north of Ksamil, so it sits higher.
      const top = (dot: HTMLElement) => Number.parseFloat(dot.style.top);
      expect(top(dots[0])).toBeLessThan(top(dots[4]));
      expect(Number.parseFloat(dots[0].style.left)).toBeLessThan(
        Number.parseFloat(dots[4].style.left),
      );
      expect(allByTestId('ribbon-leader').map((leader) => leader.dataset['beach'])).toEqual([
        'GOLEM',
        'QERRET',
        'PALASE',
        'DHERMI',
        'KSAMIL',
      ]);
      for (const leader of allByTestId('ribbon-leader')) {
        expect(leader.getAttribute('d')).toMatch(/^M [\d.-]+ [\d.-]+ H 144 L 158 [\d.-]+ H 166$/);
      }
    });

    it('draws no dot for a beach off the catalogue', async () => {
      render('HIMARE', '', false, [
        {
          code: 'HIMARE',
          label: 'Himarë',
          venues: 1,
          from: null,
          beaches: [{ code: 'ATLANTIS', label: 'Atlantis', venues: 1, from: null }],
        },
      ]);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(allByTestId('ribbon-dot')).toEqual([]);
      expect(allByTestId('ribbon-leader')).toEqual([]);
    });

    it('fits the whole coast into the ribbon once it has a size', async () => {
      render();
      const ribbon = byTestId('picker-ribbon')!;
      Object.defineProperty(ribbon, 'clientWidth', { value: 150 });
      Object.defineProperty(ribbon, 'clientHeight', { value: 618 });
      await fixture.whenStable();
      fixture.detectChanges();

      const view = ribbonHandle().view();
      // The catalogue's 0.65° of longitude across 122 usable px, the tighter axis (camera-fit.spec).
      expect(view.zoom).toBeCloseTo(7.04, 2);
      expect(view.center.lng).toBeCloseTo((19.38 + 20.03) / 2, 6);
      expect(view.center.lat).toBeCloseTo((39.77 + 41.848) / 2, 6);
    });

    it('lights a row’s dot and leader on hover, focus and press, and still picks', async () => {
      await renderBooted();
      const picked = vi.fn();
      fixture.componentInstance.picked.subscribe(picked);
      const dhermi = rows()[5];
      const fire = (type: string) => {
        dhermi.dispatchEvent(new Event(type, { bubbles: type !== 'focus' && type !== 'blur' }));
        fixture.detectChanges();
      };

      expect(lit('ribbon-dot')).toEqual([]);
      fire('pointerenter');
      expect(lit('ribbon-dot')).toEqual(['DHERMI']);
      expect(lit('ribbon-leader')).toEqual(['DHERMI']);
      fire('pointerleave');
      expect(lit('ribbon-dot')).toEqual([]);

      fire('focus');
      expect(lit('ribbon-leader')).toEqual(['DHERMI']);
      fire('blur');
      expect(lit('ribbon-leader')).toEqual([]);

      fire('pointerdown');
      expect(lit('ribbon-dot')).toEqual(['DHERMI']);
      dhermi.click();
      expect(picked).toHaveBeenCalledWith({ region: 'HIMARE', beach: 'DHERMI' });
    });

    it('lights every dot of a region under its row, and not a beach that shares its code', async () => {
      render('HIMARE', '', false, [
        ...REGIONS,
        {
          code: 'VLORE',
          label: 'Vlorë',
          venues: 1,
          from: null,
          beaches: [{ code: 'VLORE', label: 'Vlorë', venues: 1, from: null }],
        },
      ]);
      await fixture.whenStable();
      fixture.detectChanges();
      fixture.detectChanges();

      rows()[3].dispatchEvent(new Event('pointerenter'));
      fixture.detectChanges();
      expect(lit('ribbon-dot')).toEqual(['PALASE', 'DHERMI']);

      // The Vlorë BEACH row lights its own dot only, not every dot of the Vlorë region.
      rows()[3].dispatchEvent(new Event('pointerleave'));
      rows()[9].dispatchEvent(new Event('pointerenter'));
      fixture.detectChanges();
      expect(lit('ribbon-dot')).toEqual(['VLORE']);
    });

    it('re-lays the leaders when the index scrolls or the camera moves', async () => {
      await renderBooted();
      const before = allByTestId('ribbon-leader').map((leader) => leader.getAttribute('d'));

      ribbonHandle().zoomIn();
      fixture.detectChanges();
      const zoomed = allByTestId('ribbon-leader').map((leader) => leader.getAttribute('d'));
      expect(zoomed).not.toEqual(before);

      const index = byTestId('picker-index')!;
      const rects = vi
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockReturnValue(new DOMRect(0, 40, 200, 44));
      try {
        index.dispatchEvent(new Event('scroll'));
        fixture.detectChanges();
        expect(allByTestId('ribbon-leader').map((leader) => leader.getAttribute('d'))).not.toEqual(
          zoomed,
        );
      } finally {
        rects.mockRestore();
      }
    });

    it('wears the popover skin from lg, the ribbon at the same 150 px', () => {
      render();

      const panel = byTestId('coast-picker')!;
      for (const cls of [
        'lg:absolute',
        'lg:top-[calc(100%+8px)]',
        'lg:w-[420px]',
        'lg:h-[min(760px,calc(100dvh-140px))]',
        'lg:rounded-[22px]',
      ]) {
        expect(panel.classList.contains(cls), cls).toBe(true);
      }
      expect(byTestId('picker-backdrop')!.classList.contains('lg:bg-transparent')).toBe(true);
      expect([...byTestId('picker-ribbon')!.classList].some((cls) => cls.startsWith('lg:'))).toBe(
        false,
      );
    });
  });
});

describe('coastIndex', () => {
  it('builds the index from the cards: catalogue order, counts and the lowest from-price', () => {
    const index = coastIndex([
      venueCard({
        id: 1,
        name: 'A',
        beach: 'KSAMIL',
        fromPrice: { minorUnits: 3000, currency: 'EUR' },
      }),
      venueCard({
        id: 2,
        name: 'B',
        beach: 'DHERMI',
        fromPrice: { minorUnits: 2500, currency: 'EUR' },
      }),
      venueCard({
        id: 3,
        name: 'C',
        beach: 'PALASE',
        fromPrice: { minorUnits: 2600, currency: 'EUR' },
      }),
      venueCard({ id: 4, name: 'D', beach: 'PALASE', fromPrice: null, priceLabel: null }),
    ]);

    expect(index.map((r) => r.code)).toEqual(['HIMARE', 'SARANDE']);
    expect(index[0]).toEqual({
      code: 'HIMARE',
      label: 'Himarë',
      venues: 3,
      from: '€25',
      beaches: [
        { code: 'PALASE', label: 'Palasë', venues: 2, from: '€26' },
        { code: 'DHERMI', label: 'Dhërmi', venues: 1, from: '€25' },
      ],
    });
    expect(index[1].beaches[0]).toEqual({
      code: 'KSAMIL',
      label: 'Ksamil',
      venues: 1,
      from: '€30',
    });
  });
});
