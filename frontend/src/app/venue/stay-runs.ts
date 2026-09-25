import { addDays, daysBetween } from '../shared/booking-date';
import { SetView } from '../shared/venue-views';

/** A run of consecutive free days inside a stay, first to last inclusive. */
export interface FreeRun {
  readonly first: string;
  readonly last: string;
  readonly days: number;
}

/** A set and the longest run of the stay it can host. */
export interface SetRun {
  readonly set: SetView;
  readonly run: FreeRun;
}

/** Every day of the stay, first to last. */
export function stayDays(first: string, last: string): string[] {
  const days: string[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/** The days a set is free on, given the days it is taken on. */
export function freeDaysOf(set: SetView, dayCount: number): number {
  if (set.freeDays !== undefined) {
    return set.freeDays;
  }
  return set.availability === 'FREE' ? dayCount : 0;
}

/**
 * The stay split around `takenDates` into runs of free days, in order — what a partly-free set can
 * host without a move. Empty when every day is taken.
 */
export function freeRuns(takenDates: readonly string[], first: string, last: string): FreeRun[] {
  const taken = new Set(takenDates);
  const runs: FreeRun[] = [];
  let start: string | undefined;
  let end: string | undefined;
  for (const day of stayDays(first, last)) {
    if (taken.has(day)) {
      if (start !== undefined && end !== undefined) {
        runs.push({ first: start, last: end, days: daysBetween(start, end) });
      }
      start = undefined;
      end = undefined;
    } else {
      start ??= day;
      end = day;
    }
  }
  if (start !== undefined && end !== undefined) {
    runs.push({ first: start, last: end, days: daysBetween(start, end) });
  }
  return runs;
}

/** The longest of {@link freeRuns}, the earliest on a tie; undefined when no day is free. */
export function longestFreeRun(
  takenDates: readonly string[],
  first: string,
  last: string,
): FreeRun | undefined {
  return freeRuns(takenDates, first, last).reduce<FreeRun | undefined>(
    (best, run) => (best === undefined || run.days > best.days ? run : best),
    undefined,
  );
}

/**
 * Among the online sets, the one whose longest free run is longest — the shorter stay the venue can
 * still host on one spot when no set is free for every day. Ties go to the earlier run, then to map
 * order. Undefined when no online set has a free day.
 */
export function longestRunAcross(
  sets: readonly SetView[],
  first: string,
  last: string,
): SetRun | undefined {
  let best: SetRun | undefined;
  for (const set of sets) {
    if (set.pool !== 'ONLINE' || set.availability === 'TAKEN') {
      continue;
    }
    const run = longestFreeRun(set.takenDates ?? [], first, last);
    if (run === undefined) {
      continue;
    }
    if (
      best === undefined ||
      run.days > best.run.days ||
      (run.days === best.run.days && run.first < best.run.first)
    ) {
      best = { set, run };
    }
  }
  return best;
}
