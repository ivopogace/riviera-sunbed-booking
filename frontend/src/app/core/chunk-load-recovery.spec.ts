import { TestBed } from '@angular/core/testing';
import { NavigationError, RedirectCommand, Router, provideRouter } from '@angular/router';

import { installFakeStorage, removeFakeStorage } from '../../testing/fake-storage';
import { RecordingPageNavigation } from '../../testing/recording-page-navigation';
import { ChunkLoadRecovery, chunkLoadErrorHandler, isChunkLoadError } from './chunk-load-recovery';
import { PageNavigation } from './page-navigation';

const STAMP_KEY = 'riviera-chunk-reload';
const TARGET = '/legal/privacy?from=footer';
const TARGET_PATH = '/legal/privacy';

/** The error Chromium raises for a chunk that could not be fetched, as the router wraps it. */
function chunkFailure(url = TARGET): NavigationError {
  return new NavigationError(
    7,
    url,
    new TypeError('Failed to fetch dynamically imported module: http://localhost/chunk-ABC.js'),
  );
}

describe('ChunkLoadRecovery (#1543)', () => {
  let reload: RecordingPageNavigation;
  let session: Map<string, string>;
  let recovery: ChunkLoadRecovery;
  let router: Router;

  beforeEach(() => {
    session = installFakeStorage('sessionStorage');
    reload = new RecordingPageNavigation();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: PageNavigation, useValue: reload }],
    });
    recovery = TestBed.inject(ChunkLoadRecovery);
    router = TestBed.inject(Router);
  });

  afterEach(() => removeFakeStorage('sessionStorage'));

  it('reloads the target once, stamping the tab first, and redirects to the card leaving the address bar alone', () => {
    const command = recovery.recover(chunkFailure());

    expect(reload.reloaded).toEqual([TARGET]);
    expect(recovery.reloading()).toBe(true);
    // Keyed on the path: a `?token=` query never lands in storage.
    expect(JSON.parse(session.get(STAMP_KEY)!)).toEqual({ path: TARGET_PATH, at: Date.now() });
    expect(command).toBeInstanceOf(RedirectCommand);
    expect(router.serializeUrl(command!.redirectTo)).toBe('/page-load-failed');
    expect(command!.navigationBehaviorOptions).toEqual({ skipLocationChange: true });
  });

  it('shows the card under the target URL instead of a second reload while the stamp for that URL is fresh', () => {
    session.set(STAMP_KEY, JSON.stringify({ path: TARGET_PATH, at: Date.now() - 59_000 }));

    const command = recovery.recover(chunkFailure());

    expect(reload.reloaded).toEqual([]);
    expect(recovery.reloading()).toBe(false);
    expect(command).toBeInstanceOf(RedirectCommand);
    expect(router.serializeUrl(command!.redirectTo)).toBe('/page-load-failed');
    expect(command!.navigationBehaviorOptions).toEqual({ browserUrl: TARGET });
  });

  it('reloads again once the stamp is a minute old, or is for another URL', () => {
    session.set(STAMP_KEY, JSON.stringify({ path: TARGET_PATH, at: Date.now() - 60_000 }));
    recovery.recover(chunkFailure());
    session.set(STAMP_KEY, JSON.stringify({ path: '/my-bookings', at: Date.now() }));
    recovery.recover(chunkFailure());

    expect(reload.reloaded).toEqual([TARGET, TARGET]);
  });

  it('never reloads automatically when the stamp cannot be written (no loop without a brake)', () => {
    removeFakeStorage('sessionStorage');

    const command = recovery.recover(chunkFailure());

    expect(reload.reloaded).toEqual([]);
    expect(command).toBeInstanceOf(RedirectCommand);
  });

  it('leaves other navigation errors alone', () => {
    const command = recovery.recover(new NavigationError(8, TARGET, new Error('guard threw')));

    expect(command).toBeUndefined();
    expect(reload.reloaded).toEqual([]);
    expect(session.has(STAMP_KEY)).toBe(false);
  });

  it('retries with a fresh load of the failed URL and stamps it so no automatic reload follows', () => {
    session.set(STAMP_KEY, JSON.stringify({ path: TARGET_PATH, at: Date.now() - 59_000 }));
    recovery.recover(chunkFailure());
    session.set(STAMP_KEY, JSON.stringify({ path: TARGET_PATH, at: Date.now() - 120_000 }));

    recovery.retry();

    expect(reload.reloaded).toEqual([TARGET]);
    expect(recovery.reloading()).toBe(true);
    expect(JSON.parse(session.get(STAMP_KEY)!)).toEqual({ path: TARGET_PATH, at: Date.now() });
  });

  it('treats the same page with another query as already reloaded', () => {
    session.set(STAMP_KEY, JSON.stringify({ path: TARGET_PATH, at: Date.now() }));

    recovery.recover(chunkFailure('/legal/privacy?from=menu'));

    expect(reload.reloaded).toEqual([]);
  });

  it('loads a document afresh when it comes back from the back/forward cache mid-reload', () => {
    recovery.recover(chunkFailure());
    reload.reloaded.length = 0;

    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));

    expect(reload.reloaded).toEqual([window.location.href]);
  });

  it('ignores a back/forward-cache restore when no reload was asked for', () => {
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));

    expect(reload.reloaded).toEqual([]);
  });

  it('retries to the home page when no chunk failure was recorded (the card opened by its own URL)', () => {
    recovery.retry();

    expect(reload.reloaded).toEqual(['/']);
  });

  it('is what the router feature calls, inside the injection context', () => {
    const command = TestBed.runInInjectionContext(() => chunkLoadErrorHandler(chunkFailure()));

    expect(command).toBeInstanceOf(RedirectCommand);
    expect(reload.reloaded).toEqual([TARGET]);
  });
});

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: http://x/chunk-A.js',
    'error loading dynamically imported module: http://x/chunk-A.js',
    'Importing a module script failed.',
  ])('recognises %s', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it.each([new Error('NG04002: Cannot match any routes'), 'Failed to fetch', null, undefined])(
    'rejects %o',
    (error) => {
      expect(isChunkLoadError(error)).toBe(false);
    },
  );
});
