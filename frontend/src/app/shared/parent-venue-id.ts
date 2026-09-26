import { computed, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap } from '@angular/router';

/**
 * A route's `:<param>` positive-integer id as a signal, `undefined` when the route is absent or the
 * segment missing or malformed. Tracks `paramMap`, as the router reuses the component on a
 * param-only navigation (a snapshot would pin the old id); call in an injection context.
 */
export function routeIdParam(
  route: ActivatedRoute | null,
  param: string,
): Signal<number | undefined> {
  if (route === null) {
    return computed(() => undefined);
  }
  const params = toSignal(route.paramMap, { initialValue: route.snapshot.paramMap });
  return computed(() => idParam(params(), param));
}

/**
 * {@link routeIdParam} for the console's `:venueId`, required: `venueIdGuard` redirects a malformed
 * id first, so a missing one is a routing bug and throws (ADR-0023). Tab child routes read the
 * parent's via {@link parentVenueId}: under the default `emptyOnly` they don't inherit the param.
 */
export function venueIdParam(route: ActivatedRoute | null): Signal<number> {
  const id = routeIdParam(route, 'venueId');
  return computed(() => {
    const venueId = id();
    if (venueId === undefined) {
      throw new Error(
        'No valid :venueId on the route. venueIdGuard redirects a malformed one to the ' +
          'venue-not-found page, so a console component never mounts without one.',
      );
    }
    return venueId;
  });
}

/** {@link venueIdParam} against the parent route — the console-tab case. */
export function parentVenueId(route: ActivatedRoute): Signal<number> {
  return venueIdParam(route.parent);
}

/**
 * A canonical decimal positive integer, and nothing else. `Number()` alone is far wider than a
 * URL segment naming a venue: it reads `7e2` as 700, `0x10` as 16, and `+7` / `7.0` / `007` /
 * `' 7 '` all as 7 — each aliasing a venue under a URL that disagrees with it.
 */
const CANONICAL_ID = /^[1-9]\d*$/;

/** The positive-integer id under `param` in `params`, or `undefined` — the rule the signals above apply. */
export function idParam(params: ParamMap, param: string): number | undefined {
  const raw = params.get(param);
  if (raw === null || !CANONICAL_ID.test(raw)) {
    return undefined;
  }
  const id = Number(raw);
  // A segment longer than 2^53 would land on a rounded float, naming a venue it did not spell.
  return Number.isSafeInteger(id) ? id : undefined;
}
