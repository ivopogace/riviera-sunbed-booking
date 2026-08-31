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
