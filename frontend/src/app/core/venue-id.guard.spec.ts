import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Route, Router, Routes } from '@angular/router';

import { routes } from '../app.routes';
import { OperatorAuth } from './operator-auth';

@Component({ template: '' })
class BlankPage {}

function authStub(signedIn: boolean): OperatorAuth {
  return {
    restoring: signal(false),
    signedIn: signal(signedIn),
    isAdmin: signal(false),
    principalName: signal(signedIn ? 'operator-self' : undefined),
    whenReady: () => Promise.resolve(),
  } as unknown as OperatorAuth;
}

/** The real route, rendered blank all the way down: the guard chain is the subject, not the pages. */
function blank(route: Route): Route {
  const blanked: Route = { ...route };
  delete blanked.loadComponent;
  delete blanked.loadChildren;
  if (route.redirectTo === undefined) {
    blanked.component = BlankPage;
  }
  if (route.children !== undefined) {
    blanked.children = route.children.map(blank);
  }
  return blanked;
}

/**
 * Every real `operator*` entry with its guards and its order intact, plus a blank sign-in
 * destination. Order is load-bearing here: `operator/venue-not-found` is itself a legal
 * `:venueId` segment, so only first-match-wins keeps the guard off its own destination.
 */
function operatorRoutes(): Routes {
  return routes
    .filter((route) => route.path?.startsWith('operator') === true)
    .map(blank)
    .concat([{ path: 'account/sign-in', component: BlankPage }]);
}

describe('venueIdGuard — the route owns :venueId validity (#1127)', () => {
  function configure(signedIn = true): Router {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(operatorRoutes()),
        { provide: OperatorAuth, useValue: authStub(signedIn) },
      ],
    });
    return TestBed.inject(Router);
  }

  it('redirects a malformed :venueId to the venue-not-found page', async () => {
    const router = configure();

    await router.navigateByUrl('/operator/not-a-venue');

    expect(router.url).toBe('/operator/venue-not-found');
  });

  // A tab is named on each, so the child's activation is covered too — not just the shell's.
  it.each(['0', '-3', '1.5', 'not-a-venue', '7e2', ' ', 'NaN'])(
    'rejects the non-positive-integer :venueId %o',
    async (venueId) => {
      const router = configure();

      await router.navigateByUrl(`/operator/${encodeURIComponent(venueId)}/pricing`);

      expect(router.url).toBe('/operator/venue-not-found');
    },
  );

  it('lets a positive-integer :venueId through to its tab', async () => {
    const router = configure();

    await router.navigateByUrl('/operator/7/pricing');

    expect(router.url).toBe('/operator/7/pricing');
  });

  it('does not redirect its own destination', async () => {
    // 'venue-not-found' is a legal :venueId segment: ordered below the param route, this loops.
    const router = configure();

    await router.navigateByUrl('/operator/venue-not-found');

    expect(router.url).toBe('/operator/venue-not-found');
  });

  it('sends a signed-out visitor to sign in for the page, not for the dead link', async () => {
    const router = configure(false);

    await router.navigateByUrl('/operator/not-a-venue/daily');

    expect(router.url).toBe(
      '/account/sign-in?audience=operator&returnUrl=%2Foperator%2Fvenue-not-found',
    );
  });
});
