/**
 * PROTOTYPE — throwaway. Round 3 adds TIME to the fixture: availability is per set per date
 * (invariant #2) and online sales close per venue on the day itself (invariant #4), and neither
 * fact is on a `VenueCard`, which carries one date's answer. So this file invents both,
 * deterministically off the venue id, for the two instruments that need them: H's tide table
 * (the coast, day by day) and J's sundial (today, hour by hour).
 *
 * <p>Nothing here validates a shape: the real numbers come from `/api/venues?date=` one date at a
 * time, and a week at once is a new read the backend does not have yet — one of round 3's costs.
 */
import { SalesCloseTime } from '../../shared/venue-views';
import { VenueCard } from '../home/venue-card';

/** The week the tide table shows: today and the six days after it. */
export const DAYS_SHOWN = 7;

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

/** `date` and the six days after it, labelled the way the tide table's rail reads them. */
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
 * How many of a venue's sets are free on `date`. The card's own `free` is today's answer; every
 * later day drifts from it — weekends sell out faster, the far end of the week is mostly open —
 * with a per-(venue, day) wobble so no two venues share a curve.
 */
export function freeOn(card: VenueCard, date: string, today: string): number {
  if (date === today) {
    return card.free;
  }
  const offset = dayOffset(today, date);
  const at = new Date(`${date}T12:00:00Z`).getUTCDay();
  const weekend = at === 0 || at === 6 ? 0.4 : 1;
  const ahead = Math.min(1, 0.3 + offset * 0.14);
  const wobble = 0.6 + 0.8 * noise(card.id * 31 + offset * 7);
  return Math.max(0, Math.min(card.total, Math.round(card.total * ahead * weekend * wobble)));
}

function dayOffset(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** A stable 0…1 for an integer key. */
function noise(key: number): number {
  let t = (key + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

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

/** The close as minutes after midnight, for the sundial's arithmetic. */
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

/** 930 → `15:30`. */
export function clockLabel(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
