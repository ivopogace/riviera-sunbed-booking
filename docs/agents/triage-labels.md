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

Area labels drive **skill routing** in `riviera-sdlc`: `area:frontend` → Angular
skills + Angular MCP; `area:backend` → `codebase-design` / `domain-modeling` + `postgres` (Flyway/table
design) + `riviera-stripe-payments` (payment/payout); both always plan with
`riviera-plan-doc` and review with `riviera-review-overlay`.
