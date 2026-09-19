/**
 * PROTOTYPE — throwaway. TIME in the fixture: online sales close per venue on the day itself
 * (invariant #4), and that fact is not on a `VenueCard`, so this file invents it deterministically
 * off the venue id — for the head's "8 selling today" and the dusk on pins and rows — and labels
 * the seven days the day chips offer.
 */
import { SalesCloseTime } from '../../shared/venue-views';
import { VenueCard } from '../home/venue-card';

/** The week the day chips offer: today and the six days after it. */
const DAYS_SHOWN = 7;
export interface DayColumn {
  /** ISO civil date. */
  readonly date: string;
  /** `Fri`, `Sat`, … */
  readonly weekday: string;
  /** `18 Sep` */
  readonly label: string;
  readonly isToday: boolean;
  readonly isWeekend: boolean;
}

/** `date` and the six days after it, labelled the way the day chips read them. */
export function daysFrom(date: string, today: string): readonly DayColumn[] {
  return Array.from({ length: DAYS_SHOWN }, (_, offset) => {
    const at = new Date(`${date}T12:00:00Z`);
    at.setUTCDate(at.getUTCDate() + offset);
    const iso = at.toISOString().slice(0, 10);
    const weekday = at.getUTCDay();
    return {
      date: iso,
      weekday: WEEKDAYS[weekday],
      label: `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]}`,
      isToday: iso === today,
      isWeekend: weekday === 0 || weekday === 6,
    };
  });
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * When this venue's online sales for a day close, on that day (invariant #4): the three shipped
 * values, spread so every stretch of the coast has all three — most venues at the 16:00 default,
 * a third selling all day, a few in advance only.
 */
export function salesCloseOf(card: VenueCard): SalesCloseTime {
  const roll = card.id % 5;
  if (roll === 0) return '00:01';
  if (roll === 1 || roll === 3) return '23:59';
  return '16:00';
}

/** The close as minutes after midnight. */
export function closeMinutes(close: SalesCloseTime): number {
  const [h, m] = close.split(':').map(Number);
  return h * 60 + m;
}

/** True when the day's clock is at or past this venue's close: it sells for tomorrow onward only. */
export function closedForTodayAt(card: VenueCard, minutesNow: number): boolean {
  return minutesNow >= closeMinutes(salesCloseOf(card));
}

/** `15:30` → 930. Tolerates `?now=` seeds like `1530`. */
export function parseClock(text: string | null): number | null {
  if (text === null) return null;
  const digits = text.replace(':', '');
  if (!/^\d{3,4}$/.test(digits)) return null;
  const h = Number(digits.slice(0, -2));
  const m = Number(digits.slice(-2));
  return h > 23 || m > 59 ? null : h * 60 + m;
}
