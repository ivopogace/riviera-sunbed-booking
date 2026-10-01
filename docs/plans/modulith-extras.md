# Spring Modulith extras: drop what does nothing, publish what documents

> Build with `tdd` at the named seams. Invariant numbers: `CLAUDE.md`.

**Goal:** the platform's classpath carries only the Spring Modulith artifacts something uses; the shared
`applicationTaskExecutor` is provably undecorated; the Documenter's output reaches a reader.

**Architecture:** the user chose to drop observability over adding a tracing bridge: Render has no
tracing backend, and a booking's traces would break at the Stripe webhook and at every database
republish or retry, so the booking-id grep stays the runbook's handle. Dropping
`spring-modulith-observability-core` also removes its `ThreadPoolTaskExecutorCustomizer`, which today
puts a `ContextPropagatingTaskDecorator` on the shared pool that `WorkerContextArchitectureTest` and
`RESPONSIBILITIES.md` § `monitoring` say is undecorated. A context-level test now pins that.

**Source of intent:** #1341, plus the user's answers relayed in this session (observability: drop;
actuator and runtime: remove; Documenter: apt plus a CI artifact).

**Branch:** `feature/1341-modulith-extras`

## Acceptance criteria

- [ ] **AC-1:** Given the full application context, when Boot builds `applicationTaskExecutor`, then
  it carries no `TaskDecorator`, and the context holds no `TaskDecorator` or
  `ThreadPoolTaskExecutorCustomizer` bean that would install one. The probe reads a bulkhead pool as
  decorated, so it can't pass vacuously. *Seam:* the Spring context's bean graph · *Pinned by:*
  `SharedTaskExecutorUndecoratedIT`
- [ ] **AC-2:** Given `platform/build.gradle`, then neither `spring-modulith-observability-*`,
  `spring-modulith-actuator` nor `spring-modulith-runtime` is declared, and the existing structural
  net plus `ActuatorHardeningIT` stay green (`modulith` still answers 401/404). *Pinned by:*
  `ActuatorHardeningIT`, the structural net
- [ ] **AC-3:** Given a backend CI run (cache miss or hit), then `build/spring-modulith-docs` is
  uploaded as the `modulith-docs` artifact, and its canvases carry Javadoc (the apt processor runs).
  *Seam:* `DocumentationTests` + the CI artifact · *Pinned by:* the PR's own CI run
- [ ] **AC-4:** after #1326 merges: `riviera-modulith/references/testing.md` prefers
  `@ApplicationModuleTest` for module-internal ITs. At least one module's test boots STANDALONE with
  none of the root's collaborators mocked. *Pinned by:* that module test

## Non-goals

- A tracing bridge, an exporter or MDC propagation on the shared pool. Its money-path listeners stay
  undecorated by design.
- Re-adding `module.events.published`. No alert, runbook or dashboard names it (grepped).

## Risks

- **R-1:** dropping the shared pool's decorator changes what the money-path listeners see → it only
  propagated the Micrometer observation, and no tracer consumed it. No MDC moved with it: the
  context-propagation library registers no SLF4J accessor by default.
- **R-3:** spring-modulith#1762 (fixed in 2.2, not in 2.1.1): the Documenter's `BasicJsonParser` rejects the apt's escaped quotes → `build.gradle`'s `test` task rewrites each to `'` first; drop it with the 2.2 upgrade.
- **R-2:** a CI cache hit skips the build, so there would be no docs to upload → the docs folder
  joins the cached paths. The key prefix becomes `v2-`, per `ci.yml`'s own rule.

## Execution status

- [x] Phase 1: AC-1 red against today's classpath, then the dependency drop turns it green (AC-2)
- [x] Phase 2: Documenter apt plus the CI artifact (AC-3); runbook and production-hardening docs
- [ ] Phase 3: waits for #1326. Merge origin/main, flip `testing.md` (AC-4)
