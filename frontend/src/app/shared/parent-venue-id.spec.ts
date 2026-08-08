import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { parentVenueId, routeIdParam, venueIdParam } from './parent-venue-id';

/**
 * The shared venue-id route-param guard. A console tab reads `:venueId`
 * from its PARENT route (child routes don't inherit it under `emptyOnly`); the shell reads its own
 * route through {@link venueIdParam}. The returned signal tracks in-place param changes — the router
 * reuses the component instance when only the param differs — and a non-numeric or non-positive
 * segment, or no parent, resolves to `undefined` so the caller shows a not-found/invalid state.
 */
describe('parentVenueId', () => {
  function routeWithParent(venueId: string | null): ActivatedRoute {
    const params = convertToParamMap(venueId === null ? {} : { venueId });
    return {
      parent: { snapshot: { paramMap: params }, paramMap: new BehaviorSubject(params) },
    } as unknown as ActivatedRoute;
  }

  function read(route: ActivatedRoute): number | undefined {
    return TestBed.runInInjectionContext(() => parentVenueId(route))();
  }

  it('returns the positive integer id from the parent route', () => {
    expect(read(routeWithParent('7'))).toBe(7);
  });

  it('returns undefined for a non-numeric segment', () => {
    expect(read(routeWithParent('abc'))).toBeUndefined();
  });

  it('returns undefined for zero or a negative id', () => {
    expect(read(routeWithParent('0'))).toBeUndefined();
    expect(read(routeWithParent('-3'))).toBeUndefined();
  });

  it('returns undefined when the parent has no venueId', () => {
    expect(read(routeWithParent(null))).toBeUndefined();
  });

  it('returns undefined when there is no parent route', () => {
    expect(read({ parent: null } as unknown as ActivatedRoute)).toBeUndefined();
  });

  it('re-emits when the parent param changes in place (#180)', () => {
    const params$ = new BehaviorSubject(convertToParamMap({ venueId: '1' }));
    const route = {
      parent: { snapshot: { paramMap: params$.value }, paramMap: params$ },
    } as unknown as ActivatedRoute;
    const id = TestBed.runInInjectionContext(() => parentVenueId(route));

    expect(id()).toBe(1);
    params$.next(convertToParamMap({ venueId: '2' }));
    expect(id()).toBe(2);
    params$.next(convertToParamMap({ venueId: 'foo' }));
    expect(id()).toBeUndefined();
  });
});

describe('venueIdParam', () => {
  it('reads the id from the given route itself (the shell case, #180)', () => {
    const params$ = new BehaviorSubject(convertToParamMap({ venueId: '4' }));
    const route = {
      snapshot: { paramMap: params$.value },
      paramMap: params$,
    } as unknown as ActivatedRoute;
    const id = TestBed.runInInjectionContext(() => venueIdParam(route));

    expect(id()).toBe(4);
    params$.next(convertToParamMap({ venueId: '9' }));
    expect(id()).toBe(9);
  });

  it('resolves to undefined for a null route', () => {
    expect(TestBed.runInInjectionContext(() => venueIdParam(null))()).toBeUndefined();
  });
});

describe('routeIdParam', () => {
  it('reads a non-venueId param name reactively (the tourist :id case, #499)', () => {
    const params$ = new BehaviorSubject(convertToParamMap({ id: '3' }));
    const route = {
      snapshot: { paramMap: params$.value },
      paramMap: params$,
    } as unknown as ActivatedRoute;
    const id = TestBed.runInInjectionContext(() => routeIdParam(route, 'id'));

    expect(id()).toBe(3);
    params$.next(convertToParamMap({ id: '8' }));
    expect(id()).toBe(8);
    params$.next(convertToParamMap({ id: 'abc' }));
    expect(id()).toBeUndefined();
    params$.next(convertToParamMap({ id: '0' }));
    expect(id()).toBeUndefined();
  });
});
