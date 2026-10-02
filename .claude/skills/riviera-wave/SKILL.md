---
name: riviera-wave
description: >-
  Orchestrate a wave of riviera-sunbed-booking issues in parallel cloud sessions: spawn one
  child session per issue, check in, relay decisions, verify the merge bar first-hand, merge in
  order, close out and archive. Load when the user hands over several issues to run in parallel
  ("wave N", "in parallel", a list of `Sdlc #N: …` prompts) or invokes /riviera-wave.
---

# Riviera wave orchestration

The orchestrator writes no product code. Each child session drives `riviera-sdlc` end to end for
one issue; the orchestrator spawns, relays, verifies, merges and closes out. Input: one line per
issue (`#N: <the owner's prompt>`), plus any precondition ("after wave K merges") and cadence.

## 1. Before spawning

- Read `main` and the PRs from GitHub (MCP tools or `gh api`), never from the session's clone:
  its refs are as old as the container. Run `git fetch origin main` before any local use.
- A precondition holds or the wave waits: check open PRs and `main`'s log, and say which PR is
  still open.
- Read every issue. Note what one sibling needs from another (a flip that needs a move merged
  first) and the files they share (CLAUDE.md, `RESPONSIBILITIES.md`, ADRs, skills). Both go into
  the child prompts.
- Keep a roster in the scratchpad: issue, session id, branch, PR, state, and the owner's
  decisions and merge go verbatim with their time. Every check-in reads it first, so it outlives
  a compaction. A container restart that loses it: rebuild from the PRs and an unfiltered
  `list_sessions`, matching the `wave-K` tag yourself (its `tags` filter errors in-session).

## 2. Spawn

`create_session` per issue: the repo as `source_url`, title `Sdlc #N: <scope>`, tags `issue:N`
and `wave-K`, prompt from `references/child-prompt.md`. Put in the prompt what the owner already
decided for that issue ("the owner chose option 1"), so the intake grill does not ask again.

## 3. Check-ins

- Children send their turn-end marker to `@parent`, which wakes the orchestrator. On top, keep a
  safety-net check at the cadence the owner asked for (default 30 minutes).
- Schedule with `send_later`, never `CronCreate`: a cron job lives in the container's memory and
  dies when the idle container is reclaimed. Each check-in re-arms the next link first; an hourly
  `send_later` safety net re-arms the chain if a link went missing.
- Read a child with `get_session` (`status_bucket`, `post_turn_summary`), then `list_events` with
  `kinds: ["result"]` for its last turn end. An unfiltered page overflows the tool-result limit.
- When nothing changed, say nothing.

## 4. Decisions

- `NEEDS USER DECISION` on an engineering call the docs settle: decide it, cite the doc, send it
  back. A product, money or scope call, or anything the owner said to ask first: the owner's.
- Ask the owner in the reply text after a `PushNotification`. A pending `AskUserQuestion` is
  closed unanswered by the next check-in or notification that arrives.
- Every message to a child tells it to re-read the governing docs (CLAUDE.md, the module's
  `RESPONSIBILITIES.md` §, the ADRs, the routed skills, current framework reference docs) and to
  take the practice they state.

## 5. Merge

**The go.** The owner's go in a real message, for PRs already presented to them ("merge those
when ready"), carries through later check-in turns; record it in the roster verbatim and merge in
the turn that verifies the bar. Without one, ask once per batch. Blanket merge authority written
into a recurring job is refused by the auto-mode classifier, even after the owner granted it.
Never route around a refusal: ask the owner in the reply text.

**The bar**, checked on the PR's current head sha, never from a child's summary:

- every check run concluded `success` (`gh api repos/O/R/commits/<sha>/check-runs`);
- the Sonar bar of `riviera-sdlc` `references/pr-gates.md` §2, read from its `measures` URL (a
  quality-gate `OK` is not that bar); false zeros ruled out, and no new lines in
  `sonar.sources` recorded as "gate did not apply";
- the review gate (pr-gates §1) ran at the right effort, its findings resolved, and a behaviour
  fix made after it re-reviewed;
- the plan doc is gone from the head (pr-gates §3 item 4): a squash merge would land it on `main`;
- the PR template is whole. A child that skipped Gates or Contribution terms gets them filled
  from what was verified; tick Contribution terms only on the owner's instruction;
- you read the production diff yourself: scope, pure-move discipline, invariant-touching code.

**The loop.** The repo requires up-to-date branches, so merges run one at a time, by dependency
first, then readiness:

1. Squash-merge with `expectedHeadSha`; commit title `<PR title> (#PR)`.
2. The next PR now reads `mergeable_state: behind`. Run `update_pull_request_branch` with its
   `expectedHeadSha`: a server-side merge commit, never a rebase. Tell its child to `git pull`
   before any push. `dirty` instead means a real conflict: the child merges `origin/main`.
3. Wait for CI and Sonar on the new head, re-check the bar, merge. Repeat.

## 6. Close-out

- After each merge, send the child the rest of the pr-gates §3 close-out and ask for
  `CLOSE-OUT DONE`. Confirm the issue reads `closed`/`completed`, then `archive_session` it.
- A wave that closes an epic: one child runs `riviera-docs-freshness` over the epic's merge span.
- When every PR is merged: stop re-arming, delete the safety net, check `main`'s CI on the last
  merge, then `PushNotification` and give the owner a short summary.
