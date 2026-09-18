---
name: research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
---

> **Riviera:** findings go to `docs/research/<slug>.md` on the asking ticket's branch (a
> `wayfinder` ticket's `research/<slug>` branch, else the feature branch); it is a primary
> source, not a decision — the decision lands in an ADR or the plan doc citing it. Routed
> from a `wayfinder` research ticket or a slice plan's Open Questions (close the entry with
> the note). Subagents are expected here; a "don't spawn subagents" instruction is a reason
> to ask, not to read inline. Primary sources = official docs for the **pinned** versions
> (`frontend/package.json`, `platform/build.gradle`, `.nvmrc`); prefer the angular-cli MCP
> `search_documentation` for Angular.

Spin up a **background agent** to do the research, so you keep working while it reads.

Its job:

1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it where the repo already keeps such notes; match the existing convention, and if there is none, put it somewhere sensible and say where.
