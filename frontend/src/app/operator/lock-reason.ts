import { formatCivilDate } from '../shared/booking-date';
import { SetLock } from './operator-console.model';

/**
 * The one home of a locked set's reason, as the editor canvas and the set editor both say it: a
 * guest still coming names the booking ("booked Sat 12 Sep 2026"); with no live booking on the
 * set, a hold from today on can only be a staff walk-in mark ("held by staff …"), because an
 * online hold exists only while its booking is live. Short on purpose — the cell's `title`, its
 * accessible description and the refusal notice all carry it.
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
