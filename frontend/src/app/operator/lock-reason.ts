import { formatCivilDate } from '../shared/booking-date';
import { SetLock } from './operator-console.model';

/**
 * A locked set's short reason, for canvas and set editor: "booked <date>" for a live booking, else
 * "held by staff <date>" — an online hold exists only while its booking is live. Kept short: the
 * cell's `title`, accessible description and refusal notice all carry it.
 */
export function lockReason(lock: SetLock): string {
  if (lock.bookedOn !== null) {
    return `booked ${formatCivilDate(lock.bookedOn)}`;
  }
  if (lock.heldOn !== null) {
    return `held by staff ${formatCivilDate(lock.heldOn)}`;
  }
  return 'held';
}

/** The sentence the cell's accessible description and title carry beside its name. */
export function lockDescription(lock: SetLock): string {
  return `Locked — ${lockReason(lock)}. Can’t be moved or removed; tier and pool can still change.`;
}
