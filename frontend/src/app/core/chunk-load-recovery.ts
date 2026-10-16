import { DestroyRef, Service, inject, signal } from '@angular/core';
import { NavigationError, RedirectCommand, Router } from '@angular/router';

import { readSessionJson, writeSessionJson } from '../shared/safe-storage';
import { PageNavigation } from './page-navigation';

/** Where a failed chunk load lands; `app.routes.ts` registers the card at this path, eagerly. */
export const PAGE_LOAD_FAILED_PATH = 'page-load-failed';

/** `sessionStorage` key of the reload stamp: `{ path, at }`, the one automatic reload per page. */
const RELOAD_STAMP_KEY = 'riviera-chunk-reload';

/** A stamp younger than this means the automatic reload already happened for that page. */
const RELOAD_WINDOW_MS = 60_000;

/** What a failed dynamic `import()` says, per engine: Chromium, Firefox, WebKit. */
const CHUNK_LOAD_MESSAGES = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
];

interface ReloadStamp {
  path: string;
  at: number;
}

/** True for the error a lazy route raises when its chunk could not be fetched. */
export function isChunkLoadError(error: unknown): boolean {
  return (
    error instanceof Error && CHUNK_LOAD_MESSAGES.some((message) => error.message.includes(message))
  );
}

function isReloadStamp(value: unknown): value is ReloadStamp {
  const stamp = value as Partial<ReloadStamp> | null;
  return typeof stamp?.path === 'string' && typeof stamp.at === 'number';
}

/** The stamp keys on the path alone: a query may carry a one-time token, which has no business at rest. */
function pathOf(url: string): string {
  return url.split(/[?#]/, 1)[0];
}

/**
 * What happens when a lazy route's chunk fails to load (#1543): a deploy replaced the hashed
 * chunks under an open tab, or the network dropped mid-navigation. {@link recover} answers the
 * router's navigation error with one full reload of the target — stamped per tab, so the page that
 * last failed can't loop — and, if the chunk still fails, a redirect to the `page-load-failed` card, which
 * keeps the target's URL in the address bar. Any other navigation error is left to the router.
 * `core/`, as the stamp is state.
 */
@Service()
export class ChunkLoadRecovery {
  private readonly router = inject(Router);
  private readonly navigation = inject(PageNavigation);
  private failedUrl: string | undefined;

  /** True from the moment a reload was asked for until a fresh load replaces the document: the card stays neutral. */
  readonly reloading = signal(false);

  constructor() {
    // A document that asked for a reload and comes back from the back/forward cache is stale: load it afresh.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && this.reloading()) {
        this.navigation.reload(window.location.href);
      }
    };
    window.addEventListener('pageshow', onPageShow);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('pageshow', onPageShow));
  }

  /**
   * The `withNavigationErrorHandler` body: a redirect for a chunk failure, `undefined` for anything
   * else. With a reload in flight the address bar is left alone: `browserUrl` would store the card's
   * route in `history.state`, which a same-URL load keeps, and the fresh document would boot into the card.
   */
  recover(error: NavigationError): RedirectCommand | undefined {
    if (!isChunkLoadError(error.error)) {
      return undefined;
    }
    this.failedUrl = error.url;
    const reloadNow = !this.reloadedRecently(error.url) && this.stamp(error.url);
    if (reloadNow) {
      this.reloadTo(error.url);
    }
    return new RedirectCommand(
      this.router.parseUrl(`/${PAGE_LOAD_FAILED_PATH}`),
      reloadNow ? { skipLocationChange: true } : { browserUrl: error.url },
    );
  }

  /** The card's "Try again": a fresh load of the failed URL, stamped so it isn't followed by an automatic one. */
  retry(): void {
    const url = this.failedUrl ?? '/';
    this.stamp(url);
    this.reloadTo(url);
  }

  private reloadTo(url: string): void {
    this.reloading.set(true);
    this.navigation.reload(url);
  }

  private reloadedRecently(url: string): boolean {
    const stamp = readSessionJson(RELOAD_STAMP_KEY);
    return (
      isReloadStamp(stamp) && stamp.path === pathOf(url) && Date.now() - stamp.at < RELOAD_WINDOW_MS
    );
  }

  /** Writes the stamp and reports whether it stuck: an unwritable store means no automatic reload, never a loop. */
  private stamp(url: string): boolean {
    writeSessionJson(RELOAD_STAMP_KEY, { path: pathOf(url), at: Date.now() } satisfies ReloadStamp);
    return this.reloadedRecently(url);
  }
}

/** For `withNavigationErrorHandler` in `app.config.ts`; runs in the injection context the router provides. */
export function chunkLoadErrorHandler(error: NavigationError): RedirectCommand | undefined {
  return inject(ChunkLoadRecovery).recover(error);
}
