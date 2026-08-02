import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';

import { routes } from './app.routes';

@Component({ template: '' })
class BlankPage {}

/**
 * The S9 (#277) legacy-route redirects. The three retired auth surfaces keep working for one
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
    // One-release deprecation window, like the auth redirects above: the ?create=1 target keeps
    // the bookmark's CREATE intent for an operator who already owns venues.
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
    // Pre-existing O6 (#176) redirect — re-asserted so the S9 route edits cannot silently drop it.
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
