# Issue tracker

**Tracker:** GitHub Issues on `ivopogace/riviera-sunbed-booking`.

The engineering skills (`to-issues`, `triage`, `implement`) read from and write to
GitHub Issues. In this repo, agents reach GitHub through the **GitHub MCP tools**
(`mcp__github__*`); a contributor running Claude Code locally may use the `gh` CLI
instead — both target the same issues.

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
