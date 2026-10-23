/**
 * Seam for a full page load, which no `HttpClient` call or router navigation can stand in for:
 * {@link leaveTo} leaves the SPA (the SSO authorize redirect; OIDC + PKCE completes server-side),
 * {@link reload} loads a URL inside it afresh (a failed lazy chunk, since the browser memoises a
 * failed module fetch). The real {@link WindowPageNavigation} navigates; unit specs override the
 * token with a fake that records the URL. Wired in `app.config.ts`.
 */
export abstract class PageNavigation {
  /** Navigate the browser to `url` outside the SPA (a real page load). */
  abstract leaveTo(url: string): void;

  /** Load `url` as a fresh document (a real navigation, leaving the running SPA). */
  abstract reload(url: string): void;
}

/** A URL without its fragment: what decides whether `location.assign` would load a document at all. */
function pageOf(href: string): string {
  return href.split('#', 1)[0];
}

/** Production adapter: real `window.location` navigation. */
export class WindowPageNavigation extends PageNavigation {
  constructor(private readonly win: Window) {
    super();
  }

  leaveTo(url: string): void {
    this.win.location.href = url;
  }

  /**
   * Clears the current entry's `history.state` first (the router's `browserUrl` would otherwise
   * boot the fresh document back into the card), keeping its URL for another page so Back works.
   * The same page is reloaded, not assigned: assigning the current URL with a fragment only scrolls.
   */
  reload(url: string): void {
    const target = new URL(url, this.win.location.href).href;
    const samePage = pageOf(target) === pageOf(this.win.location.href);
    this.win.history.replaceState(null, '', samePage ? target : this.win.location.href);
    if (samePage) {
      this.win.location.reload();
    } else {
      this.win.location.assign(target);
    }
  }
}
