---
name: prototype
description: Build a throwaway prototype to answer a design question. Use when the user wants to sanity-check whether a state model or logic feels right, or explore what a UI should look like.
---

# Prototype

> **In riviera-sunbed-booking (localization):**
> - **Branch:** a spike branch, `spike/<slug>`, never `feature/`|`bugfix/`. It carries **no
>   plan doc** and **never opens a PR** — `riviera-sdlc` exempts spikes from the ceremony,
>   and the repo's CI hygiene checks would judge throwaway code as if it were shipping.
>   Nothing here merges to `main`; the validated *decision* is what graduates, re-built
>   test-first through the normal loop.
> - **Task runner** (rule 2): npm scripts from `frontend/` — `npm start` for a UI
>   prototype on a throwaway route, and a logic demo stays a single HTML file the user
>   double-clicks. The `pnpm`/`bun` examples below are upstream's, not ours.
> - **The invariants still hold in what you learn from it.** A prototype may fake
>   persistence and skip tests (rules 3–4), but never *validate* a shape that breaks a
>   spine invariant — a float euro amount (#5), a check-then-insert availability claim
>   (#2), a client-confirmed payment (#8). Prototyping the wrong shape convincingly is
>   the failure mode; the throwaway code is not.
> - **Capture** (rule 6): push the spike branch, leave a context pointer on the decision
>   ticket, and record the verdict + the question it settled there. `wayfinder` links it
>   as the ticket's asset.

A prototype is **throwaway code that answers a question**. The question decides the shape.

## Pick a branch

Identify which question is being answered, using the user's prompt, the surrounding code, or by asking if the user is around:

- **"Does this logic / state model feel right?"** → [LOGIC.md](LOGIC.md). Build a single shareable HTML file (free-play buttons plus tabbed guided walkthroughs) that pushes the state machine through cases that are hard to reason about on paper, and that a non-developer can drive.
- **"What should this look like?"** → [UI.md](UI.md). Generate several radically different UI variations on a single route, switchable via a URL search param and a floating bottom bar.

The two branches produce very different artifacts, so getting this wrong wastes the whole prototype. If the question is genuinely ambiguous and the user isn't reachable, default to whichever branch better matches the surrounding code (a backend module → logic; a page or component → UI) and state the assumption at the top of the prototype.

## Rules that apply to both

1. **Throwaway from day one, and clearly marked as such.** Locate the prototype code close to where it will actually be used (next to the module or page it's prototyping for) so context is obvious, but name it so a casual reader can see it's a prototype, not production. For throwaway UI routes, obey whatever routing convention the project already uses; don't invent a new top-level structure.
2. **Trivial to run.** A UI prototype starts from one command in the project's task runner: `pnpm <name>`, `python <path>`, `bun <path>`, etc. A logic demo is a single HTML file the user double-clicks. Either way, no thinking required to start it.
3. **No persistence by default.** State lives in memory. Persistence is the thing the prototype is _checking_, not something it should depend on. If the question explicitly involves a database, hit a scratch DB or a local file with a clear "PROTOTYPE, wipe me" name.
4. **Skip the polish.** No tests, no error handling beyond what makes the prototype _runnable_, no abstractions. The point is to learn something fast.
5. **Surface the state.** After every action (logic) or on every variant switch (UI), print or render the full relevant state so the user can see what changed.
6. **Capture it when done.** Fold any validated decision into the real code, then capture the prototype itself as a **primary source**: commit it to a throwaway branch, out of main, and leave a context pointer to that branch on the implementation issue. Capture the answer too (the verdict and the question it settled) in the issue or a commit. The main branch keeps only the validated decision.
