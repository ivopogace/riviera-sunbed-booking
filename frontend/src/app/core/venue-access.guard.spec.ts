import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Route, Router, Routes } from '@angular/router';

import { environment } from '../../environments/environment';
import { routes } from '../app.routes';
import { VenueMapView } from '../shared/venue-views';
import { ConsoleVenueMap } from './console-venue-map';
import { OperatorAuth } from './operator-auth';

const NOT_FOUND = '/operator/venue-not-found';
const OWNED = 7;
const REFUSED = 999;

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

/** Every real `operator*` entry with its guards and their order intact, plus a blank sign-in destination. */
function operatorRoutes(): Routes {
  return routes
    .filter((route) => route.path?.startsWith('operator') === true)
    .map(blank)
    .concat([{ path: 'account/sign-in', component: BlankPage }]);
}

function mapUrl(venueId: number): string {
  return `${environment.apiBaseUrl}/api/venues/${venueId}/beach-map`;
}

function venueMap(id: number, name = 'Miramar Beach Club'): VenueMapView {
  return {
    id,
    name,
    beach: 'KSAMIL',
    region: 'SARANDE',
    description: 'Loungers on the shore.',
    ratingTenths: 48,
    reviewsCount: 12,
    bookingMode: 'INSTANT',
    fromPrice: null,
    sets: [],
  };
}

function refuse(status: number, code: string): (request: TestRequest) => void {
  return (request) => request.flush({ code }, { status, statusText: 'Refused' });
}

/**
 * The gate behind a well-formed `/operator/:venueId`: the owner's beach-map read decides whether the
 * venue is this operator's. Driven through the real route table, so the guard order and the
 * redirect's destination are the ones `app.routes.ts` ships.
 */
describe('venueAccessGuard — the owner’s read decides the venue, one page for its refusal (#1526)', () => {
  let http: HttpTestingController;

  function configure(signedIn = true): Router {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter(operatorRoutes()),
        { provide: OperatorAuth, useValue: authStub(signedIn) },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(Router);
  }

  /** Start the navigation, answer the one owner's read it fires for `venueId`, and let it settle. */
  async function navigateAnswering(
    router: Router,
    url: string,
    venueId: number,
    answer: (request: TestRequest) => void,
  ): Promise<void> {
    const navigation = router.navigateByUrl(url);
    // The guard subscribes after awaiting the session restore, so the read is one macrotask away.
    await new Promise((resolve) => setTimeout(resolve, 0));
    answer(http.expectOne(mapUrl(venueId)));
    await navigation;
  }

  afterEach(() => http.verify());

  it.each([
    [403, 'NOT_VENUE_OWNER'],
    [404, 'NO_SUCH_VENUE'],
  ])(
    'a %i %s on the owner’s read lands on the venue-not-found page, and says no more',
    async (status, code) => {
      const router = configure();

      await navigateAnswering(router, `/operator/${REFUSED}/daily`, REFUSED, refuse(status, code));

      // The exact URL, both outcomes alike: nothing in the address says which it was (invariant #13).
      expect(router.url).toBe(NOT_FOUND);
    },
  );

  it('activates the console when the read succeeds, and the shell’s own ask replays the primed snapshot', async () => {
    const router = configure();

    await navigateAnswering(router, `/operator/${OWNED}/pricing`, OWNED, (request) =>
      request.flush({ map: venueMap(OWNED, 'Primed'), locks: [] }),
    );

    expect(router.url).toBe(`/operator/${OWNED}/pricing`);
    let replayed: string | undefined;
    TestBed.inject(ConsoleVenueMap)
      .load(OWNED)
      .subscribe((map) => (replayed = map.name));
    expect(replayed).toBe('Primed');
    http.expectNone(mapUrl(OWNED));
  });

  it.each([
    ['a 5xx', (request: TestRequest) => request.flush('down', { status: 503, statusText: 'Down' })],
    ['a network failure', (request: TestRequest) => request.error(new ProgressEvent('error'))],
    ['a lost session (401)', refuse(401, 'UNAUTHENTICATED')],
  ])(
    'keeps today’s console on %s — the tabs’ retry and session-lost paths still own it',
    async (_, answer) => {
      const router = configure();

      await navigateAnswering(router, `/operator/${OWNED}/daily`, OWNED, answer);

      expect(router.url).toBe(`/operator/${OWNED}/daily`);
    },
  );

  it('redirects an in-place switch from an owned venue to a refused one', async () => {
    // The router reuses the console on a param-only change; the guard re-runs on it (`paramsChange`).
    const router = configure();
    await navigateAnswering(router, `/operator/${OWNED}/daily`, OWNED, (request) =>
      request.flush({ map: venueMap(OWNED), locks: [] }),
    );
    expect(router.url).toBe(`/operator/${OWNED}/daily`);

    await navigateAnswering(
      router,
      `/operator/${REFUSED}/daily`,
      REFUSED,
      refuse(403, 'NOT_VENUE_OWNER'),
    );

    expect(router.url).toBe(NOT_FOUND);
  });

  it('reads nothing for a malformed id — venueIdGuard’s redirect stands', async () => {
    const router = configure();

    await router.navigateByUrl('/operator/not-a-venue/daily');

    expect(router.url).toBe(NOT_FOUND);
    http.expectNone(() => true);
  });

  it('reads nothing for a signed-out visitor — operatorSessionGuard’s redirect stands', async () => {
    const router = configure(false);

    await router.navigateByUrl(`/operator/${OWNED}/daily`);

    expect(router.url).toBe(
      `/account/sign-in?audience=operator&returnUrl=%2Foperator%2F${OWNED}%2Fdaily`,
    );
    http.expectNone(() => true);
  });
});
