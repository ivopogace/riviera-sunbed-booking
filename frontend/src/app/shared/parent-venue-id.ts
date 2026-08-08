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
  return computed(() => toId(params(), param));
}

/**
 * {@link routeIdParam} for the operator console's `:venueId`. The console shell reads its OWN
 * route; console tab child routes read the PARENT route via {@link parentVenueId} — child routes
 * do not inherit the param under the router's default `emptyOnly` strategy.
 */
export function venueIdParam(route: ActivatedRoute | null): Signal<number | undefined> {
  return routeIdParam(route, 'venueId');
}

/** {@link venueIdParam} against the parent route — the console-tab case. */
export function parentVenueId(route: ActivatedRoute): Signal<number | undefined> {
  return venueIdParam(route.parent);
}

function toId(params: ParamMap, param: string): number | undefined {
  const id = Number(params.get(param));
  return Number.isInteger(id) && id > 0 ? id : undefined;
}
