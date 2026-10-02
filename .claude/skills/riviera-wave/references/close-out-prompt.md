# Close-out prompt template

Sent to a child right after its PR is merged. Fill the angle brackets and keep one of each
`|`-separated alternative. The numbering is pr-gates §3's, so the child's `CLOSE-OUT DONE` block
answers point by point; two items deliberately differ from §3, because the wave splits the work:
item 6 also ends the safety-net check-in a child armed while watching its PR, and item 7 leaves
the notification to the orchestrator, which reports the whole wave.

```text
PR #<N> is squash-merged onto main as <sha> (<date time>Z). Now run the rest of the riviera-sdlc
pr-gates §3 close-out, re-reading that reference rather than working from memory:

1. Confirm #<issue> reads closed/completed (the PR's "Closes #<issue>" should have done it; if
   not, close it with a completion comment carrying the Claude Code footer).
2. Parent epic checklist: <tick the PR on #<epic> | #<issue> has no parent, say so>.
3. Deferred findings: write each sub-bar review finding and Scope-notes residual onto its
   follow-up issue, or onto the open issue that inherits it (<the ones you know of>), with enough
   context to pick up cold; a finding without a home gets a new issue.
4. Plan doc: <already removed in <sha>, say so | N/A, no plan doc>.
5. Docs-freshness: <not an epic close-out, skip | run riviera-docs-freshness over <range>>.
6. End any PR-activity subscription and delete any safety-net trigger you hold.
7. No notification: the orchestrator reports to the owner once the wave is done.

End the turn with `CLOSE-OUT DONE` and send the same block to @parent.
```
