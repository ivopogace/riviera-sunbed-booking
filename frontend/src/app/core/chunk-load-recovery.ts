import { Injectable, inject, signal } from '@angular/core';
import { NavigationError, RedirectCommand, Router } from '@angular/router';

import { readSessionJson, writeSessionJson } from '../shared/safe-storage';
import { PageReload } from './page-reload';

/** Where a failed chunk load lands; `app.routes.ts` registers the card at this path, eagerly. */
export const PAGE_LOAD_FAILED_PATH = 'page-load-failed';

/** `sessionStorage` key of the reload stamp: `{ url, at }`, the one automatic reload per URL. */
const RELOAD_STAMP_KEY = 'riviera-chunk-reload';

/** A stamp younger than this means the automatic reload already happened for that URL. */
const RELOAD_WINDOW_MS = 60_000;

/** What a failed dynamic `import()` says, per engine: Chromium, Firefox, WebKit. */
const CHUNK_LOAD_MESSAGES = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
];

interface ReloadStamp {
  url: string;
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
  return typeof stamp?.url === 'string' && typeof stamp.at === 'number';
}

/**
 * What happens when a lazy route's chunk fails to load (#1543): a deploy replaced the hashed
 * chunks under an open tab, or the network dropped mid-navigation. {@link recover} answers the
 * router's navigation error with one full reload of the target URL — stamped per tab so it can't
 * loop — and, if the chunk still fails, a redirect to the `page-load-failed` card under the
 * target's own URL. Any other navigation error is left to the router. `core/`, as the stamp is state.
 */
@Injectable({ providedIn: 'root' })
export class ChunkLoadRecovery {
  private readonly router = inject(Router);
  private readonly reload = inject(PageReload);
  private failedUrl: string | undefined;

  /** True from the moment a reload was asked for until the document unloads: the card stays neutral. */
  readonly reloading = signal(false);

  /** The `withNavigationErrorHandler` body: a redirect for a chunk failure, `undefined` for anything else. */
  recover(error: NavigationError): RedirectCommand | undefined {
    if (!isChunkLoadError(error.error)) {
      return undefined;
    }
    this.failedUrl = error.url;
    if (!this.reloadedRecently(error.url) && this.stamp(error.url)) {
      this.reloadTo(error.url);
    }
    return new RedirectCommand(this.router.parseUrl(`/${PAGE_LOAD_FAILED_PATH}`), {
      browserUrl: error.url,
    });
  }

  /** The card's "Try again": a fresh load of the failed URL, stamped so it isn't followed by an automatic one. */
  retry(): void {
    const url = this.failedUrl ?? '/';
    this.stamp(url);
    this.reloadTo(url);
  }

  private reloadTo(url: string): void {
    this.reloading.set(true);
    this.reload.to(url);
  }

  private reloadedRecently(url: string): boolean {
    const stamp = readSessionJson(RELOAD_STAMP_KEY);
    return isReloadStamp(stamp) && stamp.url === url && Date.now() - stamp.at < RELOAD_WINDOW_MS;
  }

  /** Writes the stamp and reports whether it stuck: an unwritable store means no automatic reload, never a loop. */
  private stamp(url: string): boolean {
    writeSessionJson(RELOAD_STAMP_KEY, { url, at: Date.now() } satisfies ReloadStamp);
    return this.reloadedRecently(url);
  }
}

/** For `withNavigationErrorHandler` in `app.config.ts`; runs in the injection context the router provides. */
export function chunkLoadErrorHandler(error: NavigationError): RedirectCommand | undefined {
  return inject(ChunkLoadRecovery).recover(error);
}
