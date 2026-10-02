# Close-out prompt template

Sent to a child right after its PR is merged. Fill the angle brackets; the numbering is
pr-gates §3's, so the child's `CLOSE-OUT DONE` block answers point by point.

```text
PR #<N> is squash-merged onto main as <sha> (<date time>Z). Now run the rest of the riviera-sdlc
pr-gates §3 close-out, re-reading that reference rather than working from memory:

1. Confirm #<issue> reads closed/completed (the PR's "Closes #<issue>" should have done it; if
   not, close it with a completion comment carrying the Claude Code footer).
2. Parent epic checklist: <tick the PR on #<epic> | #<issue> has no parent, say so>.
3. Deferred findings: <each sub-bar review finding and Scope-notes residual, and where it goes:
   a follow-up issue, a comment on the issue that inherits it, or "recorded in the PR's Scope
   notes, no issue">. Nothing else needs a follow-up issue unless you judge otherwise.
4. Plan doc: <already removed in <sha>, say so | N/A, no plan doc>.
5. Docs-freshness: <not an epic close-out, skip | run riviera-docs-freshness over <range>>.
6. End any PR-activity subscription and delete any safety-net trigger you hold.
7. No notification needed: the orchestrator reports to the owner.

<Anything the merge bar let through for the record, e.g. "amend the ### Code review comment to
state the effort and the overlay items checked, with the footer".>

End the turn with `CLOSE-OUT DONE` and send the same block to @parent.
```
