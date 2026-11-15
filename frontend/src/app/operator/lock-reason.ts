import { formatCivilDate } from '../shared/booking-date';
import { SetLock } from './operator-console.model';

/**
 * A locked set's short reason, for canvas and set editor: "booked <first> – <last>" for the span
 * its live bookings hold (one day names the day alone), else "held by staff <date>" — an online
 * hold exists only while its booking is live. Kept short: title, description and notice carry it.
 */
export function lockReason(lock: SetLock): string {
  if (lock.bookedOn !== null) {
    const span = bookedSpan(lock.bookedOn, lock.bookedUntil ?? lock.bookedOn);
    return $localize`:Why a beach-map set is locked; span is a date or a date range:booked ${span}:span:`;
  }
  if (lock.heldOn !== null) {
    const date = formatCivilDate(lock.heldOn);
    return $localize`:Why a beach-map set is locked; staff hold it on that date:held by staff ${date}:date:`;
  }
  return $localize`:Why a beach-map set is locked, no date known:held`;
}

function bookedSpan(first: string, last: string): string {
  return first === last
    ? formatCivilDate(first)
    : `${formatCivilDate(first)} – ${formatCivilDate(last)}`;
}

/** The sentence the cell's accessible description and title carry beside its name. */
export function lockDescription(lock: SetLock): string {
  const reason = lockReason(lock);
  return $localize`:Accessible description of a locked beach-map set:Locked — ${reason}:reason:. Can’t be moved or removed; tier and pool can still change.`;
}
