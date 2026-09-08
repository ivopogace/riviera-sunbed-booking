# `docs/design/`

Two maintained design docs, plus this file. Both track the shipped app: a slice that moves
what they describe corrects them in place.

- **`colour-literal-token-audit.md`** — the ledger of which hex/rgba positions in
  `frontend/src` want `--riv-*` tokens, and the verdict per family. Every slice that cuts a
  family updates that family's row with its PR.
- **`non-text-contrast.md`** — the project's settled position on sub-3:1 non-text chrome,
  which token comments across `frontend/src` cite by name. A rule needs a home that cannot
  close; this is it. Correct it in place when the position moves.

`riviera-docs-freshness` sweeps this folder: a ledger row still open for a family that
shipped, or a rule citing a spec that does not measure what it claims, is a finding.

## There is no drawn spec

The Liquid Glass look was imported as a set of design-canvas `.dc.html` artboards and kept as
records of the approved look, pointer-noted where anyone remembered that the shipped app had
diverged. They were retired on 2026-09-08 with the canvas runtime and the intake note.

So no artboard is consultable, and no `as-built diverges` convention is maintained. What a
surface should look like lives in:

- the tokens and their comments in `frontend/src/tailwind.css`, plus the two files above;
- `riviera-tailwind` (how to write the styling) and `riviera-frontend` (where a component
  goes and who owns theming);
- the `*.contrast.spec.ts` guards and the token-drift specs, which are the executable half of
  the design and the only half that cannot silently rot.

A new screen gets its look decided in its own issue, against those. Redrawing an artboard is
not the way back — the specs are.

To read a retired artboard, find the commit that removed it and read the file at its parent:

```bash
git fetch --unshallow                     # a shallow clone answers with silence, not an error
git log --all --diff-filter=D -- 'docs/design/*.dc.html'
git show <sha>^:docs/design/<file>.dc.html
```
