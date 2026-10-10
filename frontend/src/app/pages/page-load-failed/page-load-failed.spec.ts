import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationError, provideRouter, Router, Routes } from '@angular/router';

import { routes } from '../../app.routes';
import { ChunkLoadRecovery, PAGE_LOAD_FAILED_PATH } from '../../core/chunk-load-recovery';
import { PageReload } from '../../core/page-reload';
import { PageLoadFailed } from './page-load-failed';

@Component({ template: '' })
class BlankPage {}

class RecordingReload extends PageReload {
  readonly urls: string[] = [];
  to(url: string): void {
    this.urls.push(url);
  }
}

describe('PageLoadFailed', () => {
  let reload: RecordingReload;

  function render(): { host: HTMLElement; detect: () => void } {
    reload = new RecordingReload();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: PageReload, useValue: reload }],
    });
    const fixture = TestBed.createComponent(PageLoadFailed);
    fixture.detectChanges();
    return { host: fixture.nativeElement as HTMLElement, detect: () => fixture.detectChanges() };
  }

  it('names the failure, offers a retry and links back to the beaches', () => {
    const { host } = render();

    expect(host.querySelector('h1')?.textContent?.trim()).toBe('Couldn’t load this page');
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="page-load-failed-retry"]')).not.toBeNull();
    const back = host.querySelector('[data-testid="page-load-failed-home"]');
    expect(back?.getAttribute('href')).toBe('/');
    expect(back?.textContent?.trim()).toBe('Back to the beaches');
  });

  it('"Try again" loads the URL whose chunk failed as a fresh document', () => {
    const { host, detect } = render();
    const recovery = TestBed.inject(ChunkLoadRecovery);
    recovery.recover(new NavigationError(3, '/my-bookings', chunkError()));
    reload.urls.length = 0;
    recovery.reloading.set(false);
    detect();

    host.querySelector<HTMLButtonElement>('[data-testid="page-load-failed-retry"]')!.click();
    detect();

    expect(reload.urls).toEqual(['/my-bookings']);
    expect(host.querySelector('[data-testid="page-load-failed"]')).toBeNull();
    expect(host.querySelector('[data-testid="page-load-failed-reloading"]')?.textContent).toContain(
      'Loading this page again',
    );
  });
});

function chunkError(): TypeError {
  return new TypeError('Failed to fetch dynamically imported module: http://x/chunk-A.js');
}

/** The real table's order with every lazy page blanked and no guards: the one eager route is the subject. */
function blank(table: Routes): Routes {
  return table.map((route) =>
    route.redirectTo === undefined
      ? {
          path: route.path,
          pathMatch: route.pathMatch,
          component: route.component ?? BlankPage,
          ...(route.children ? { children: blank(route.children) } : {}),
        }
      : route,
  );
}

describe('app.routes — the page-load-failed route is eager and sits before the wildcard (#1543)', () => {
  it('is the one route with a static component, right before **', () => {
    const eager = routes.filter((route) => route.component !== undefined);

    expect(eager.map((route) => route.path)).toEqual([PAGE_LOAD_FAILED_PATH]);
    expect(eager[0].component).toBe(PageLoadFailed);
    expect(eager[0].title).toBe('Couldn’t load this page — Riviera');
    expect(routes.at(-2)).toBe(eager[0]);
    expect(routes.at(-1)?.path).toBe('**');
  });

  it('matches its own path ahead of the wildcard', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(blank(routes)),
        { provide: PageReload, useValue: new RecordingReload() },
      ],
    });
    const router = TestBed.inject(Router);

    await expect(router.navigateByUrl(`/${PAGE_LOAD_FAILED_PATH}`)).resolves.toBe(true);

    expect(router.routerState.snapshot.root.firstChild?.component).toBe(PageLoadFailed);
  });
});
