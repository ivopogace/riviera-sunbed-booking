import { formatCivilDate } from '../shared/booking-date';
import { SetLock } from './operator-console.model';

/**
 * A locked set's short reason, for canvas and set editor: "booked <first> – <last>" for the span
 * its live bookings hold (one day names the day alone), else "held by staff <date>" — an online
 * hold exists only while its booking is live. Kept short: title, description and notice carry it.
 */
export function lockReason(lock: SetLock): string {
  if (lock.bookedOn !== null) {
    return `booked ${bookedSpan(lock.bookedOn, lock.bookedUntil ?? lock.bookedOn)}`;
  }
  if (lock.heldOn !== null) {
    return `held by staff ${formatCivilDate(lock.heldOn)}`;
  }
  return 'held';
}

function bookedSpan(first: string, last: string): string {
  return first === last
    ? formatCivilDate(first)
    : `${formatCivilDate(first)} – ${formatCivilDate(last)}`;
}

/** The sentence the cell's accessible description and title carry beside its name. */
export function lockDescription(lock: SetLock): string {
  return `Locked — ${lockReason(lock)}. Can’t be moved or removed; tier and pool can still change.`;
}
