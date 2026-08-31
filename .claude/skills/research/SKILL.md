---
name: research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
---

> **In riviera-sunbed-booking (localization):**
> - **Where findings go** (the skill's step 3 asks for the repo's convention; there was no
>   prior one, so this is it): `docs/research/<slug>.md`. Keep it on the branch of the
>   ticket that asked the question — a `wayfinder` research ticket's own
>   `research/<slug>` branch, otherwise the feature branch. It is a **primary source, not
>   a decision**: when the decision lands, the durable form is an ADR (`docs/adr/`, if
>   hard-to-reverse) or the plan doc, and the note stays as the citation behind it.
> - **Routed from two places** (`riviera-sdlc`): a `wayfinder` research ticket
>   (cross-session decision), or a slice plan's Open Questions register when the slice
>   can answer the question itself — the latter needs no map; close the register entry
>   with the note as its citation.
> - **Subagents are expected here.** This skill *is* the delegated-reading path — its
>   background agent is the point, and `wayfinder` fires several in parallel while
>   charting. A session-level "don't spawn subagents" instruction is a reason to ask,
>   not to do the reading inline and call it research.
> - **Primary sources, in this stack:** the Angular/Spring/Postgres/Stripe **official
>   docs for the pinned version** (`frontend/package.json`, `platform/build.gradle`,
>   `.nvmrc`) — a blog post about Angular 19 is not a source for Angular 22. The
>   angular-cli MCP `search_documentation` is version-correct by construction; prefer it
>   for Angular questions.

Spin up a **background agent** to do the research, so you keep working while it reads.

Its job:

1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it where the repo already keeps such notes; match the existing convention, and if there is none, put it somewhere sensible and say where.
