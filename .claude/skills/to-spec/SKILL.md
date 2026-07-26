---
name: to-spec
description: Turn the current conversation into a spec and publish it to the project issue tracker — no interview, just synthesis of what you've already discussed. Epic/feature altitude (user stories + testing seams + out-of-scope), the optional step ahead of to-issues; slice-level detail stays in riviera-plan-doc.
---

> **In riviera-sunbed-booking (localization):**
> - **Tracker** = GitHub via the MCP tools (not `gh`); **labels** per `docs/agents/triage-labels.md`.
> - **Altitude — this is the epic/feature spec, not the slice plan.** It holds user
>   stories + testing seams + out-of-scope, committed **once** as the epic issue (a
>   rule-10 source-of-intent doc). Per-**slice** detail — testable ACs, risk register,
>   invariant proof, the Execution-status state store — stays in `riviera-plan-doc`.
>   Keep the two at different altitudes; don't restate slice ACs here.
> - **Flow:** sits between **Refine** and **Issue** in `riviera-sdlc`. The numbered
>   **User Stories** it produces are the source `to-issues` slices against ("user stories
>   covered"). A foggy epic may feed it from `wayfinder` first.
> - **Label:** the spec is the **epic issue** (source of intent). The `ready-for-agent`
>   AFK-ready tickets are the **slices** `to-issues` cuts from it — do **not** blanket
>   `ready-for-agent` on the epic itself; that label belongs on the implementable slices.
> - Use `CONTEXT.md` vocabulary and respect `docs/adr/`. The `/setup-matt-pocock-skills`
>   line below is upstream boilerplate — this repo's substrate already provides the
>   tracker + label vocabulary.

This skill takes the current conversation context and codebase understanding and produces a spec (you may know this document as a PRD). Do NOT interview the user — just synthesize what you already know.

The issue tracker and triage label vocabulary should have been provided to you — run `/setup-matt-pocock-skills` if not.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Check with the user that these seams match their expectations.

3. Write the spec using the template below, then publish it to the project issue tracker. Apply the `ready-for-agent` triage label - no need for additional triage.

## Spec Template

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

Example:
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.
