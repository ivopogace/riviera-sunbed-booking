# "My bookings" fetch fan-out bound + account-list trim — Implementation Plan

> **For agentic workers:** to implement this plan use `implement` + `tdd` (installed),
> or the superpowers `subagent-driven-development`/`executing-plans` skills if present
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opening "My bookings" issues at most `DEVICE_FETCH_CONCURRENCY` concurrent
`GET /api/bookings/{code}` calls instead of one per remembered code all at once, and — when
signed in — spends no per-code request on a code the account list has already resolved, with
every observable behaviour of the list unchanged.

**Architecture:** The single significant decision is that **the bound is what makes the trim
possible**. The per-code fetches move from `codes.forEach(...)` (N simultaneous subscriptions)
to `from(codes).pipe(mergeMap(fetch, K))`, whose inner observables are subscribed **lazily, at
dequeue time**. Wrapping each in `defer()` therefore gives a free, correctly-timed skip test:
by the time the queue reaches code #7, `GET /api/me/bookings` may already have answered, and if
that answer contained code #7 the request is simply never made. This composes with review
finding **F2** (#114) instead of fighting it — device rows still render immediately and their
first `K` fetches start immediately, so **nothing is ever gated on the account call**; only the
*tail* of the queue can be trimmed, which is exactly the regime where the amplification matters.

**Persistence:** N/A — frontend-only slice; no table, no migration, no backend code (invariant #1 untouched).

**Source of intent:** GitHub issue **#164** (rescoped 2026-08-01 after a staleness check — see
the issue's staleness-check comment). Ancestry: T6 #139 / PR #162 review finding [8]; the
constraint it must respect comes from S3 #114 (`docs/plans/s3-signed-in-my-bookings.md`).

**Skills consulted:** `riviera-sdlc` (routing + the issue-intake grill gate — caught that AC-2
as written in the issue is unachievable *if* the account list is awaited, which F2 forbids; the
lazy-dequeue design below is the reconciliation) · `riviera-plan-doc` (this template — forced the
Behavior-parity ledger, which is what surfaced the shared-row *provenance* change in P-3/P-4) ·
`tdd` (each phase writes the failing spec in `my-bookings.spec.ts` first) · `riviera-review-overlay`
(review gate — pending, PR stage) · `riviera-docs-freshness` (pending — merge close-out step 5,
range = this PR's merge span; the slice edits a TSDoc that states a fact about #114) ·
`riviera-frontend` (structure: confirmed every edit stays inside the `booking/` feature folder +
the `core/` singleton it already consumes — no new file, no cross-feature import, so no placement
change) · `angular-developer` + **angular-cli MCP** (`list_projects` → framework v22 confirmed;
`get_best_practices` → signals-for-state, no explicit `OnPush`; `search_documentation` v22 →
`takeUntilDestroyed` is the sanctioned unsubscribe idiom and `httpResource`/`rxResource` is the
*single*-request reactive-fetch tool, which is why the N-row fan-out with per-row retry stays an
explicit RxJS pipeline rather than being rewritten onto resources) · `playwright-cli` (e2e: the
existing `frontend/e2e/my-bookings.e2e.ts` covers both modes and is provenance-agnostic — no new
spec, it is a regression guard here) · `riviera-local-debug` (scoped `npm test -- --include="src/app/booking/my-bookings.spec.ts"`
runs, never the full suite in-session)

**Branch:** `claude/sdlc-164-staleness-check-tst1oi` — **cloud-session substitution** for
`feature/my-bookings-fetch-fanout` per `riviera-sdlc` §Remote/cloud addendum (the designated
remote branch stands in; the literal `feature/` branch is deliberately not created).

---

## Acceptance criteria (testable)

> Written at the component's observable boundary — what the list *does*, not which RxJS
> operator it uses. All pins are in `frontend/src/app/booking/my-bookings.spec.ts` unless noted.

- [ ] **AC-1 (the bound):** Given 12 remembered codes whose fetches have not resolved, when the
  list opens, then at most 5 `getByCode` calls are in flight at any instant, and as each resolves
  the next starts until all 12 rows are loaded. *Pinned by:* `MyBookings › bounds the per-code fetch fan-out to 5 in-flight requests`
- [ ] **AC-2 (the trim):** Given a signed-in customer with 8 device codes of which the account
  list also returns code #8, when the account list resolves before code #8 is dequeued, then
  **no** `getByCode` is issued for code #8 and its row renders from the account summary.
  *Pinned by:* `MyBookings › signed in › spends no per-code request on a code the account list already resolved`
- [ ] **AC-3 (F2 parity — the constraint):** Given a signed-in customer whose `GET /api/me/bookings`
  never emits, when the list opens, then the device rows still render from their own per-code
  fetches (they are not gated on the account call). *Pinned by:* `MyBookings › signed in › renders device rows without waiting for the account list (F2)`
- [ ] **AC-4 (no booking is lost):** Given a signed-in customer whose device code transiently
  `404`s (its row dropped per invariant #7) but which the account list returns, when the account
  list resolves, then the booking is shown. *Pinned by:* `MyBookings › signed in › restores a 404-dropped device row that the account list vouches for`
- [ ] **AC-5 (destroy safety):** Given a list with more remembered codes than the concurrency
  bound, when the component is destroyed while the queue is draining, then no further `getByCode`
  call is issued. *Pinned by:* `MyBookings › issues no further per-code fetches after destroy`
- [ ] **AC-6 (signed-out parity):** Given no session, when the list opens, then every existing
  device-local behaviour holds unchanged — row render, `404` drops the row but keeps the code,
  transient failure shows Retry and Retry re-fetches, empty state, loading skeleton, a11y.
  *Pinned by:* the pre-existing `MyBookings (device-local list, issue #139)` specs, unmodified.
- [ ] **AC-7 (dedupe parity):** Given a signed-in customer, when both sources contain a code, then
  it renders exactly **once**. *Pinned by:* the pre-existing `unions the account list with device-only codes, deduped by code` spec **and** `frontend/e2e/my-bookings.e2e.ts › signed in: My bookings unions…`.

## Non-goals

- **Capping the stored code list** and **pruning long-terminal codes** — the two `optional` items
  on #164. Deliberately not done: `remember()` is called only on booking create
  (`booking.service.ts:77`), never from the account list, so the list grows strictly one entry per
  booking this browser made; and evicting a code discards the guest's only key to that booking
  (invariant #7), which this component already refuses to do on a `404`. Cost is tidiness; the
  risk is losing a booking. Left on #164 as `optional` with that reasoning recorded.
- **Any backend change** — no new endpoint, no change to `GET /api/me/bookings` or its DTO. A
  server-side "fetch these N codes" batch endpoint is not proposed (it would hand a list of bearer
  codes to one request; invariant #7).
- **Rewriting the list onto `httpResource`/`rxResource`** — see Skills consulted; wrong tool for
  an N-row fan-out with per-row retry and per-row `404` semantics.
- **Changing the load order** (account-first, then uncovered device codes) — forbidden by F2; see
  the Architecture note and R-1.
- **Touching `DeviceLocalBookings` behaviour** — the only edit there is the stale TSDoc sentence.

## Behavior-parity ledger

> The slice does not retire a surface, but it **replaces the fetch orchestration** behind an
> existing one, so the ledger is filled rather than `N/A` — this is exactly the "refactor only,
> no behaviour change" claim the template says is aspirational until verified row by row.

| Old-surface behavior (`MyBookings` today) | Verdict | How the new surface does it, or why it changed |
|---|---|---|
| Device rows render immediately as skeletons, before any fetch resolves (F2) | preserved | `rows.set(...)` + `loading.set(false)` still run synchronously in `loadDeviceLocal`, before the pipeline is subscribed |
| Each device code is fetched live by code | preserved | same `getByCode` per code — only the *scheduling* changes (queued at K=5), plus the AC-2 skip |
| All device fetches start at once | **changed** | now at most 5 concurrently. Intended; this is the issue. User-visible only as rows filling in in waves on a list longer than 5 |
| `404` on a device code → drop the row, keep the code (invariant #7) | preserved | unchanged in the per-code error branch; the code is still never `forget()`-ten |
| Transient failure → row shows Retry; Retry re-fetches that code | preserved | Retry bypasses the queue and the skip gate entirely (a manual retry must never be silently swallowed) |
| Account list adds only codes the device does not have (append) | **changed** → upsert | an account row for a code the device *does* have now updates that row in place instead of being discarded. Strictly additive: it is what makes AC-2 and AC-4 possible, and the rendered fields are identical (`buildView` reads only the `MyBookingSummary` subset, which `BookingDetail` is a superset of) |
| A shared row's displayed data comes from `GET /api/bookings/{code}` | **changed** (provenance) | may now come from `GET /api/me/bookings`. Both are server truth fetched in the same second, and both feed the same `buildView`, so the rendered row is field-for-field identical — pinned by AC-7's e2e, which asserts the shared row's venue/status either way |
| Account fetch failure → device rows intact + Retry card (F1) | preserved | `accountError` handling untouched; `retryAccount()` unchanged |
| Account 401 with an empty device → Retry, never "No booking yet" (F1) | preserved | untouched |
| No subscription teardown on destroy | **changed** → fixed | `takeUntilDestroyed(destroyRef)` on all three streams. Previously harmless (HttpClient completes); with a queue it would keep firing requests after navigation away — AC-5 |

## Risk register

| # | Description | Likelihood | Impact | Mitigation | Owner | Resolution |
|---|---|---|---|---|---|---|
| R-1 | The trim is implemented by awaiting the account list, silently regressing F2 (device rows stuck as skeletons behind a slow `/api/me/bookings`) | med | high | The skip is a *lazy dequeue-time* check inside `defer()`, never a barrier; AC-3 pins that a never-emitting account list still renders device rows | this slice | open |
| R-2 | The upsert lets the account list overwrite a fresher per-code row with staler data | low | med | Both are server truth fetched seconds apart, and `buildView` consumes only the `MyBookingSummary` fields common to both; ledger row P-6/P-7 records it; AC-7 + the e2e assert the rendered row | this slice | open |
| R-3 | `takeUntilDestroyed` changes existing spec behaviour (TestBed destroys fixtures between tests) | low | med | Full `my-bookings.spec.ts` + `device-local-bookings.spec.ts` run scoped after each phase; AC-6 is the unmodified pre-existing suite | this slice | open |
| R-4 | The queue defers emissions past `await fixture.whenStable()`, making existing specs flaky | low | high | `mergeMap` over a synchronous `of()` source stays synchronous, so the existing harness holds; verified by running the suite unmodified at phase 0 step 2 before any spec is added | this slice | open |
| R-5 | Concurrent Dependabot PRs (#332–#341) conflict | low | low | All ten touch `frontend/package.json` + lockfile only; this slice touches neither. No Flyway number is claimed (frontend-only), so the #122/#127 collision class does not apply | this slice | open |
| R-6 | The chosen K interacts badly with the #56 rate limit on `GET /api/bookings/{code}` | low | med | K=5 *reduces* instantaneous pressure versus today's unbounded N; the total request count is unchanged or lower (AC-2 only removes requests) | this slice | open |

## Open questions / Assumptions

- **Assumption:** `K = 5` is the right bound — under the ~6-connections-per-host HTTP/1.1 cap it
  leaves one slot for the account call, and on HTTP/2 it is a deliberate self-imposed limit rather
  than a protocol one. Nothing in the app depends on the exact value; it is a named constant.
  *Owner:* this slice · *Resolves by:* phase 0 (named `DEVICE_FETCH_CONCURRENCY` with a one-line why).
- **Assumption:** a signed-in customer's account list is authoritative enough to render a shared
  row from (R-2). *Owner:* this slice · *Resolves by:* phase 1, via the ledger + AC-7.

## Availability & concurrency (invariant #2)

**N/A — does not affect availability.** This slice is read-only on the client: it changes the
*scheduling* of `GET /api/bookings/{code}` and `GET /api/me/bookings`. It writes no
`availability(set_id, booking_date)` row, creates no booking, touches no claim/release path, and
adds no backend code. Invariants #3 (pool), #4 (cutoff) and #6 (timezone) are equally untouched —
the deadline rendering keeps going through `formatDeadline` (Europe/Tirane), unchanged.

## Spring Modulith — modules, interfaces, events

**N/A — frontend-only.** No backend Java, no module, no port, no event, no `RESPONSIBILITIES.md`
ownership question (§4a therefore also N/A: all changes are in one Angular feature folder).

## Payment & payout (invariants #5, #8, #9, #10)

**N/A — no payment in scope.** No money moves. Row amounts continue to render from integer minor
units via `shared/money` (invariant #5); the `Paid` vs `Amount` label logic is untouched.

## Angular — frontend surfaces touched

| # | Surface | Existing/new | Type | State/reactivity | Forms |
|---|---|---|---|---|---|
| FE-1 | `booking/my-bookings.ts` | existing | standalone component | Signals (`rows`, `loading`, `accountError`) + an explicit RxJS fan-out pipeline; `takeUntilDestroyed(DestroyRef)` teardown | none |
| FE-2 | `booking/my-bookings.spec.ts` | existing | Vitest/jsdom spec | — | none |
| FE-3 | `core/device-local-bookings.ts` | existing | `@Service()` singleton | unchanged — **TSDoc only** (the `#114 unshipped` claim) | none |

**Standards:** standalone (no `standalone: true`), no explicit `OnPush` (default in v22), signals
for state, `inject()`, `@if`/`@for`/`@switch` native control flow, one-line-or-no inline comments
(`frontend/.claude/CLAUDE.md` / RV-STYLE-1). No template or styling change, so `riviera-tailwind`
is not triggered and the existing `my-bookings.scss` is untouched. Deviation to document: the
component keeps a hand-rolled RxJS pipeline rather than `httpResource` — justified under Skills
consulted.

## FE↔BE contract

**N/A — no contract change.** Same two endpoints, same DTOs (`BookingDetail`, `MyBookingSummary`),
same typed service methods. The slice only changes *how many* of one of them are issued and *when*.

## Execution status

> **This section is the session-recovery anchor.** After a compaction or in a fresh session,
> re-read it (plus the current `riviera-sdlc` stage reference) before acting.

**Stage pointer:** `CI gate — awaiting the phase-2 push's run, then PR ready-for-review`

**Next action:** Confirm CI green on PR #484's latest push, mark the PR ready for review, then run
the Review gate (`references/pr-gates.md` §1 invocation ladder) followed by the Sonar gate.

| Phase | Status | Commits |
|-------|--------|---------|
| 0 — Bound the fan-out + destroy teardown (AC-1, AC-5, AC-6) | ✅ | `f11cee0` |
| 1 — Trim the redundant per-code fetch (AC-2, AC-3, AC-4, AC-7) | ✅ | `fc3fb70` |
| 2 — Doc freshness + e2e/regression sweep | ✅ | `<phase-2>` |

**Local verification at phase 2 (scoped per `riviera-local-debug`; CI owns the full suite):**

| Run | Result |
|---|---|
| `npm test --include="src/app/booking/**" --include="src/app/core/device-local-bookings.spec.ts"` | 241 passed / 24 files |
| `npm run test:a11y` | 312 passed / 51 files |
| `npm run lint` | clean |
| `npm run build` | success (2 pre-existing SCSS budget warnings, in files this slice does not touch) |
| `npm run test:e2e:a11y -- my-bookings` | 3 passed (incl. signed-in union + both-theme axe) |

**PR:** #484 (draft, opened at the phase-0 push per `riviera-sdlc` rule 3).

**Test-honesty note (AC-3):** the F2 spec passes against the phase-0 code without any phase-1
change — it is a **regression guard**, not a red-then-green driver. It is kept because the
obvious "optimization" this slice invites (load the account list first, then fetch only the
uncovered codes) would break F2 silently and this spec is what fails when someone tries it.
AC-2 and AC-4 were genuinely red before the phase-1 implementation.

**Note on test invocation:** the `test` target is `@angular/build:unit-test`, whose project
argument is the *project* name — a bare `npm test -- my-bookings` errors with
`Invalid values: Argument: project`. Scope with `--include=<spec path>` instead.

**Note on test invocation:** the `test` target is `@angular/build:unit-test`, whose project
argument is the *project* name — a bare `npm test -- my-bookings` errors with
`Invalid values: Argument: project`. Scope with `--include=<spec path>` instead.

Legend: blank = not started, ⏳ = in progress, ✅ = done.

**Findings register** — one row per review-gate, Sonar-gate, or red-CI finding. Every fix
re-enters at Implement per the `riviera-sdlc` re-entry rule (run the Skill-routing gate for what
the fix touches *before* editing).

| # | Source (review / sonar / CI) | Finding | Status |
|---|---|---|---|
| — | — | none yet | — |

---

## File structure

- `frontend/src/app/booking/my-bookings.ts` — the fan-out pipeline, the dequeue-time skip gate,
  the account upsert, and teardown. The only behavioural file in the slice.
- `frontend/src/app/booking/my-bookings.spec.ts` — the five new specs (AC-1 … AC-5) alongside the
  untouched existing ones (AC-6, AC-7).
- `frontend/src/app/core/device-local-bookings.ts` — one TSDoc sentence corrected (`#114 unshipped`).
- `docs/plans/my-bookings-fetch-fanout.md` — this plan; its Execution status is the state store.

---

## Phase 0 — Bound the fan-out + destroy teardown

**Files:** Modify `frontend/src/app/booking/my-bookings.ts` · Test `frontend/src/app/booking/my-bookings.spec.ts`

- [ ] **Step 1: Write the failing tests** (AC-1, AC-5). A `Subject`-per-code stub lets the spec
  hold requests open and count concurrency.

```ts
/** A getByCode stub that holds every request open, exposing the in-flight count per code. */
function pendingService(): Partial<BookingService> & {
  readonly inFlight: Map<string, Subject<BookingDetail>>;
  readonly asked: string[];
} {
  const inFlight = new Map<string, Subject<BookingDetail>>();
  const asked: string[] = [];
  return {
    inFlight,
    asked,
    getByCode: (code: string) => {
      asked.push(code);
      const subject = new Subject<BookingDetail>();
      inFlight.set(code, subject);
      return subject.asObservable();
    },
  };
}

it('bounds the per-code fetch fan-out to 5 in-flight requests', async () => {
  const codes = Array.from({ length: 12 }, (_, i) => `CODE${String(i).padStart(4, '0')}`);
  seedCodes(codes);
  const service = pendingService();
  const fixture = await render(service);

  // Only the first K are asked for; the rest are queued, not issued.
  expect(service.asked).toHaveLength(5);

  // Resolving one frees exactly one slot.
  service.inFlight.get(codes[0])!.next(detail(codes[0], 'CONFIRMED'));
  service.inFlight.get(codes[0])!.complete();
  await fixture.whenStable();
  expect(service.asked).toHaveLength(6);
  expect(service.asked[5]).toBe(codes[5]);

  // Draining the queue eventually asks for every code exactly once.
  for (const code of codes) {
    const subject = service.inFlight.get(code);
    subject?.next(detail(code, 'CONFIRMED'));
    subject?.complete();
    await fixture.whenStable();
  }
  expect([...new Set(service.asked)]).toHaveLength(12);
});

it('issues no further per-code fetches after destroy', async () => {
  const codes = Array.from({ length: 12 }, (_, i) => `GONE${String(i).padStart(4, '0')}`);
  seedCodes(codes);
  const service = pendingService();
  const fixture = await render(service);
  expect(service.asked).toHaveLength(5);

  fixture.destroy();
  // Completing an in-flight request must not pull the next one off a destroyed queue.
  service.inFlight.get(codes[0])!.next(detail(codes[0], 'CONFIRMED'));
  service.inFlight.get(codes[0])!.complete();
  await fixture.whenStable();

  expect(service.asked).toHaveLength(5);
});
```

- [ ] **Step 2: Run the suite UNMODIFIED first, then with the new specs** —
  `cd frontend && npm test -- my-bookings`. First run (before adding the specs) proves R-4's
  baseline is green; second run → FAIL with `expected 12 to have length 5`.

> Scope: `my-bookings` only. CI owns the full suite (`riviera-local-debug`).

- [ ] **Step 3: Minimal implementation** — replace the `forEach` fan-out; keep everything else.

```ts
/**
 * How many per-code lookups may be in flight at once (#164). Under the ~6-connections-per-host
 * HTTP/1.1 cap this leaves a slot for the account list; on HTTP/2 it is a deliberate self-limit.
 */
const DEVICE_FETCH_CONCURRENCY = 5;
```

```ts
private readonly destroyRef = inject(DestroyRef);

/** Render this device's remembered codes (issue #139), each fetched live by code, K at a time. */
private loadDeviceLocal(codes: readonly string[]): void {
  this.rows.set(codes.map((code) => ({ code, state: 'loading' as const })));
  this.loading.set(false);
  from(codes)
    .pipe(
      mergeMap((code) => this.fetchRow(code), DEVICE_FETCH_CONCURRENCY),
      takeUntilDestroyed(this.destroyRef),
    )
    .subscribe();
}

/** One queued per-code lookup. `defer` keeps the work lazy — nothing happens until dequeued. */
private fetchRow(code: string): Observable<unknown> {
  return defer(() => this.fetchOne(code));
}

/** The actual lookup + row transitions, shared by the queue and the manual Retry. */
private fetchOne(code: string): Observable<unknown> {
  this.setRow({ code, state: 'loading' });
  return this.bookings.getByCode(code).pipe(
    tap((d) => this.setRow({ code, state: 'loaded', view: buildView(d) })),
    catchError((e: unknown) => {
      if (isNotFound(e)) {
        // 404: drop the row from view, but keep the code (invariant #7 — see the class doc).
        this.rows.update((rows) => rows.filter((r) => r.code !== code));
      } else {
        // Transient (offline / 5xx): keep the code, offer Retry — never lose a valid booking.
        this.setRow({ code, state: 'failed' });
      }
      return EMPTY;
    }),
  );
}

protected retry(code: string): void {
  // A manual retry bypasses the queue — the user asked for this one now.
  this.fetchOne(code).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
}
```

- [ ] **Step 4: Run, verify pass** — `npm test -- --include="src/app/booking/my-bookings.spec.ts"` → PASS (new + all pre-existing, AC-6).

> Scope (end-of-phase regression): `npm test -- booking` + `npm test -- device-local` + `npm run lint`.

- [ ] **Step 5: Generalization-audit pass** — search for other unbounded per-item HTTP fan-outs:
  `grep -rn "forEach(.*=>.*subscribe\|forkJoin(" frontend/src/app`. Record candidates and the
  decision in the log below.

- [ ] **Step 6: Commit** — `git commit -m "Bound the My-bookings per-code fetch fan-out (#164)"`

- [ ] **Step 7: Update this plan's Execution status** in the same commit window; push and open the
  **draft PR immediately** (CI fires on `pull_request` only — `riviera-sdlc` rule 3).

---

## Phase 1 — Trim the redundant per-code fetch

**Files:** Modify `frontend/src/app/booking/my-bookings.ts` · Test `frontend/src/app/booking/my-bookings.spec.ts`

- [ ] **Step 1: Write the failing tests** (AC-2, AC-3, AC-4).

```ts
it('spends no per-code request on a code the account list already resolved', async () => {
  const codes = Array.from({ length: 8 }, (_, i) => `DEV${String(i).padStart(5, '0')}`);
  const queued = codes[7]; // beyond the concurrency bound → still queued when the account answers
  seedCodes(codes);
  const service = pendingService();
  const fixture = await render(
    { ...service, myBookings: () => of([summary(queued)]) },
    authStub(true),
  );

  // The account list resolved it, so draining the queue must never ask for it.
  for (const code of codes.slice(0, 7)) {
    const subject = service.inFlight.get(code);
    subject?.next(detail(code, 'CONFIRMED'));
    subject?.complete();
    await fixture.whenStable();
  }
  fixture.detectChanges();

  expect(service.asked).not.toContain(queued);
  const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="booking-row"]');
  expect([...rows].filter((r) => r.textContent?.includes(queued))).toHaveLength(1);
});

it('renders device rows without waiting for the account list (F2)', async () => {
  seedCodes(['DEVONLY1']);
  const fixture = await render(
    {
      ...stubService({ DEVONLY1: detail('DEVONLY1', 'CONFIRMED') }),
      myBookings: () => new Subject<MyBookingSummary[]>().asObservable(), // never emits
    },
    authStub(true),
  );
  const host = fixture.nativeElement as HTMLElement;

  const rows = host.querySelectorAll('[data-testid="booking-row"]');
  expect(rows).toHaveLength(1);
  expect(rows[0].textContent).toContain('DEVONLY1');
});

it('restores a 404-dropped device row that the account list vouches for', async () => {
  seedCodes(['FLAKY001']);
  const fixture = await render(
    {
      ...stubService({ FLAKY001: { error: { status: 404 } } }),
      myBookings: () => of([summary('FLAKY001')]),
    },
    authStub(true),
  );
  const host = fixture.nativeElement as HTMLElement;

  const rows = host.querySelectorAll('[data-testid="booking-row"]');
  expect(rows).toHaveLength(1);
  expect(rows[0].textContent).toContain('FLAKY001');
});
```

- [ ] **Step 2: Run, verify fail** — `npm test -- --include="src/app/booking/my-bookings.spec.ts"` → FAIL (`asked` contains the queued code).

- [ ] **Step 3: Minimal implementation** — a dequeue-time skip set + an upsert merge.

```ts
/**
 * Codes the account list has already resolved (#164). Consulted when a queued per-code lookup is
 * DEQUEUED, never as a barrier — device rows are still issued immediately (F2).
 */
private readonly accountResolved = new Set<string>();

private fetchRow(code: string): Observable<unknown> {
  return defer(() => (this.accountResolved.has(code) ? EMPTY : this.fetchOne(code)));
}

private loadAccount(): void {
  this.accountError.set(false);
  this.bookings
    .myBookings()
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe({
      next: (account) => {
        account.forEach((b) => this.accountResolved.add(b.code));
        this.upsert(account.map((b) => ({ code: b.code, state: 'loaded' as const, view: buildView(b) })));
      },
      error: () => this.accountError.set(true),
    });
}

/** Merge server rows in: replace the row for a code we already list, else append it. */
private upsert(incoming: readonly Row[]): void {
  this.rows.update((rows) => {
    const byCode = new Map(incoming.map((r) => [r.code, r]));
    const merged = rows.map((r) => byCode.get(r.code) ?? r);
    const listed = new Set(rows.map((r) => r.code));
    return [...merged, ...incoming.filter((r) => !listed.has(r.code))];
  });
}
```

- [ ] **Step 4: Run, verify pass** — `npm test -- --include="src/app/booking/my-bookings.spec.ts"` → PASS, including the pre-existing
  signed-in dedupe specs (AC-7) and the F1 retry specs.

> `loadAccount` loses its `deviceCodes` parameter (the upsert no longer needs the device set) —
> update `loadAll` and `retryAccount` accordingly.

- [ ] **Step 5: Generalization-audit pass** — does any other surface merge two async sources by
  discarding one? Search `grep -rn "myBookings()\|filter((b) =>" frontend/src/app`. Record.

- [ ] **Step 6: Commit** — `git commit -m "Skip the per-code fetch for account-resolved codes (#164)"`

- [ ] **Step 7: Update Execution status** in the same commit window.

---

## Phase 2 — Doc freshness + regression sweep

**Files:** Modify `frontend/src/app/core/device-local-bookings.ts` · Verify `frontend/e2e/my-bookings.e2e.ts`

- [ ] **Step 1: Correct the stale TSDoc.** `device-local-bookings.ts:9` asserts *"A guest has no
  account yet (#114 unshipped)"* — false since #114 merged 2026-07-14. Rewrite to state what is
  true now: a **guest** (signed-out) has no account, so the code is the only key; a signed-in
  customer's account-linked bookings come from `GET /api/me/bookings` and this store is not the
  only source. Also refresh the `forget()` doc, which offers "a future account-merge (#114)" as
  its motivating case.
- [ ] **Step 2: Update the `MyBookings` class TSDoc** to describe the bounded queue and the skip —
  the class doc is the documented surface (RV-STYLE-1), so the *why* lives there, not inline.
- [ ] **Step 3: Verify e2e unchanged and green** — `npm run test:e2e:a11y -- my-bookings`. In a
  cloud session the pinned `@playwright/test` 1.61.1 wants `chromium_headless_shell-1228` while the
  image ships revision 1194, so use the config's existing escape hatch rather than
  `playwright install` (which the environment forbids):
  `PW_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e:a11y -- my-bookings`.
  Both
  suites' scenarios use ≤2 device codes, so no queueing occurs and the shared-row assertions are
  provenance-agnostic; this is a regression guard, not new coverage (`playwright-cli`: no new spec
  is warranted for a change with no new user-facing state).
- [ ] **Step 4: Full scoped sweep** — `npm test -- booking`, `npm test -- device-local`,
  `npm run test:a11y`, `npm run lint`, `npm run build`.
- [ ] **Step 5: Commit** — `git commit -m "Refresh the device-local + my-bookings docs (#164)"`
- [ ] **Step 6:** Mark the PR ready for review → the Review and Sonar gates become due
  (`riviera-sdlc` `references/pr-gates.md`).

---

## Generalization-audit log

> Append-only. One row per bug-fix / pattern-introducing phase.

| Date | Trigger (commit/phase) | Pattern searched | Search command | Sites found | Action |
|---|---|---|---|---|---|
| 2026-08-01 | Phase 0 (bounded fan-out) | Other unbounded per-item HTTP fan-outs on the FE | `grep -rn "forEach(.*subscribe\|\.map(.*subscribe" src/app`; `grep -rn "forkJoin\|mergeMap\|concatMap" src/app` (spec files excluded) | 1 — `operator/daily-view-tab.ts:261` `forkJoin([venue$, bookings$])` | **skip**: bounded by construction at exactly 2 fixed streams, not per-item over a user-grown list, so the amplification this phase fixes cannot arise there. No other site fans out per item |
| 2026-08-01 | Phase 1 (two-source merge) | Another surface merging two async sources by discarding one | `grep -rn "myBookings()\|\.filter((b) =>\|new Set(" src/app` (spec files excluded) | 0 — `myBookings()` has exactly one consumer; every other `new Set` is local UI state (`requests-tab` decide/expire flags, `venue-tab` amenity draft) or value dedupe (`home`, `amenities`) | **skip**: no sibling. `requests-tab.ts:277` reconciles stale UI flags against fresh rows, which is pruning, not a two-source merge |

---

## Acceptance-criteria verification (final)

- [ ] **AC-1:** `npm test -- --include="src/app/booking/my-bookings.spec.ts"` → `bounds the per-code fetch fan-out` passes. Verified at `<sha>`.
- [ ] **AC-2:** same run → `spends no per-code request on a code the account list already resolved` passes. Verified at `<sha>`.
- [ ] **AC-3:** same run → `renders device rows without waiting for the account list (F2)` passes. Verified at `<sha>`.
- [ ] **AC-4:** same run → `restores a 404-dropped device row that the account list vouches for` passes. Verified at `<sha>`.
- [ ] **AC-5:** same run → `issues no further per-code fetches after destroy` passes. Verified at `<sha>`.
- [ ] **AC-6:** same run → all pre-existing `MyBookings (device-local list, issue #139)` specs pass **unmodified**. Verified at `<sha>`.
- [ ] **AC-7:** `npm run test:e2e:a11y -- my-bookings` → signed-in union spec passes. Verified at `<sha>`.

If any AC isn't verified by a passing test, write the test or admit it's not done.

## Self-review checklist (before merge / PR)

- [ ] Every AC has an implementing task and a verifying test.
- [ ] No placeholders / TODO / TBD anywhere in the doc.
- [ ] Type & method-signature consistency across phases (`fetchOne`/`fetchRow`/`upsert`, and
      `loadAccount`'s dropped parameter).
- [ ] **No JPA** introduced (invariant #1) — N/A, no backend code in the diff.
- [ ] **Availability** section filled — `N/A` justified: read-only client change (invariant #2).
- [ ] Pool + cutoff rules honored (invariants #3, #4) — untouched.
- [ ] **Modulith** section filled — `N/A — frontend-only` (invariant #11).
- [ ] **Payment/payout** section filled — `N/A`; money still renders in minor units (invariant #5).
- [ ] Refund policy enforced server-side (invariant #10) — untouched.
- [ ] Timezone correct (invariant #6) — `formatDeadline` path untouched.
- [ ] **Booking codes unguessable and never logged (invariant #7)** — the new `accountResolved`
      set holds codes in memory only; no logging is added, and no code is evicted from storage.
- [ ] Flyway migration present for schema changes (invariant #12) — N/A, no schema change.
- [ ] **Frontend** standards met or deviation documented (the RxJS-over-`httpResource` deviation is).
- [ ] Execution status at HEAD matches reality — stage pointer, phase table, AND findings register.
- [ ] Risk register has no stale `open` rows; Open Questions empty (or deferred with an issue #).
- [ ] **Close-out written in THIS PR** — final plan state committed here, citing `merged via PR #NN`.
- [ ] **The review gate ran in full** — invocation ladder in `references/pr-gates.md` §1 *plus*
      `riviera-review-overlay`, not the overlay alone.
