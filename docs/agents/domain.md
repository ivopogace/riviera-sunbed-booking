# Domain docs

How the domain-knowledge files are laid out, so `domain-modeling`, `tdd`,
`diagnosing-bugs`, and `improve-codebase-architecture` look in the right place.

**Layout: single-context (for now).**
- `CONTEXT.md` at the repo root — the domain glossary / ubiquitous language.
- `docs/adr/` at the repo root — architectural decision records.

**Canonical sources & their roles** (don't duplicate; cross-reference):
- `CLAUDE.md` — conventions + the 12 numbered **invariants**. Canonical for *rules*.
- `CONTEXT.md` — the **glossary** only (term → definition, no implementation detail).
- `docs/adr/` — the **decisions** and their rationale.
- `docs/superpowers/specs/` — the product **design**; the "why" behind decisions.
- `docs/architecture/domain-model.md` — the aggregates/flows as diagrams.

**Future: multi-context.** Once the backend modules are scaffolded under
`platform/src/main/java/ai/riviera/platform/<module>/`, this may graduate to multi-context:
a `CONTEXT-MAP.md` at the root pointing to per-module `CONTEXT.md` files (the six
bounded contexts: venue, availability, booking, payment, payout, customer). Until
there is code to sit next to, one root `CONTEXT.md` is simpler and correct.
