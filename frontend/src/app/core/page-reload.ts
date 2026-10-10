/**
 * Seam for a full page load of a URL inside the SPA: what a failed lazy chunk needs, since the
 * browser memoises a failed module fetch and an in-app retry of the same `import()` fails without
 * refetching. The real {@link WindowPageReload} navigates; unit specs override the token with a
 * fake that records the URL (the `SsoRedirect` shape). Wired in `app.config.ts`.
 */
export abstract class PageReload {
  /** Load `url` as a fresh document (a real navigation, leaving the running SPA). */
  abstract to(url: string): void;
}

/** A URL without its fragment: what decides whether `location.assign` would load a document at all. */
function pageOf(href: string): string {
  return href.split('#', 1)[0];
}

/**
 * Production reloader. The router keeps its own URL in `history.state` whenever the address bar
 * shows another (`browserUrl`), and a load that lands on the same entry keeps that state, so the
 * fresh document would boot straight back into the card: the current entry's state is cleared
 * first, its URL kept so Back still works. A target on the current page is reloaded, not
 * assigned: assigning the current URL with a fragment only scrolls.
 */
export class WindowPageReload extends PageReload {
  constructor(private readonly win: Window) {
    super();
  }

  to(url: string): void {
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
