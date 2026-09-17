import { Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { idParam, parentVenueId, routeIdParam, venueIdParam } from './parent-venue-id';

/**
 * The rule itself: which URL segments name a venue. It is deliberately narrower than `Number()`,
 * which coerces `7e2` to 700 and `0x10` to 16 — each would alias a venue under a URL that
 * disagrees with it.
 */
describe('idParam — the rule', () => {
  function read(venueId: string | null): number | undefined {
    return idParam(convertToParamMap(venueId === null ? {} : { venueId }), 'venueId');
  }

  it('reads a canonical positive integer', () => {
    expect(read('7')).toBe(7);
    expect(read('1')).toBe(1);
    expect(read('4096')).toBe(4096);
  });

  it('returns undefined for a non-numeric segment', () => {
    expect(read('abc')).toBeUndefined();
  });

  it('returns undefined for zero or a negative id', () => {
    expect(read('0')).toBeUndefined();
    expect(read('-3')).toBeUndefined();
  });

  it.each(['7e2', '0x10', '+7', '7.0', ' 7 ', '007', '99999999999999999999'])(
    'returns undefined for the non-canonical segment %o',
    (segment) => {
      expect(read(segment)).toBeUndefined();
    },
  );

  it('returns undefined when the param is absent', () => {
    expect(read(null)).toBeUndefined();
  });
});

/**
 * The console's two signals. Both are **required**: `venueIdGuard` (`core/venue-id.guard.ts`)
 * redirects a malformed `/operator/:venueId` to the venue-not-found page before anything under it
 * activates, so a console component that reads no valid id is a routing bug, not a user state —
 * it throws rather than rendering an arm nothing can reach (ADR-0023).
 */
describe('parentVenueId — the console-tab case', () => {
  function routeWithParent(venueId: string | null): ActivatedRoute {
    const params = convertToParamMap(venueId === null ? {} : { venueId });
    return {
      parent: { snapshot: { paramMap: params }, paramMap: new BehaviorSubject(params) },
    } as unknown as ActivatedRoute;
  }

  function read(route: ActivatedRoute): Signal<number> {
    return TestBed.runInInjectionContext(() => parentVenueId(route));
  }

  it('returns the positive integer id from the parent route', () => {
    expect(read(routeWithParent('7'))()).toBe(7);
  });

  it('throws, naming the guard, when the parent names no valid venue', () => {
    expect(() => read(routeWithParent('not-a-venue'))()).toThrow(/venueIdGuard/);
    expect(() => read(routeWithParent(null))()).toThrow(/venueIdGuard/);
  });

  it('throws when there is no parent route', () => {
    expect(() => read({ parent: null } as unknown as ActivatedRoute)()).toThrow(/venueIdGuard/);
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
  });
});

describe('venueIdParam — the console-shell case', () => {
  it('reads the id from the given route itself (#180)', () => {
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

  it('throws for a null route', () => {
    expect(() => TestBed.runInInjectionContext(() => venueIdParam(null))()).toThrow(/venueIdGuard/);
  });
});

/**
 * The generic reader stays optional: the tourist beach map's `:id` has no route gate, and it owns
 * its own not-found state.
 */
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

  it('resolves to undefined for a null route', () => {
    expect(TestBed.runInInjectionContext(() => routeIdParam(null, 'id'))()).toBeUndefined();
  });
});
