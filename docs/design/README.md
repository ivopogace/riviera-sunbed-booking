# `docs/design/` — two living design docs

This folder holds the design substrate the app is still held to. Both files here are
**maintained**: they track the shipped app, and a slice that moves what they describe
corrects them in place.

- **`colour-literal-token-audit.md`** — the ledger of which hex/rgba positions in
  `frontend/src` want `--riv-*` tokens, and the verdict per family. Every slice that cuts a
  family updates that family's row with its PR.
- **`non-text-contrast.md`** — the project's settled position on sub-3:1 non-text chrome,
  which token comments across `frontend/src` cite by name. A rule needs a home that cannot
  close; this is it. Correct it in place when the position moves.

`riviera-docs-freshness` sweeps both: a ledger row still open for a family that shipped, or a
rule citing a spec that does not measure what it claims, is a finding.

## The visual spec is the app

The Liquid Glass look was imported in 2026-07 as a set of design-canvas `.dc.html`
artboards, kept as never-rewritten records of the approved look and pointer-noted wherever
the shipped app diverged. The tourist header rework and the operator/admin console-nav epic
took the shipped surfaces far enough from those artboards — and set a direction that keeps
moving — that the records had stopped describing anything and had started misleading readers
who took them for a spec. They were retired on 2026-09-08 along with the canvas runtime
(`support.js`, `image-slot.js`) and the 2026-07-02 intake note; `git log --diff-filter=D --
'docs/design/*'` recovers any of them.

So there is no drawn spec to consult, and no `as-built diverges` convention to maintain. What
a surface should look like now lives in:

- the tokens and their comments in `frontend/src/tailwind.css`, plus the two files above;
- `riviera-tailwind` (how to write the styling) and `riviera-frontend` (where a component
  goes and who owns theming);
- the contrast and token-drift specs beside each component, which are the executable half of
  the design and the only half that cannot silently rot.

A genuinely new screen gets its look decided in its own issue, against those. Redrawing an
artboard is not the way back — the specs are.
