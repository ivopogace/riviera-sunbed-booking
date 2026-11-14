# i18n S2: the operator and admin consoles in Albanian and Italian

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** under `/sq/` and `/it/`, every operator tab, the account menu, onboarding, operator
password and every admin tab and dialog read in that language; console dates and money follow
`DISPLAY_LOCALE`.

**Architecture:** ADR-0030's mechanism, unchanged: `i18n` / `$localize` marking, `npm run
i18n:sync`, an `sq` and an `it` target per unit. The console's pinned-`Intl` formatters move onto
`shared/display-format.ts`, which gains the shapes the console prints (`day-month-year`,
`day-month-time`, `day-month-year-time`, `time`); English output is unchanged (`en-IE` ≡ `en-GB`
for these shapes).

**Source of intent:** #1769 and its triage Agent Brief (owner decision: admin joins).

**Branch:** `feature/1769-i18n-console`

## Acceptance criteria

- [ ] **AC-1:** Given the `sq` build, when an operator opens a console tab, then its headings,
  controls, aria labels and toasts render Albanian. *Seam:* the served `/sq/operator/:id/…` route
  · *Pinned by:* `e2e/locales/locales.e2e.ts` operator case.
- [ ] **AC-2:** Given the `sq` build, when an admin opens the console, then the tab rail and the
  active tab render Albanian. *Seam:* `/sq/admin` · *Pinned by:* `locales.e2e.ts` admin case.
- [ ] **AC-3:** Given any marked console message, when `npm run build` runs, then every unit has an
  `sq` and `it` target (`i18nMissingTranslation: error`). *Seam:* the build · *Pinned by:* CI build.
- [ ] **AC-4:** Given a console date or instant, when it renders, then it goes through
  `displayDateFormat` in `DISPLAY_LOCALE` with `Europe/Tirane` (#6), no pinned `Intl` locale left
  under `operator/`, `admin/`. *Seam:* `shared/display-format.ts` · *Pinned by:*
  `display-format.spec.ts` console-shapes case + a grep in review.
- [ ] **AC-5:** Given the source-locale unit run, then specs still assert English. *Pinned by:*
  `npm test`.

## Non-goals

- Server `ApiProblem` text (#1771), mails (#1770), German (#1773), native review (#1774).
- `auth/auth-page.ts` (the sign-in/register card, operator tab included) and
  `auth/reset-password.ts`: S5 #1772 owns them.

## Risks

- **R-1:** an interpolated `i18n-aria-label` on a plain element renders no attribute → bind
  `[attr.aria-label]` from `$localize`; axe in the locale e2e catches a nameless control.
- **R-2:** sentences split into fragments translate badly → whole sentences with named
  placeholders; counts as ICU plurals.
- **R-3:** xlf conflicts with S3–S5 → keep own targets as `{id: target}` JSON per locale in the
  scratchpad; resolve by taking origin/main's xlf and `i18n:sync --fill`.

## Phases

- **Phase 0 — formatters:** console date shapes in `display-format.ts` · red
  `display-format.spec.ts` console shapes.
- **Phase 1 — mark operator:** shell, account chip, home/onboarding, every tab, operator password.
- **Phase 2 — mark admin:** every tab, dialog and the route titles.
- **Phase 3 — translations:** sq + it targets; build passes.
- **Phase 4 — locale e2e:** one operator and one admin screen under `/sq/` (and `/it/`).

## Execution status

**Stage pointer:** CI gate, then review

**Next action:** CI green on the head, then mark ready and run the review gate (high).

| Phase | Status | Commits |
|-------|--------|---------|
| 0 | done | 2a5eb88d |
| 1 | done | 45721c92 |
| 2 | done | 45721c92 |
| 3 | done | next commit |
| 4 | done | 45721c92 + next commit |
