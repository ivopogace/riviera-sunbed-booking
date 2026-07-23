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
      .concat([{ path: 'account/sign-in', component: BlankPage }]);
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
