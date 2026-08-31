# Issue tracker

**Tracker:** GitHub Issues on `ivopogace/riviera-sunbed-booking`.

The engineering skills (`to-issues`, `triage`, `wayfinder`) read from and write to
GitHub Issues. In this repo, agents reach GitHub through the **GitHub MCP tools**
(`mcp__plugin_github_github__*`) — the convention for tracker ops even though `gh` is
provisioned in cloud sessions too (proxy-restricted; `riviera-sdlc`
`references/pr-gates.md` §1). A contributor running Claude Code locally may
use the `gh` CLI instead — both target the same issues.

**External PRs as a triage surface:** No. Pull requests here are normal review
(the two of us), not an inbound feature-request channel. `triage` therefore works
on issues only and leaves in-flight collaborator PRs alone. Revisit if the repo
later takes contributions from strangers.

**Conventions**
- One issue per vertical slice (a tracer bullet through every layer), created via
  `to-issues`.
- Issues that are fully specified and ready for an agent to pick up carry
  `ready-for-agent` (see `triage-labels.md`).
- Reference the issue number (`#NN`) in the branch's commits and its plan doc.

## Wayfinding operations

How this repo physically expresses a wayfinder map. The `wayfinder` skill asks for this
section by name; its **labels** live in `triage-labels.md` § Wayfinding. Charting only —
once a slice enters execution the plan doc's Execution status is the state store.

| Operation | How GitHub expresses it here |
|---|---|
| **Map** | An issue labelled `wayfinder:map`. |
| **Ticket** | A **native sub-issue** of the map — `mcp__plugin_github_github__sub_issue_write`, or `POST /repos/{o}/{r}/issues/{map}/sub_issues`. |
| **Claim** | Assign the ticket to the dev driving the map. An open, **unassigned** ticket is unclaimed. |
| **Blocking** | **Native issue dependencies** — `GET/POST /repos/{o}/{r}/issues/{n}/dependencies/blocked_by`. No MCP tool wraps it, so use `gh api`. |
| **Frontier** | Open sub-issues of the map that are unassigned and whose `blocked_by` list is empty-or-all-closed. There is no single query: list the sub-issues, then check `blocked_by` per candidate. |

> **The write body takes `issue_id`, not `issue_number`** — the numeric REST id, which is
> nothing like the `#NN` everyone reads (issue **#367** has id **4986850745**). Resolve it
> with `gh api repos/{o}/{r}/issues/{n} --jq .id` first. Posting a `#NN` here either 422s or
> silently links the wrong issue.

Because blocking needs `gh api`, a cloud session hits the repo-scope proxy: plain REST is
served, so these calls work where `gh pr list`-style subcommands 403 (`riviera-sdlc`
`references/pr-gates.md` §1 has the substitution table).
