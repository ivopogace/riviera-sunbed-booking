import { plural } from '../../shared/plural';
import { StayVerdictView } from '../../shared/venue-views';

/**
 * A venue's stay verdict as the card says it, in the free count's slot: the same set for every day
 * with how many sets, or why not — the venue's maximum when that is the reason, else the most days
 * in a row one set is free for. One sentence for the card, the row and the pin, so they agree.
 */
export function stayLabel(stay: StayVerdictView, days: number): string {
  if (stay.verdict === 'SAME_SET') {
    return `Same set all ${days} days · ${plural(stay.sameSetCount, 'set')}`;
  }
  if (stay.maxStayDays !== null && stay.maxStayDays < days) {
    return `Stays of up to ${plural(stay.maxStayDays, 'day')} here`;
  }
  return stay.longestRunDays === 0
    ? `Can’t host ${days} days · fully booked`
    : `Can’t host ${days} days · up to ${plural(stay.longestRunDays, 'day')} in a row`;
}
