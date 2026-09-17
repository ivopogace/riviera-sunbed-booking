import { computed, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap } from '@angular/router';

/**
 * The positive-integer id carried by a route's `:<param>` segment as a signal, or a signal of
 * `undefined` when the route is absent or the segment is missing / not a positive integer.
 *
 * <p>Reactive: the router REUSES a component instance when only the param changes (an
 * in-app `/operator/1/…` → `/operator/2/…` navigation), so a constructor snapshot read would pin
 * the component to the old venue. The signal tracks `paramMap`, mirroring the `booking-view`
 * `paramMap` reload. Must be called in an injection context (a field initializer or
 * constructor). Works for any param name (e.g. the tourist map's `:id`).
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
 * {@link routeIdParam} for the operator console's `:venueId`, **required**. The console page reads
 * its OWN route; console tab child routes read the PARENT route via {@link parentVenueId} — child
 * routes do not inherit the param under the router's default `emptyOnly` strategy. (The app shell
 * takes the id off its route walk with {@link idParam}, which stays optional: most routes name no
 * venue.)
 *
 * <p>Required because the route decides: `venueIdGuard` (`core/venue-id.guard.ts`) redirects a
 * malformed `/operator/:venueId` to the venue-not-found page before anything under it activates.
 * A console component reading no valid id is therefore a routing bug — it throws, rather than
 * returning `undefined` for an arm no operator can reach (ADR-0023).
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
