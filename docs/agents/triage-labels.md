# Triage labels

The label vocabulary the `triage` and `to-issues` skills apply. Two orthogonal
axes — **state** (where an issue is in its lifecycle) and **area** (what part of the
system it touches). An issue carries exactly one state label and one or more area
labels.

## State (the canonical triage roles)

| Label | Meaning |
|---|---|
| `needs-triage` | Maintainer needs to evaluate it. |
| `needs-info` | Waiting on the reporter for detail. |
| `ready-for-agent` | Fully specified, AFK-ready — an agent can pick it up with no extra human context. |
| `ready-for-human` | Needs a human (judgement call, external setup, secret). |
| `wontfix` | Will not be actioned (record rationale; rejected ideas go to `.out-of-scope/`). |

## Category

| Label | Meaning |
|---|---|
| `enhancement` | New behavior / feature slice. |
| `bug` | Something is broken. |

## Area (project-specific)

| Label | Meaning |
|---|---|
| `area:backend` | Spring Modulith backend. |
| `area:frontend` | Angular frontend. |
| `area:fullstack` | Cuts through both. |
| `area:devops` | CI/CD, infra, tooling. |
| `foundational` | Enabling work others are blocked by (scaffolding, pipeline). |
| `good first issue` | Gentle, well-scoped entry point for a new contributor. |

Area labels are the **starting hint** for skill routing — the authority is
`riviera-sdlc`'s Skill-routing table, and the real trigger is what the change
actually touches, not the label.

## Wayfinding (planning — the `wayfinder` skill)

Used only when charting a **foggy epic** with `wayfinder` (trigger + chain:
`riviera-sdlc` SKILL.md § *Epic front-end*). These label the map issue and its
**decision** tickets — questions whose resolution is a decision, not build slices. They
live only for the charting phase; execution tickets use the state/category/area labels
above.

| Label | Meaning |
|---|---|
| `wayfinder:map` | The map issue — the effort's shared index of decisions + frontier. |
| `wayfinder:research` | Decision ticket resolved by reading docs/APIs (AFK — the vendored `research` skill, in a subagent). |
| `wayfinder:prototype` | Decision ticket resolved by a cheap rough artifact (HITL — the vendored `prototype` skill; its throwaway code lands on a spike branch, never main). |
| `wayfinder:grilling` | Decision ticket resolved by conversation (HITL — `grilling` + `domain-modeling`). The default. |
| `wayfinder:task` | Manual work that must happen before a decision can be made (provision access, move data). |
