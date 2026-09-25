import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DateRange } from '../shared/booking-date';
import { SetView } from '../shared/venue-views';
import { PartlyFreeSheet } from './partly-free-sheet';

const SET: SetView = {
  id: 3,
  rowLabel: 'Row 2',
  positionNo: 3,
  tier: 'STANDARD',
  pool: 'ONLINE',
  price: { minorUnits: 3500, currency: 'EUR' },
  gridX: 3,
  gridY: 2,
  availability: 'PARTLY_FREE',
  freeDays: 3,
  takenDates: ['2026-07-02'],
};

@Component({
  imports: [PartlyFreeSheet],
  template: `
    <app-partly-free-sheet
      [set]="set()"
      [first]="'2026-06-30'"
      [last]="'2026-07-03'"
      (shorten)="shortened.push($event)"
      (dismissed)="dismissals = dismissals + 1"
    />
  `,
})
class Host {
  readonly set = signal(SET);
  readonly shortened: DateRange[] = [];
  dismissals = 0;
}

describe('PartlyFreeSheet', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  function dom(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function byTestId(testId: string): HTMLElement | null {
    return dom().querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('names the spot, its free-day count and every day of the stay as free or taken', () => {
    expect(dom().querySelector('#partly-free-title')!.textContent).toContain(
      'Row 2 · spot 3 is free 3 of 4 days',
    );
    const days = Array.from(byTestId('partly-free-days')!.querySelectorAll('li'));
    expect(days.map((li) => li.getAttribute('data-free'))).toEqual([
      'true',
      'true',
      'false',
      'true',
    ]);
    expect(days[2].textContent).toContain('taken');
  });

  it('offers the longest free run as a shorter stay and emits it', () => {
    expect(byTestId('partly-free-run')!.textContent).toContain('2 days');
    byTestId('shorten-stay')!.click();

    expect(host.shortened).toEqual([{ first: '2026-06-30', last: '2026-07-01' }]);
  });

  it('opens with focus on the offer, and dismisses on "Keep my dates" and on Escape', () => {
    expect(document.activeElement).toBe(byTestId('shorten-stay'));

    byTestId('keep-dates')!.click();
    dom()
      .querySelector('app-partly-free-sheet')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(host.dismissals).toBe(2);
  });

  it('makes no offer when the set is free on no day', async () => {
    host.set.set({
      ...SET,
      freeDays: 0,
      takenDates: ['2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03'],
    });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(byTestId('shorten-stay')).toBeNull();
    expect(byTestId('partly-free-run')).toBeNull();
  });
});
