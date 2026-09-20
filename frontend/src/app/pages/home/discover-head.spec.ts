import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BeachOption, DiscoverHead } from './discover-head';

/** Himarë's beaches with a venue, as the head would be fed them. */
const BEACHES: readonly BeachOption[] = [
  { code: 'PALASE', label: 'Palasë', count: 2 },
  { code: 'DRYMADES', label: 'Drymades', count: 1 },
  { code: 'DHERMI', label: 'Dhërmi', count: 3 },
];

/** The frozen Vitest clock is Monday 2026-06-15 in Europe/Tirane. */
const TODAY = '2026-06-15';

describe('DiscoverHead', () => {
  let fixture: ComponentFixture<DiscoverHead>;

  function render(inputs: Partial<Record<string, unknown>> = {}): ComponentFixture<DiscoverHead> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [DiscoverHead] });
    fixture = TestBed.createComponent(DiscoverHead);
    const defaults: Record<string, unknown> = {
      title: 'Himarë',
      subtitle: '8 of 11 selling today',
      located: false,
      beaches: BEACHES,
      beach: '',
      spelled: false,
      today: TODAY,
      date: TODAY,
      railsShown: true,
      note: null,
      pickerOpen: false,
    };
    for (const [name, value] of Object.entries({ ...defaults, ...inputs })) {
      fixture.componentRef.setInput(name, value);
    }
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

  function rail(name: string): HTMLElement | null {
    return el().querySelector<HTMLElement>(`[role="group"][aria-label="${name}"]`);
  }

  it('is one row: the place over the selling line, the beach chip, the day', () => {
    render();

    expect(text(byTestId('head-title'))).toBe('Himarë');
    expect(text(byTestId('head-subtitle'))).toBe('8 of 11 selling today');
    expect(byTestId('head-located')).toBeNull();
    expect(text(byTestId('head-beaches'))).toBe('⛱ 3');
    expect(text(byTestId('head-day'))).toBe('Today ▾');
  });

  it('wears the located glyph beside the title once the tourist is placed', () => {
    render({ located: true, title: 'Dhërmi' });

    expect(byTestId('head-located')).not.toBeNull();
  });

  it('opens the coast picker from the place, and says whether it is open', () => {
    render();
    const place = byTestId('head-place')!;
    const pressed = vi.fn();
    fixture.componentInstance.placePressed.subscribe(pressed);

    expect(place.getAttribute('aria-expanded')).toBe('false');
    place.click();
    expect(pressed).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('pickerOpen', true);
    fixture.detectChanges();
    expect(place.getAttribute('aria-expanded')).toBe('true');
  });

  it('gathers the region’s beaches into one chip, spelled out where the sheet is wide', () => {
    render();
    const chip = byTestId('head-beaches')!;
    expect(chip.getAttribute('aria-label')).toBe('All 3 beaches: choose one');
    expect(chip.getAttribute('aria-current')).toBeNull();

    fixture.componentRef.setInput('spelled', true);
    fixture.detectChanges();
    expect(text(chip)).toBe('⛱ All beaches 3 ▾');
  });

  it('lights the chip with the beach’s own count when one is chosen', () => {
    render({ beach: 'DHERMI', spelled: true });
    const chip = byTestId('head-beaches')!;

    expect(chip.getAttribute('aria-current')).toBe('true');
    expect(chip.getAttribute('aria-label')).toBe('Dhërmi: change the beach');
    expect(text(chip)).toBe('⛱ Dhërmi 3 ▾');
  });

  it('names the day as a tourist says it: Today, Tomorrow, then the weekday', () => {
    render({ date: '2026-06-16' });
    expect(text(byTestId('head-day'))).toBe('Tomorrow ▾');

    fixture.componentRef.setInput('date', '2026-06-19');
    fixture.detectChanges();
    expect(text(byTestId('head-day'))).toBe('Fri, 19 Jun ▾');

    fixture.componentRef.setInput('date', '2026-08-01');
    fixture.detectChanges();
    expect(text(byTestId('head-day'))).toBe('Sat, 1 Aug ▾');
  });

  it('opens the day rail with the week ahead, today current, and closes it on a pick', () => {
    render();
    const picked = vi.fn();
    fixture.componentInstance.dayPicked.subscribe(picked);
    const day = byTestId('head-day')!;

    day.click();
    fixture.detectChanges();
    expect(day.getAttribute('aria-expanded')).toBe('true');
    const chips = [...rail('Day')!.querySelectorAll('button')];
    expect(chips.map(text)).toEqual([
      'Today',
      'Tomorrow',
      'Wed, 17 Jun',
      'Thu, 18 Jun',
      'Fri, 19 Jun',
      'Sat, 20 Jun',
      'Sun, 21 Jun',
    ]);
    expect(chips[0].getAttribute('aria-current')).toBe('true');

    chips[2].click();
    fixture.detectChanges();
    expect(picked).toHaveBeenCalledWith('2026-06-17');
    expect(rail('Day')).toBeNull();
    expect(day.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the beach rail with All and the region’s beaches, and closes it on a pick', () => {
    render({ beach: 'DHERMI' });
    const picked = vi.fn();
    fixture.componentInstance.beachPicked.subscribe(picked);

    byTestId('head-beaches')!.click();
    fixture.detectChanges();
    const chips = [...rail('Beach')!.querySelectorAll('button')];
    expect(chips.map(text)).toEqual(['All 6', 'Palasë 2', 'Drymades 1', 'Dhërmi 3']);
    expect(chips.map((c) => c.getAttribute('aria-current'))).toEqual([null, null, null, 'true']);

    chips[0].click();
    fixture.detectChanges();
    expect(picked).toHaveBeenCalledWith('');
    expect(rail('Beach')).toBeNull();
  });

  it('opens one rail at a time: the day rail closes the beach rail', () => {
    render();
    byTestId('head-beaches')!.click();
    fixture.detectChanges();
    expect(rail('Beach')).not.toBeNull();

    byTestId('head-day')!.click();
    fixture.detectChanges();
    expect(rail('Beach')).toBeNull();
    expect(rail('Day')).not.toBeNull();
  });

  it('asks for the sheet first when a chip is pressed with the rails hidden (peek)', () => {
    render({ railsShown: false });
    const opened = vi.fn();
    fixture.componentInstance.railOpened.subscribe(opened);

    byTestId('head-day')!.click();
    fixture.detectChanges();
    expect(opened).toHaveBeenCalledTimes(1);
    expect(rail('Day')).toBeNull();

    fixture.componentRef.setInput('railsShown', true);
    fixture.detectChanges();
    expect(rail('Day')).not.toBeNull();
  });

  it('shows the Near me answer in the rail slot as an alert, dismissable, under an open rail', () => {
    render({ note: 'You don’t seem to be on the Albanian riviera — the map hasn’t moved.' });
    const dismissed = vi.fn();
    fixture.componentInstance.noteDismissed.subscribe(dismissed);

    const note = byTestId('head-note')!;
    expect(note.getAttribute('role')).toBe('alert');
    expect(text(note)).toContain('the map hasn’t moved');

    byTestId('head-day')!.click();
    fixture.detectChanges();
    expect(byTestId('head-note')).toBeNull();
    fixture.componentInstance.closeRails();
    fixture.detectChanges();
    expect(byTestId('head-note')).not.toBeNull();

    byTestId('head-note-dismiss')!.click();
    expect(dismissed).toHaveBeenCalledTimes(1);
  });

  it('declares the touch floor on every control', () => {
    render({ note: 'Location permission was declined. The map hasn’t moved.' });
    byTestId('head-day')!.click();
    fixture.detectChanges();
    const controls = [...el().querySelectorAll('button')];
    expect(controls.length).toBeGreaterThan(8);
    for (const control of controls) {
      expect(control.classList.contains('min-h-11'), control.outerHTML).toBe(true);
    }
  });
});
