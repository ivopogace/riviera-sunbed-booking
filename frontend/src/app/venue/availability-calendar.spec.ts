import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { DailyAvailability } from '../shared/venue-views';
import { AvailabilityCalendar } from './availability-calendar';

/**
 * The Vitest clock is frozen at Monday 2026-06-15 midday Europe/Tirane, so "tomorrow" is
 * 2026-06-16 and June 2026 is the month the picker opens on unless a spec says otherwise.
 */
const MIN_DATE = '2026-06-16';

@Component({
  imports: [AvailabilityCalendar],
  template: `
    <app-availability-calendar
      [venueId]="venueId()"
      [selectedDate]="selectedDate()"
      [minDate]="minDate()"
      (chosen)="chosen.push($event)"
      (dismissed)="dismissals = dismissals + 1"
    />
  `,
})
class Host {
  readonly venueId = signal(7);
  readonly selectedDate = signal('2026-06-20');
  readonly minDate = signal(MIN_DATE);
  readonly chosen: string[] = [];
  dismissals = 0;
}

describe('AvailabilityCalendar', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let httpMock: HttpTestingController;

  /** The host's rendered DOM, typed — `fixture.nativeElement` is `any`. */
  function dom(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  /** The pending calendar request, matched on path so the window rides in params. */
  function calendarRequest(venueId = 7) {
    return httpMock.expectOne(
      (req) => req.url === `${environment.apiBaseUrl}/api/venues/${venueId}/availability-calendar`,
    );
  }

  /** Answer a calendar request with `free` of `total` on every day of its own window. */
  async function flush(
    request: ReturnType<typeof calendarRequest>,
    free = 20,
    total = 30,
  ): Promise<void> {
    const from = request.request.params.get('from')!;
    const to = request.request.params.get('to')!;
    const days: DailyAvailability[] = [];
    for (let day = new Date(`${from}T00:00:00Z`); ; day.setUTCDate(day.getUTCDate() + 1)) {
      const iso = day.toISOString().slice(0, 10);
      days.push({ date: iso, free, total });
      if (iso === to) break;
    }
    request.flush(days);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  /** Claim and answer the one pending calendar request. */
  async function flushCalendar(free = 20, total = 30, venueId = 7): Promise<void> {
    await flush(calendarRequest(venueId), free, total);
  }

  function dayButton(iso: string): HTMLButtonElement | null {
    return dom().querySelector<HTMLButtonElement>(`button[data-date="${iso}"]`);
  }

  function monthLabel(): string {
    return dom().querySelector<HTMLElement>('[data-testid="calendar-month"]')!.textContent ?? '';
  }

  function control(testId: string): HTMLButtonElement {
    return dom().querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!;
  }

  /** Every element the browser would actually tab to inside the popover, in order. */
  function tabbables(): HTMLElement[] {
    return Array.from(
      dom().querySelectorAll<HTMLElement>('button:not([tabindex="-1"]), [tabindex="0"]'),
    );
  }

  function press(iso: string, key: string, shiftKey = false): void {
    dayButton(iso)!.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
    fixture.detectChanges();
  }

  describe('the month grid', () => {
    it('renders a tint and a capacity bar per day of the visible month', async () => {
      await flushCalendar(15, 30);

      const june = dom().querySelectorAll('button[data-date^="2026-06-"]');
      expect(june).toHaveLength(30);
      expect(dayButton('2026-06-21')!.className).toContain('bg-[#dff0e4]');
      // The chosen day wears the accent instead of a tint (aria-selected lives on its gridcell).
      expect(dayButton('2026-06-20')!.className).toContain('bg-[#085a6e]');
      expect(
        dayButton('2026-06-21')!.querySelector<HTMLElement>('[data-testid="day-bar"]')!.style.width,
      ).toBe('50%');
    });

    it('draws no capacity bar on the chosen day, whose accent its colours cannot read on', async () => {
      await flushCalendar(15, 30);

      const bar = (iso: string) =>
        dayButton(iso)!.querySelector<HTMLElement>('[data-testid="day-bar"]')!.parentElement!;

      expect(bar('2026-06-20').classList.contains('invisible')).toBe(true);
      expect(bar('2026-06-21').classList.contains('invisible')).toBe(false);
    });

    it('draws no capacity bar on a day it cannot read or cannot book', async () => {
      await flushCalendar(15, 30);

      const bar = (iso: string) =>
        dayButton(iso)!.querySelector<HTMLElement>('[data-testid="day-bar"]')!.parentElement!;

      expect(bar('2026-06-01').classList.contains('invisible')).toBe(true);
    });

    it('opens on the month of the selected day', async () => {
      await flushCalendar();

      expect(monthLabel()).toContain('June 2026');
    });

    it('asks only for the visible month, so the server window cap is out of reach', async () => {
      const request = calendarRequest();

      expect(request.request.params.get('from')).toBe('2026-06-01');
      expect(request.request.params.get('to')).toBe('2026-06-30');
      await flush(request);
    });

    it('never requests a window wider than the server cap, in any month it can reach', async () => {
      await flushCalendar();
      press('2026-06-20', 'PageDown');

      const july = calendarRequest();
      const span =
        (Date.parse(`${july.request.params.get('to')}T00:00:00Z`) -
          Date.parse(`${july.request.params.get('from')}T00:00:00Z`)) /
          86_400_000 +
        1;

      expect(span).toBeLessThanOrEqual(62);
      await flush(july);
    });
  });

  describe('month navigation', () => {
    it('refetches for the new month and re-renders', async () => {
      await flushCalendar();

      control('calendar-next').click();
      fixture.detectChanges();
      const july = calendarRequest();

      expect(july.request.params.get('from')).toBe('2026-07-01');
      expect(july.request.params.get('to')).toBe('2026-07-31');
      await flush(july, 0, 30);
      expect(monthLabel()).toContain('July 2026');
      expect(dayButton('2026-07-10')!.className).toContain('bg-[#fae9e9]');
    });

    it('will not step back past the month holding the earliest bookable day', async () => {
      await flushCalendar();
      const previous = control('calendar-prev');

      expect(previous.getAttribute('aria-disabled')).toBe('true');
      previous.click();
      fixture.detectChanges();

      expect(monthLabel()).toContain('June 2026');
    });

    it('drops a stale month response so a slow month cannot repaint a newer one', async () => {
      await flushCalendar();
      press('2026-06-20', 'PageDown');
      const july = calendarRequest();
      press('2026-07-20', 'PageDown');
      const august = calendarRequest();

      august.flush([{ date: '2026-08-10', free: 1, total: 30 }]);
      july.flush([{ date: '2026-07-10', free: 25, total: 30 }]);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(monthLabel()).toContain('August 2026');
      expect(dayButton('2026-08-10')!.className).toContain('bg-[#fdeecc]');
    });
  });

  describe('what a day announces', () => {
    it('carries the exact counts in the accessible name', async () => {
      await flushCalendar(12, 30);

      expect(dayButton('2026-06-20')!.getAttribute('aria-label')).toBe(
        'Sat 20 Jun 2026, 12 of 30 sets free',
      );
    });

    it('announces today and past days as disabled, and refuses to select them', async () => {
      await flushCalendar();

      for (const iso of ['2026-06-15', '2026-06-01']) {
        expect(dayButton(iso)!.getAttribute('aria-disabled')).toBe('true');
        expect(dayButton(iso)!.getAttribute('aria-label')).toContain('not bookable');
        dayButton(iso)!.click();
      }
      fixture.detectChanges();

      expect(host.chosen).toEqual([]);
    });

    it('marks the chosen day as selected', async () => {
      await flushCalendar();

      expect(dayButton('2026-06-20')!.closest('td')!.getAttribute('aria-selected')).toBe('true');
      expect(dayButton('2026-06-21')!.closest('td')!.getAttribute('aria-selected')).toBe('false');
    });

    it('emits the chosen day', async () => {
      await flushCalendar();

      dayButton('2026-06-25')!.click();

      expect(host.chosen).toEqual(['2026-06-25']);
    });
  });

  describe('when the counts cannot be loaded', () => {
    it('degrades to a usable picker rather than an empty one', async () => {
      calendarRequest().flush('boom', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(dom().querySelector('[data-testid="calendar-counts-failed"]')).not.toBeNull();
      expect(dayButton('2026-06-20')!.getAttribute('aria-label')).toBe(
        'Sat 20 Jun 2026, availability unknown',
      );
      expect(dayButton('2026-06-20')!.getAttribute('aria-disabled')).toBeNull();

      dayButton('2026-06-25')!.click();

      expect(host.chosen).toEqual(['2026-06-25']);
    });
  });

  describe('dismissal', () => {
    it('ignores a click inside the panel and dismisses on one outside it', async () => {
      await flushCalendar();

      control('availability-calendar').click();
      expect(host.dismissals).toBe(0);

      dom().querySelector<HTMLElement>('app-availability-calendar')!.click();
      expect(host.dismissals).toBe(1);
    });
  });

  describe('keyboard', () => {
    /** The day the roving tabindex is on — the only cell in the grid's tab order. */
    function focused(): string | null {
      return (
        dom().querySelector('button[data-date][tabindex="0"]')?.getAttribute('data-date') ?? null
      );
    }

    it('opens with the roving tabindex on the chosen day', async () => {
      await flushCalendar();

      expect(focused()).toBe('2026-06-20');
      expect(dom().ownerDocument.activeElement?.getAttribute('data-date')).toBe('2026-06-20');
    });

    it('opens on the earliest bookable day when the chosen one is already past', async () => {
      host.selectedDate.set('2026-06-02');
      fixture.detectChanges();
      await flushCalendar();

      expect(focused()).toBe(MIN_DATE);
    });

    it('moves by a day with left and right', async () => {
      await flushCalendar();

      press('2026-06-20', 'ArrowRight');
      expect(focused()).toBe('2026-06-21');

      press('2026-06-21', 'ArrowLeft');
      expect(focused()).toBe('2026-06-20');
    });

    it('moves by a week with up and down', async () => {
      await flushCalendar();

      press('2026-06-20', 'ArrowDown');
      expect(focused()).toBe('2026-06-27');

      press('2026-06-27', 'ArrowUp');
      expect(focused()).toBe('2026-06-20');
    });

    it('moves to the week bounds with Home and End', async () => {
      await flushCalendar();

      // 2026-06-20 is a Saturday; its week runs Monday 15th to Sunday 21st.
      press('2026-06-20', 'Home');
      expect(focused()).toBe('2026-06-15');

      press('2026-06-15', 'End');
      expect(focused()).toBe('2026-06-21');
    });

    it('leaves focus on the month-nav button so a second press steps a second month', async () => {
      await flushCalendar();
      const next = control('calendar-next');
      next.focus();

      next.click();
      fixture.detectChanges();
      await flush(calendarRequest());

      // APG: the nav button keeps focus; throwing it into the grid would cost a re-tab per month.
      expect(dom().ownerDocument.activeElement).toBe(next);
      expect(monthLabel()).toContain('July 2026');

      next.click();
      fixture.detectChanges();
      await flush(calendarRequest());

      expect(dom().ownerDocument.activeElement).toBe(next);
      expect(monthLabel()).toContain('August 2026');
    });

    it('moves by a month with PageUp and PageDown, refetching each time', async () => {
      await flushCalendar();

      press('2026-06-20', 'PageDown');
      const july = calendarRequest();
      expect(july.request.params.get('from')).toBe('2026-07-01');
      await flush(july);
      expect(focused()).toBe('2026-07-20');

      press('2026-07-20', 'PageUp');
      await flush(calendarRequest());
      expect(focused()).toBe('2026-06-20');
    });

    it('moves by a year with Shift+PageUp and Shift+PageDown', async () => {
      await flushCalendar();

      press('2026-06-20', 'PageDown', true);
      await flush(calendarRequest());

      expect(focused()).toBe('2027-06-20');
      expect(monthLabel()).toContain('June 2027');
    });

    it('carries focus across a month boundary by arrow alone', async () => {
      await flushCalendar();

      press('2026-06-20', 'ArrowDown');
      press('2026-06-27', 'ArrowDown');
      await flush(calendarRequest());

      expect(focused()).toBe('2026-07-04');
    });

    it('reaches a day it cannot book, and announces it rather than skipping it', async () => {
      await flushCalendar();

      press('2026-06-20', 'Home');
      expect(focused()).toBe('2026-06-15');
      expect(dayButton('2026-06-15')!.getAttribute('aria-disabled')).toBe('true');
    });

    it('leaves keys it does not own to the browser', async () => {
      await flushCalendar();
      const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });

      dayButton('2026-06-20')!.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(focused()).toBe('2026-06-20');
    });

    it('announces the month change from a live region', async () => {
      await flushCalendar();
      const label = dom().querySelector<HTMLElement>('[data-testid="calendar-month"]')!;

      expect(label.getAttribute('aria-live')).toBe('polite');

      press('2026-06-20', 'PageDown');
      await flush(calendarRequest());

      expect(label.textContent).toContain('July 2026');
    });

    it('traps focus inside the popover, wrapping past the last control', async () => {
      await flushCalendar();
      const controls = tabbables();
      const last = controls[controls.length - 1];
      last.focus();
      const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });

      last.dispatchEvent(tab);

      expect(tab.defaultPrevented).toBe(true);
      expect(dom().ownerDocument.activeElement).toBe(controls[0]);
    });

    it('wraps backwards from the first control on Shift+Tab', async () => {
      await flushCalendar();
      const controls = tabbables();
      const first = controls[0];
      first.focus();
      const tab = new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });

      first.dispatchEvent(tab);

      expect(tab.defaultPrevented).toBe(true);
      expect(dom().ownerDocument.activeElement).toBe(controls[controls.length - 1]);
    });

    it('dismisses on Escape, leaving the restore to the opener', async () => {
      await flushCalendar();

      dayButton('2026-06-20')!.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );

      expect(host.dismissals).toBe(1);
    });
  });
});
