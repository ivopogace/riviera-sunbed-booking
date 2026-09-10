import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';

import { routes } from './app.routes';

@Component({ template: '' })
class BlankPage {}

/**
 * The legacy-route redirects. The three retired auth surfaces keep working for one
 * release by forwarding into the unified card with the right tab preselected — a bookmark or an
 * already-sent email must not 404.
 */
describe('app.routes — retired auth surfaces', () => {
  let router: Router;

  beforeEach(() => {
    // A blank destination: this asserts the redirect TARGET, not that the real page boots.
    const redirectRoutes: Routes = routes
      .filter((route) => route.redirectTo !== undefined)
      .concat([
        { path: 'account/sign-in', component: BlankPage },
        { path: 'operator', component: BlankPage },
      ]);
    TestBed.configureTestingModule({ providers: [provideRouter(redirectRoutes)] });
    router = TestBed.inject(Router);
  });

  it('forwards /account/register into the card in register mode', async () => {
    await router.navigateByUrl('/account/register');
    expect(router.url).toBe('/account/sign-in?mode=register');
  });

  it('forwards /operator/register into the operator tab in register mode', async () => {
    await router.navigateByUrl('/operator/register');
    expect(router.url).toBe('/account/sign-in?audience=operator&mode=register');
  });

  it('forwards retired /venue-admin into the operator home in create mode (#278)', async () => {
    // One-release window like the auth redirects above; ?create=1 keeps the bookmark's create intent.
    await router.navigateByUrl('/venue-admin');
    expect(router.url).toBe('/operator?create=1');
  });

  it('registers the two lazy legal routes with titles (#101 Slice 3)', () => {
    // Config-level pin: the real render + axe pass is the e2e's job (legal-pages.e2e.ts).
    const privacy = routes.find((route) => route.path === 'legal/privacy');
    const terms = routes.find((route) => route.path === 'legal/terms');
    expect(privacy?.loadComponent).toBeDefined();
    expect(privacy?.title).toBe('Privacy policy — Riviera');
    expect(terms?.loadComponent).toBeDefined();
    expect(terms?.title).toBe('Terms of service — Riviera');
  });

  it('keeps forwarding the retired staff-daily deep link to the console tab', async () => {
    // Pre-existing staff-daily redirect — re-asserted so later route edits cannot silently drop it.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          routes
            .filter((route) => route.redirectTo !== undefined)
            .concat([{ path: 'operator/:venueId/daily', component: BlankPage }]),
        ),
      ],
    });
    const scoped = TestBed.inject(Router);

    await scoped.navigateByUrl('/venue-admin/daily/12');
    expect(scoped.url).toBe('/operator/12/daily');
  });
});

/**
 * Where a chosen venue opens. Every entry into a console without a tab named — the `/operator`
 * picker's rows, the one-venue landing, the switcher's rows off the console, a bookmarked
 * `/operator/:venueId` — resolves through the console's index redirect, so this one assertion
 * covers them all. The tab it lands on is `shared/console-destination.ts`'s landing tab.
 */
describe('app.routes — the venue console opens on the Daily view', () => {
  it('forwards a venue with no tab named to its Daily view tab', async () => {
    const console = routes.find((route) => route.path === 'operator/:venueId')!;
    // The real index child on a blank tab, and no guard: the redirect is what is under test.
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: console.path,
            component: BlankPage,
            children: [
              ...(console.children ?? []).filter((child) => child.redirectTo !== undefined),
              { path: 'daily', component: BlankPage },
            ],
          },
        ]),
      ],
    });
    const scoped = TestBed.inject(Router);

    await scoped.navigateByUrl('/operator/12');
    expect(scoped.url).toBe('/operator/12/daily');
  });
});

describe('app.routes — every lazy route target resolves its module', () => {
  /**
   * SonarCloud/V8 coverage only counts a lazy target's import lines as covered once its
   * dynamic import() actually resolves — a spec that merely imports `routes` (five do)
   * registers the chunk boundary with every line at 0 hits. This walk resolves every
   * loadComponent target in the real table, including the two nested tab-route trees, so a
   * new lazy route gets this for free with no per-component deep-link spec.
   */
  async function loadedComponentNames(routeList: Routes): Promise<string[]> {
    const names: string[] = [];
    for (const route of routeList) {
      if (route.loadComponent) {
        const load = route.loadComponent as () => Promise<{ name: string }>;
        const component = await load();
        names.push(component.name);
      }
      if (route.children) {
        names.push(...(await loadedComponentNames(route.children)));
      }
    }
    return names;
  }

  it('resolves all 33 loadComponent targets, including the nested tab-route trees (#999)', async () => {
    const names = await loadedComponentNames(routes);
    expect(names).toHaveLength(33);
    expect(names.every((name) => name.length > 0)).toBe(true);
  });
});

describe('app.routes — the phone tab bar reads its section and checkout flag off route data (#1003)', () => {
  /** Which bottom tab a tourist route belongs to; `undefined` for a route the bar never lights. */
  const SECTIONS: Record<string, 'beaches' | 'bookings' | 'account' | undefined> = {
    '': 'beaches',
    'venues/:id': 'beaches',
    'my-bookings': 'bookings',
    'booking/confirmation': 'bookings',
    'booking/pay': 'bookings',
    'booking/requested': 'bookings',
    'booking/:code': 'bookings',
    'account/sign-in': 'account',
    'account/forgot': 'account',
    'account/reset': 'account',
    'account/verify': 'account',
    'account/password': 'account',
    'legal/privacy': undefined,
    'legal/terms': undefined,
    'account/operator-password': undefined,
    operator: undefined,
    admin: undefined,
    'operator/:venueId': undefined,
  };

  it('carries the tab-bar section on every tourist route and on no other', () => {
    for (const [path, section] of Object.entries(SECTIONS)) {
      const route = routes.find((r) => r.path === path && r.redirectTo === undefined);
      expect(route, `route '${path}'`).toBeDefined();
      expect(route?.data?.['section'], `route '${path}' section`).toBe(section);
    }
  });

  it('hides the tab bar on booking/pay and nowhere else', () => {
    const chromeless = routes.filter((r) => r.data?.['tabBar'] === false).map((r) => r.path);
    expect(chromeless).toEqual(['booking/pay']);
  });
});
