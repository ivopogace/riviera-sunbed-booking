import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Event, NavigationEnd, NavigationSkipped, Router, provideRouter } from '@angular/router';

import { currentUrl } from './current-url';

@Component({ template: '' })
class BlankPage {}

/**
 * The shared "current URL as a signal" helper: the serialised `finalUrl` of the last successful
 * navigation, so a component reads the settled URL without its own `NavigationEnd` pipe. Only a
 * navigation that completes moves it — a skipped same-URL navigation does not.
 */
describe('currentUrl', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'a', component: BlankPage },
          { path: 'b', component: BlankPage },
        ]),
      ],
    });
  });

  it('is the empty root before any navigation', () => {
    const router = TestBed.inject(Router);
    expect(currentUrl(router)()).toBe('/');
  });

  it('follows each completed navigation, query string included', async () => {
    const router = TestBed.inject(Router);
    const url = currentUrl(router);

    await router.navigate(['/a'], { queryParams: { x: '1' } });
    expect(url()).toBe('/a?x=1');

    await router.navigate(['/b']);
    expect(url()).toBe('/b');
  });

  it('does not change on a same-URL NavigationSkipped', async () => {
    const router = TestBed.inject(Router);
    const url = currentUrl(router);
    await router.navigate(['/a']);
    expect(url()).toBe('/a');

    const events: Event[] = [];
    router.events.subscribe((event) => events.push(event));
    await router.navigate(['/a']);

    expect(events.some((event) => event instanceof NavigationSkipped)).toBe(true);
    expect(events.some((event) => event instanceof NavigationEnd)).toBe(false);
    expect(url()).toBe('/a');
  });
});
