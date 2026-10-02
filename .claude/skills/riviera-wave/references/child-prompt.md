# Child-session prompt template

Fill the angle brackets; keep the owner's line verbatim as the first paragraph.

```text
<the owner's line for this issue, verbatim>

## Context (from the wave orchestrator, <orchestrator session id>)
<what is merged on main, with its sha; what the owner already decided for this issue; what this
issue needs from a sibling, and what to do until that sibling merges>

## How to work
- Load `riviera-sdlc` first and follow its loop end to end. Load `riviera-local-debug` before
  the first ./gradlew or npm.
- Before writing, read the documentation that governs what you touch: CLAUDE.md, the module's
  § in RESPONSIBILITIES.md, the ADRs it names, the routed skills, and the current framework
  reference docs rather than memory. Take the best practice they state, and name what you
  relied on in the PR body.
- Fill the PR template whole, Gates included. Keep the Contribution terms section with its
  boxes unticked: the orchestrator ticks them on the owner's instruction.
- Siblings in flight: <#N: one-line scope, for each>. Expect conflicts in <shared files>.
  Resolve them by `git fetch origin main` and merging origin/main, never by rebasing.

## Talking to the owner (through the orchestrator)
- End a turn that needs the orchestrator with one block, and also `send_message` it to
  `@parent`:
  - `NEEDS USER DECISION`: the question, 2–4 options with trade-offs, and your
    recommendation. Don't use AskUserQuestion.
  - `READY TO MERGE`: the PR, head sha, checks, review outcome and Sonar result. Send it once CI
    is green on the head, the review has run with its findings resolved, the Sonar gate has
    passed, and the plan doc is removed (pr-gates §3 item 4, the last commit before merge).
  - `BLOCKED`: exactly what is wrong and what you need.
- Never merge. After the orchestrator merges, it asks for the rest of the pr-gates §3
  close-out. End that turn with `CLOSE-OUT DONE`.
```
