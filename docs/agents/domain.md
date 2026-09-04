# Domain docs

How the domain-knowledge files are laid out, so `domain-modeling`, `tdd`,
`diagnosing-bugs`, and `improve-codebase-architecture` look in the right place.

**Layout: single-context, and settled — ADR-0018 §5.**
- `CONTEXT.md` at the repo root — the domain glossary / ubiquitous language.
- `docs/adr/` at the repo root — architectural decision records.

**Canonical sources & their roles** (don't duplicate; cross-reference):
- `CLAUDE.md` — conventions + the 13 numbered **invariants**. Canonical for *rules*.
- `CONTEXT.md` — the **glossary** only (term → definition, no implementation detail).
- `docs/adr/` — the **decisions** and their rationale.
- `docs/superpowers/specs/` — the product **design**; the "why" behind decisions.
- `docs/architecture/domain-model.md` — the tables, types and flows as diagrams.
- `docs/architecture/improvement-plan.md` — the sequenced roadmap (epic #93).

**No context map, and that is decided.** ADR-0018 §5 ruled the platform **one bounded
context with twelve modules**, on the evidence that none of the four language tells fires
across any module pair: a *set* is the same set in `venue`, `availability`, `booking` and
`notification`; a *booking* is the same booking in `booking`, `payment`, `payout` and
`review`; money is EUR minor units everywhere. The duplicated id records (`VenueRef`,
`BookingRef`) are identity conversions that keep the Modulith graph acyclic, not translations
that can fail or lose information, and the system's one genuine translation boundary is
against Stripe, fenced inside `payment`.

So there is deliberately **no root `CONTEXT-MAP.md` and no per-module `CONTEXT.md`** — one
root glossary is the whole ubiquitous language, and splitting it would assert twelve
languages the code does not speak. `domain-modeling`'s "if a `CONTEXT-MAP.md` exists at the
root, the repo has multiple contexts" is generic guidance about a file this repo does not
have; creating one to satisfy it inverts the decision.

**What would reopen it** is one of those four tells firing on a domain word: the same word
carrying genuinely different fields or rules in two modules; a domain word needing a
qualifier to stay unambiguous (`Money` fires today, but on layers — value object, wire
projection, column pair — not on meanings); two rules about one noun contradicting with both
correct; a published type whose callers ignore most of its fields. That is a module having to
redefine a word to do its job. Short of it, a boundary question is `riviera-modulith`'s
subject, not this file's.
