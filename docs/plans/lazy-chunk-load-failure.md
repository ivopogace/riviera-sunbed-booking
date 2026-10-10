# Lazy-chunk load failure recovery — implementation plan

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** A lazy route whose chunk fails to load gets one full reload to the target URL and,
if the chunk still fails, an inline "Couldn't load this page" card with a retry in the outlet —
the address bar keeps the target URL and the router raises no uncaught error.

**Architecture:** `withNavigationErrorHandler` in `app.config.ts` (the composition root) hands
every navigation error to `core/chunk-load-recovery.ts`. The handler answers only a chunk-load
`TypeError` (the three engines' messages); anything else stays loud as today. For a chunk error
it returns a `RedirectCommand` to an **eager** `page-load-failed` route with `browserUrl` set to
the failed URL, so the outlet shows the card while the address bar keeps the target. The
reload-once guard is a `sessionStorage` stamp `{url, at}`: no stamp for this URL inside the last
minute → stamp it and `location.assign(target)` (the card renders as "Loading this page again…"
until the document unloads); a fresh stamp → the card with "Try again", which stamps and reloads.
The route is eager (`component:`) because a chunk-failure page whose own chunk could fail would
loop; the full-page navigation sits behind a `PageReload` seam (the `SsoRedirect` shape) so
jsdom specs record it. Reproduced first: a browser memoises a failed module fetch, so an in-app
retry of the same `import()` fails without refetching — the retry must be a full reload.

**Source of intent:** issue #1543 (owner decisions in the issue + the wave brief), PR #1536's
Scope notes.

**Branch:** `bugfix/lazy-chunk-load-failure`

## Acceptance criteria

- [x] **AC-1:** Given a lazy route whose chunk fails on the first attempt only (a stale deploy),
  when the visitor opens it, then the page reloads once to the target URL and renders.
  *Seam:* the navigation error handler → `PageReload`. *Pinned by:*
  `chunk-load-failure.e2e.ts › a chunk that fails once is recovered by one reload` and
  `chunk-load-recovery.spec.ts › reloads the target once`.
- [x] **AC-2:** Given the chunk still fails after that reload, when the visitor opens the route
  directly, then the outlet shows the "Couldn't load this page" card with "Try again", the
  address bar keeps the target URL, no second automatic reload happens and no uncaught error or
  console `ERROR` is raised. *Seam:* `withNavigationErrorHandler` → `RedirectCommand`.
  *Pinned by:* the e2e `a direct load whose chunk keeps failing reloads once, then shows the
  retry card` and `chunk-load-recovery.spec.ts › shows the card instead of a second reload`.
- [x] **AC-3:** Given the card, when "Try again" is pressed and the chunk now loads, then the
  target page renders under its URL. *Seam:* `ChunkLoadRecovery.retry()` → `PageReload`.
  *Pinned by:* the e2e `"Try again" reloads the page…` and `page-load-failed.spec.ts`.
- [x] **AC-4:** Given an in-app navigation (a header link) whose chunk fails, then the same
  recovery runs under the target URL. *Pinned by:* the e2e `an in-app navigation…`.
- [x] **AC-5:** A navigation error that is not a chunk-load failure is untouched by the handler.
  *Pinned by:* `chunk-load-recovery.spec.ts › leaves other navigation errors alone`.
- [x] **AC-6:** Accessible: axe-clean in the three themes, AA contrast, the 44 px touch floor,
  `role="alert"` on the card. *Pinned by:* the e2e theme/touch cases,
  `page-load-failed.a11y.spec.ts`, `page-load-failed.contrast.spec.ts`.
- [x] **AC-7:** Route table pins: `page-load-failed` is the one eager route, before `**`; the
  lazy-target count stays 36. *Pinned by:* `app.routes.spec.ts`.

## Non-goals

- Pre-fetching or versioning chunks to avoid the failure (deploy-side).
- Handling guard/resolver throws with the same card: they are bugs and stay loud.
- Console chrome for the card: like the not-found page it renders in the tourist shell.

## Risks

- **R-1 reload loop** → one reload per URL per minute, stamped in `sessionStorage` *before* the
  reload; storage unavailable → the card, never a reload. Pinned by the core spec.
- **R-2 the failure page's own chunk fails** → the route is eager (`component:`, in the main
  bundle), the one justified exception to "every route lazy" (skill line updated).
- **R-3 masking a real bug as a chunk failure** → the handler keys on the chunk-load
  `TypeError` messages only (Chromium, Firefox, WebKit); everything else falls through.
- **R-4 the card flashing before the automatic reload** → the card renders a neutral
  "Loading this page again…" state while a reload is in flight.

## Open questions

### Resolved
- Where the card lives: `pages/page-load-failed/`, next to `pages/not-found/` — a top-level
  route no feature owns, and it needs `core/`'s stateful guard (which `shared/` may not import).
- Retry is a full reload, not an in-app navigation: reproduction showed the failed module fetch
  is memoised by the browser.

## Phases

- **Phase 0 — reproduction:** the red e2e `chunk-load-failure.e2e.ts` (this commit).
- **Phase 1 — core:** `chunk-load-recovery.ts` + `page-reload.ts` · red `chunk-load-recovery.spec.ts`.
- **Phase 2 — page + wiring:** the card, the eager route, `withNavigationErrorHandler` in
  `app.config.ts` · red `page-load-failed.spec.ts`, routes spec; e2e green.

## Execution status

**Stage pointer:** PR — draft open, CI gate

**Next action:** CI green on the head → ready for review → review gate (high)

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — reproduction | ✅ | 942325d |
| 1 — core | ✅ | 3580d49 |
| 2 — page + wiring | ✅ | (this commit) |

Found while building phase 2: the router keeps its own URL in `history.state` (`ɵrouterUrl`) when
`browserUrl` differs from it, and a same-URL load keeps that state, so a reload booted straight
back into the card without trying the chunk. The reload-path redirect therefore uses
`skipLocationChange` (nothing written), and `WindowPageReload` clears the history entry's state
before navigating (the retry path, where the card's state is already written).

Legend: blank = not started, ⏳ = in progress, ✅ = done.
