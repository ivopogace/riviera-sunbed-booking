import { ActivatedRoute, convertToParamMap } from '@angular/router';

import { parentVenueId } from './parent-venue-id';

/**
 * The shared parent-route venue-id guard (#175). A console tab reads `:venueId` from its PARENT
 * route (child routes don't inherit it under `emptyOnly`); a non-numeric or non-positive segment,
 * or no parent, resolves to `undefined` so the caller shows a not-found/invalid state.
 */
describe('parentVenueId', () => {
  function routeWithParent(venueId: string | null): ActivatedRoute {
    const params = venueId === null ? {} : { venueId };
    return { parent: { snapshot: { paramMap: convertToParamMap(params) } } } as unknown as ActivatedRoute;
  }

  it('returns the positive integer id from the parent route', () => {
    expect(parentVenueId(routeWithParent('7'))).toBe(7);
  });

  it('returns undefined for a non-numeric segment', () => {
    expect(parentVenueId(routeWithParent('abc'))).toBeUndefined();
  });

  it('returns undefined for zero or a negative id', () => {
    expect(parentVenueId(routeWithParent('0'))).toBeUndefined();
    expect(parentVenueId(routeWithParent('-3'))).toBeUndefined();
  });

  it('returns undefined when the parent has no venueId', () => {
    expect(parentVenueId(routeWithParent(null))).toBeUndefined();
  });

  it('returns undefined when there is no parent route', () => {
    expect(parentVenueId({} as ActivatedRoute)).toBeUndefined();
  });
});
