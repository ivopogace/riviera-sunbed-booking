# `docs/design/` — design records, not living docs

The `.dc.html` files here are **design records**: each captures the approved
look/copy/interaction at the time it was drawn (see
`2026-07-02-liquid-glass-redesign-note.md` for the intake history and the
per-file scope). They are not rewritten to track the shipped app afterward —
doing so would erase the record of what was actually approved and when.

**So an artboard can legitimately diverge from current shipped copy.** When a
later slice changes behavior the artboard depicted (e.g. cutoff-copy wording,
an icon retired in favor of a shared component), the artboard line is left as
drawn and gets a one-line `<!-- as-built diverges — see #NNN -->` pointer to
the issue/PR that changed the shipped surface, rather than being edited in
place. `docs/plans/*` final states follow the same pointer convention when a
plan cites a design line that's since drifted.

If a screen gets genuinely redesigned, that's a **new export** (new file or a
new dated intake note), not an edit to the existing record — same pattern as
the "v3 gap-fill" export superseding the first 2026-07-02 export.

`docs/design/` is part of `riviera-docs-freshness`'s substrate-doc map for
exactly this reason: a sweep should catch (and pointer-note) a diverged
artboard line, never silently drift past it.

## The exceptions: the two maintained `.md` files

Everything above governs the `.dc.html` **records**. Two `.md` files here are the
opposite kind of thing, and neither takes the `as-built diverges` convention.

`colour-literal-token-audit.md` (#836) is a **maintained ledger** — a **maintained ledger** of which hex/rgba
positions in `frontend/src` want `--riv-*` tokens, and the verdict per family. It
*is* rewritten to track the shipped app: every slice that cuts a family updates
that family's row with its PR. It sits here because it reasons about the design
substrate, not because it records an approved look. Don't apply the
`as-built diverges` pointer convention to it — bring it up to date instead.

`non-text-contrast.md` (#876) is a **living rule**: the project's settled position on
sub-3:1 non-text chrome, which token comments across `frontend/src` cite by name. It
exists because that question had been deferred four times to an issue that has since
closed, and a rule needs a home that cannot close. Same treatment as the ledger —
correct it in place when the position moves; never pointer-note it as diverged.
