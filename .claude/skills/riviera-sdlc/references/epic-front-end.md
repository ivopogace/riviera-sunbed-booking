# Epic front-end — wayfinder → to-spec → to-issues

Read this at the Refine/Issue stages when the change is a **multi-slice epic**. It is
optional scaffolding, not a new gate — a single slice or a one-liner skips it entirely
(the summary in SKILL.md is the trigger; this file is the procedure).

Ahead of `Refine → Issue`, a big change can be authored top-down through three
Matt-Pocock craft skills:

```
wayfinder            →   to-spec               →   to-issues
chart foggy              formalize: user           slice user stories into
decisions across         stories + testing         tracer-bullet vertical
sessions (epic map)      seams + out-of-scope      issues (ready-for-agent)
(foggy epics only)       (committed epic issue)    (the normal Issue stage)
```

- **`wayfinder` — foggy epics only.** Use it *only* when the destination is clear but
  the route is fog and the decisions won't fit one session (SSO / #112 had that shape
  before it shipped). When `to-issues` can already cut clean slices — the common case,
  since the product design spec + domain model are captured up front — **skip it**. It
  charts a `wayfinder:map` issue of **decision** tickets (not build slices), resolved
  one per session until the way is clear.
- **`to-spec` — the epic spec.** Synthesizes the discussion into one committed epic issue
  (Problem / Solution / numbered **User Stories** / Implementation Decisions / **Testing
  Seams** / Out of scope). Its user stories are what `to-issues` then slices against.
- **`to-issues` — unchanged.** The normal Issue stage; consumes the spec's user stories.

## Two boundaries that keep this from fighting the rest of the loop

1. **Altitude.** `to-spec` is **epic-level** (user stories, seams, out-of-scope, committed
   once). `riviera-plan-doc` stays **slice-level** (testable ACs, risk register, invariant
   proof, the Execution-status state store). Don't restate slice ACs in the spec — two spec
   layers is the failure mode.
2. **State store.** The `wayfinder:map` issue governs the **charting** phase only. The
   moment a slice enters execution, the plan-doc **Execution status** section is the state
   store (SKILL.md, Rules of the loop 10–11) — the map *indexes* decisions, it does not
   track build progress.
