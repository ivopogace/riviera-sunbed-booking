import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { routes } from '../../app.routes';
import { NotFound } from './not-found';

@Component({ template: '' })
class BlankPage {}

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
    // The real table's paths on a blank page, so only matching is under test, not guards or chunks.
    const blanked: typeof routes = routes
      .filter((route) => route.redirectTo === undefined && route.children === undefined)
      .map((route) => ({ path: route.path, component: BlankPage }));
    blanked[blanked.length - 1] = { path: '**', component: NotFound };
    TestBed.configureTestingModule({ providers: [provideRouter(blanked)] });
    const router = TestBed.inject(Router);

    for (const url of ['/does-not-exist', '/venues', '/legal/nope/deeper']) {
      await expect(router.navigateByUrl(url)).resolves.toBe(true);
      expect(router.url).toBe(url);
      expect(router.routerState.snapshot.root.firstChild?.component).toBe(NotFound);
    }
  });
});
