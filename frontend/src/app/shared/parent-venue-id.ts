import { ActivatedRoute } from '@angular/router';

/**
 * The venue id from the operator console's parent route (`/operator/:venueId`), or `undefined` when
 * the segment is missing or not a positive integer.
 *
 * <p>Console tab child routes do NOT inherit the parent's params under the router's default
 * `emptyOnly` strategy (the O1 review finding), so a tab reads `:venueId` from `route.parent`, not
 * its own snapshot. Extracted at O5 (#175) as the third consumer of this exact guard, after the
 * layout editor and the pricing tab.
 */
export function parentVenueId(route: ActivatedRoute): number | undefined {
  const id = Number(route.parent?.snapshot.paramMap.get('venueId'));
  return Number.isInteger(id) && id > 0 ? id : undefined;
}
