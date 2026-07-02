# Plan (lite) — T2b: Discover v3 additions (failure panel + cutoff explainer)

**Issue:** #149 · **Epic:** #133 (Liquid Glass tourist redesign) · **Blocked by:** #135 (T2, merged)
**Branch:** `claude/discover-v3-load-failure-cutoff-h4dwa9` (cloud-session designated branch stands in for `feature/<slug>`)
**Design:** `docs/design/riviera-sunbeds-liquid-glass-v3.dc.html` → Discover screen (lines 157, 159–166)

Plan-doc-**lite**: FE-only, no backend/DB/money/availability change. Two designed Discover
elements T2 didn't build (T2 restyled against v2 just before the v3 gap-fill landed).

## Scope

1. **Load-failure panel** — the plain error line (`<p class="state" role="alert" data-testid="error">`)
   becomes the designed light-glass failure panel: ⚠ icon, **"We couldn't load the beaches"**,
   explainer copy, and a **Try again** button (`onRetryDiscover`) that refetches and recovers.
   Keep the `role="alert"` / `data-testid="error"` semantics T2 shipped.
2. **Cutoff explainer line** under the filter bar — ⏰ "Bookings close the evening before — book by
   6 PM the day before. Today isn't available." (invariant #4 — **display only**; the server enforces).

## Acceptance criteria → tests

- **AC-1** Failed venue-list load renders the failure panel per design; **Retry refetches and recovers**;
  announced to AT (`role="alert"`). → `home.spec.ts` (panel content + retry-recovers, incl. filter re-seed),
  `home.a11y.spec.ts` (error-state axe), `discovery-flow.e2e.ts` (real-browser fail→retry→recover + axe).
- **AC-2** Cutoff line renders per design in both themes (contrast pinned). → `home.spec.ts` (copy + testid),
  `home.contrast.spec.ts` (text on card-glass over worst-case stops), e2e (visible).
- **AC-3** Specs + affected e2e updated; axe/contrast green in both themes. → the three specs above.

## Design reconciliations (grill gate)

- **Copy:** issue shorthand ("Book by 6 PM…" / "Retry") vs design full copy (line 157 / "Try again").
  Design is the visual authority → use design copy.
- **`--riv-cta-grad` fails white-text AA** (design #2bb8d4→#0e8aa8 ≈ 2.4–4.0:1 < 4.5). Token has **zero
  current consumers** → retune to an AA-safe darker teal (`#0c7288`→`#0a5f74`), pin **both** stops with
  white text; documented deviation (same class as the shipped header-glass / card-ink deviations).
- **Cutoff line on the bare gradient fails AA** (white-ish ink over the light gradient stops). → back it
  with the proven `%card-glass` + `--riv-card-ink-soft` as a subtle inline glass pill (same hero-on-glass
  deviation). Reuses the already-pinned "card ink-soft" contrast coverage.
- **Retry semantics:** re-run the *failed* request type via a `lastLoad` closure — an initial-load failure
  retry re-seeds the beach/region dropdowns (`loadInitial`); a filter-change failure retry re-runs `reload`.
- **Failure-panel glass:** light `%card-glass` + dark card inks (matches the v3 design's light panel), not
  the dark `%panel-glass` the loading/empty `.state`s use — the states are mutually exclusive so never
  shown side-by-side. Title/body reuse `--riv-card-ink` / `--riv-card-ink-soft` (already AA-pinned).

## Invariants

- **#4 cutoff:** the explainer is **display-only**; the server remains authoritative. N/A to all others
  (no JDBC/availability/money/payment/Flyway/Modulith change — FE-only).

## Risks

- **R-1 (contrast):** the new CTA-button token must clear AA at both gradient stops with white body-size
  text (14.5px bold = *normal* text, needs 4.5:1). Mitigated by pinning both stops in `home.contrast.spec.ts`
  (TDD — retune the stops until green).
- **R-2 (retry re-seed):** initial-load failure must re-seed the filter dropdowns on recovery. Mitigated by
  the `lastLoad` closure + a unit test asserting the dropdowns populate after retry.

## Skills consulted

- `riviera-frontend` — placement (home page stays in `pages/home/`; tokens in `styles.scss`; contrast
  fixtures reused from `testing/glass-tokens.ts`).
- `angular-developer` + angular-cli MCP — signals/template idioms for the retry handler + control flow.
- `playwright-cli` — the CI-safe mocked fail→retry e2e in `frontend/e2e/discovery-flow.e2e.ts`.
- `riviera-review-overlay` — review gate (RV-FE-*, RV-FE-E2E).

## Out of scope

- Date-picker `min` constraint (design shows `min`; the cutoff line is display-only per AC — not adding a
  behavior change here). Loading/empty `.state` panels unchanged. Map/payment failure panels are T3/T4.
