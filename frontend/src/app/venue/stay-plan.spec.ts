import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DateRange } from '../shared/booking-date';
import { PlanAnchor, PlanView, SetView } from '../shared/venue-views';
import { StayPlan } from './stay-plan';
import { SetRun } from './stay-runs';

const A1: SetView = {
  id: 1,
  rowLabel: 'A',
  positionNo: 1,
  tier: 'STANDARD',
  pool: 'ONLINE',
  price: { minorUnits: 2500, currency: 'EUR' },
  gridX: 1,
  gridY: 1,
  availability: 'PARTLY_FREE',
  freeDays: 3,
  takenDates: ['2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16'],
};

const PLAN: PlanView = {
  moves: 1,
  stretches: [
    {
      setId: 1,
      rowLabel: 'A',
      positionNo: 1,
      gridX: 1,
      gridY: 1,
      tier: 'STANDARD',
      firstDate: '2026-07-10',
      lastDate: '2026-07-12',
      days: 3,
      pricePerDay: { minorUnits: 2500, currency: 'EUR' },
      amount: { minorUnits: 7500, currency: 'EUR' },
    },
    {
      setId: 5,
      rowLabel: 'B',
      positionNo: 3,
      gridX: 3,
      gridY: 2,
      tier: 'STANDARD',
      firstDate: '2026-07-13',
      lastDate: '2026-07-16',
      days: 4,
      pricePerDay: { minorUnits: 3000, currency: 'EUR' },
      amount: { minorUnits: 12000, currency: 'EUR' },
    },
  ],
  movesBetween: [{ onDate: '2026-07-13', rowsAway: 1, positionsAway: 2, towardSea: false }],
  total: { minorUnits: 19500, currency: 'EUR' },
};

const RUN: SetRun = { set: A1, run: { first: '2026-07-10', last: '2026-07-12', days: 3 } };

@Component({
  imports: [StayPlan],
  template: `<app-stay-plan
    [plan]="plan"
    first="2026-07-10"
    last="2026-07-16"
    [anchor]="anchor()"
    [anchorSet]="anchorSet()"
    [longestRun]="run()"
    (book)="booked = booked + 1"
    (shorten)="shortened.push($event)"
    (dismissed)="closed = closed + 1"
  />`,
})
class Host {
  readonly plan = PLAN;
  readonly anchor = signal<PlanAnchor | null>(null);
  readonly anchorSet = signal<SetView | undefined>(undefined);
  readonly run = signal<SetRun | undefined>(RUN);
  booked = 0;
  closed = 0;
  readonly shortened: DateRange[] = [];
}

describe('StayPlan', () => {
  let fixture: ComponentFixture<Host>;

  function dom(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(testId: string): string {
    return dom()
      .querySelector(`[data-testid="${testId}"]`)!
      .textContent.replaceAll(/\s+/g, ' ')
      .trim();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('names the plan: its moves and spots, the days planned, and why it moves', () => {
    expect(text('stay-plan-kicker')).toBe('1 move · 2 spots');
    expect(dom().querySelector('#stay-plan-title')!.textContent).toContain('Your 7 days, planned');
    expect(text('stay-plan-intro')).toBe(
      'No single spot is free every day, so we chose the fewest moves, then the shortest ones.',
    );
  });

  it('colours the day strip by stretch and bars the move day', () => {
    const cells = dom().querySelectorAll<HTMLElement>('[data-testid="stay-plan-strip"] li');
    expect(cells).toHaveLength(7);
    expect([...cells].map((cell) => cell.dataset['stretch'])).toEqual([
      '0',
      '0',
      '0',
      '1',
      '1',
      '1',
      '1',
    ]);
    expect([...cells].map((cell) => cell.textContent.trim())).toEqual([
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
    ]);
    expect(cells[0].classList.contains('bg-riv-stretch-1-fill')).toBe(true);
    expect(cells[3].classList.contains('bg-riv-stretch-2-fill')).toBe(true);
    expect(cells[3].hasAttribute('data-move')).toBe(true);
    expect(cells[4].hasAttribute('data-move')).toBe(false);
    expect(cells[3].getAttribute('aria-label')).toBe('Mon, 13 Jul: B · spot 3');
  });

  it('lists the stops with each move’s morning and distance, and the money per stop and in total', () => {
    const stops = dom().querySelectorAll('[data-testid="stay-plan-stop"]');
    expect(stops).toHaveLength(2);
    expect(stops[0].textContent).toContain('A · spot 1');
    expect(stops[0].textContent).toContain('3 days');
    expect(stops[0].textContent).toContain('€25/day');
    expect(dom().querySelectorAll('[data-testid="stay-plan-move"]')).toHaveLength(1);
    expect(text('stay-plan-move')).toBe('Move on Mon, 13 Jul: 1 row back, 2 spots along');
    expect(text('stay-plan-price')).toContain('€27.86/day avg · 7 days');
    expect(text('stay-plan-price')).toContain('€195');
  });

  it('offers the longest one-spot run instead of moving, and the ways out', () => {
    expect(text('stay-plan-shorten')).toContain('Prefer not to move?');
    expect(text('stay-plan-shorten')).toContain(
      'A · spot 1 for Fri, 10 Jul – Sun, 12 Jul · 3 days · the longest stay one spot can host.',
    );

    dom().querySelector<HTMLButtonElement>('[data-testid="stay-plan-shorten-cta"]')!.click();
    dom().querySelector<HTMLButtonElement>('[data-testid="stay-plan-book"]')!.click();
    dom().querySelector<HTMLButtonElement>('[data-testid="stay-plan-close"]')!.click();

    expect(fixture.componentInstance.shortened).toEqual([
      { first: '2026-07-10', last: '2026-07-12' },
    ]);
    expect(fixture.componentInstance.booked).toBe(1);
    expect(fixture.componentInstance.closed).toBe(1);

    fixture.componentInstance.run.set(undefined);
    fixture.detectChanges();
    expect(dom().querySelector('[data-testid="stay-plan-shorten"]')).toBeNull();
  });

  it('says how the tapped spot took part in the plan', () => {
    fixture.componentInstance.anchorSet.set(A1);
    fixture.componentInstance.anchor.set('START');
    fixture.detectChanges();
    expect(text('stay-plan-intro')).toContain('Starts at A · spot 1, the spot you picked.');

    fixture.componentInstance.anchor.set('END');
    fixture.detectChanges();
    expect(text('stay-plan-intro')).toContain('Ends at A · spot 1, the spot you picked.');

    fixture.componentInstance.anchor.set('UNANCHORABLE');
    fixture.detectChanges();
    expect(text('stay-plan-intro')).toContain(
      'A · spot 1 couldn’t fit in a plan with 3 moves, so this plan uses other spots.',
    );
  });
});
