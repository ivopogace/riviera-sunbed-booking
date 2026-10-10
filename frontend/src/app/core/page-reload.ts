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

/** Production reloader: a real full-page navigation. */
export class WindowPageReload extends PageReload {
  to(url: string): void {
    window.location.assign(url);
  }
}
