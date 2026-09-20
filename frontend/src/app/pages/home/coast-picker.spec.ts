import { ComponentFixture, TestBed } from '@angular/core/testing';

import { venueCard } from '../../../testing/venue-cards';
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

  function render(region = 'HIMARE', beach = '', attach = false): ComponentFixture<CoastPicker> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [CoastPicker] });
    fixture = TestBed.createComponent(CoastPicker);
    if (attach) {
      document.body.appendChild(fixture.nativeElement as HTMLElement);
    }
    fixture.componentRef.setInput('regions', REGIONS);
    fixture.componentRef.setInput('region', region);
    fixture.componentRef.setInput('beach', beach);
    fixture.componentRef.setInput('located', false);
    fixture.detectChanges();
    return fixture;
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function byTestId(id: string): HTMLElement | null {
    return el().querySelector<HTMLElement>(`[data-testid="${id}"]`);
  }

  function text(node: Element | null | undefined): string {
    return node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function rows(): HTMLElement[] {
    return [...el().querySelectorAll<HTMLElement>('[data-testid="picker-row"]')];
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
