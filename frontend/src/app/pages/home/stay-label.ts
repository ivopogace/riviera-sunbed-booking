import { pluralOf } from '../../shared/plural';
import { StayVerdictView } from '../../shared/venue-views';

/**
 * A venue's stay verdict as the card says it, in the free count's slot: the same set for every day
 * with how many sets, a stitched plan with how many moves, or why not (the venue's maximum, else the
 * most days in a row one set is free for). One sentence for the card, the row and the pin.
 */
export function stayLabel(stay: StayVerdictView, days: number): string {
  if (stay.verdict === 'SAME_SET') {
    const sets = stay.sameSetCount;
    return pluralOf(
      sets,
      $localize`Same set all ${days}:days: days · ${sets}:count: set`,
      $localize`Same set all ${days}:days: days · ${sets}:count: sets`,
    );
  }
  if (stay.verdict === 'FITS_WITH_MOVES') {
    return pluralOf(
      stay.moves,
      $localize`Fits with ${stay.moves}:count: move · all ${days}:days: days`,
      $localize`Fits with ${stay.moves}:count: moves · all ${days}:days: days`,
    );
  }
  if (stay.maxStayDays !== null && stay.maxStayDays < days) {
    const max = stay.maxStayDays;
    return pluralOf(
      max,
      $localize`Stays of up to ${max}:count: day here`,
      $localize`Stays of up to ${max}:count: days here`,
    );
  }
  const run = stay.longestRunDays;
  if (run === 0) {
    return $localize`Can’t host ${days}:days: days · fully booked`;
  }
  return pluralOf(
    run,
    $localize`Can’t host ${days}:days: days · up to ${run}:count: day in a row`,
    $localize`Can’t host ${days}:days: days · up to ${run}:count: days in a row`,
  );
}
