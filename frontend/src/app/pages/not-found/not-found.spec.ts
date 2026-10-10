import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';

import { routes } from '../../app.routes';
import { NotFound } from './not-found';

@Component({ template: '' })
class BlankPage {}

/** The real table's order and nesting with every page blanked and no guards: matching alone. */
function blank(table: Routes): Routes {
  return table.map((route) =>
    route.redirectTo === undefined
      ? {
          path: route.path,
          pathMatch: route.pathMatch,
          component: route.path === '**' ? NotFound : BlankPage,
          ...(route.children ? { children: blank(route.children) } : {}),
        }
      : route,
  );
}

describe('NotFound', () => {
  function render(): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(NotFound);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('says the page does not exist and links back to the beaches', () => {
    const host = render();

    expect(host.querySelector('h1')?.textContent?.trim()).toBe('Page not found');
    const back = host.querySelector('[data-testid="not-found-home"]');
    expect(back?.getAttribute('href')).toBe('/');
    expect(back?.textContent?.trim()).toBe('Back to the beaches');
  });
});

describe('app.routes — an unmatched URL renders the not-found page (#1523)', () => {
  it('matches the wildcard last and keeps the typed URL in the address bar', async () => {
    const wildcard = routes.at(-1)!;
    expect(wildcard.path).toBe('**');
    expect(wildcard.title).toBe('Page not found — Riviera');
    TestBed.configureTestingModule({ providers: [provideRouter(blank(routes))] });
    const router = TestBed.inject(Router);

    for (const url of ['/does-not-exist', '/venues', '/admin/whatever', '/operator/1/nope']) {
      await expect(router.navigateByUrl(url)).resolves.toBe(true);
      expect(router.url).toBe(url);
      expect(router.routerState.snapshot.root.firstChild?.component).toBe(NotFound);
    }
    await router.navigateByUrl('/venues/1');
    expect(router.routerState.snapshot.root.firstChild?.component).toBe(BlankPage);
  });
});
