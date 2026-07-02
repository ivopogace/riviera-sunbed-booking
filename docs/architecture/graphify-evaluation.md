# Graphify evaluation — do agents spend fewer tokens with a code knowledge graph?

**Date:** 2026-07-02 · **Verdict: not adopted** (real but modest savings; costs outweigh them at this repo's scale)

## What was evaluated

[Graphify](https://github.com/safishamsi/graphify) (PyPI: `graphifyy`, v0.9.4) builds a
knowledge graph of code + docs (tree-sitter structural pass, optional LLM semantic pass)
and claims large token savings ("71.5x fewer tokens per query") for AI agents that query
the graph instead of reading raw files.

Setup on this repo: `uv tool install graphifyy && graphify update .` → 5,215 nodes /
11,526 edges in ~5s (structural pass only; the LLM semantic-doc pass needs an
`ANTHROPIC_API_KEY` and was skipped). The query tools were spot-checked as accurate —
`graphify explain "BookingCancelled"` correctly maps the event to its two real listeners.

## Method

The same SDLC pre-implementation research task — *"trace the booking-cancellation flow end
to end: endpoint → policy enforcement → event → every downstream listener"* — was run in
headless `claude -p` sessions (claude-sonnet-5, `--output-format json` for exact token
usage), one condition exploring raw files (Read/Grep/Glob), one instructed to navigate via
the graphify CLI. The graph directory was hidden from the baseline run.

**Confound found and corrected:** the naive baseline answered in one turn with zero tool
calls, reproducing code details that exist only in the source (e.g. `CancellationView`'s
exact record fields) — with CLAUDE.md as priming, the model surfaces apparent training-data
memorization of this public repo. The corrected round forces both conditions to cite
`file:line` for every claim, so both must actually verify in the working tree.

## Results (grounded round, n=1 per condition)

| condition | turns | wall time | total input tokens | output tokens | cost |
|---|---|---|---|---|---|
| raw exploration | 34 | 132s | 2,165,637 | 8,044 | $1.09 |
| graphify-assisted | 31 | 115s | 1,832,309 | 7,352 | $0.94 |

Graphify: **1.18x fewer input tokens, 1.16x lower cost, ~13% faster.** Answer quality was
equivalent — both traces were correct and fully cited; both found the same two listeners
(`BookingRefundListener`, `BookingCancelledPayoutListener`), the synchronous
`AvailabilityClaim.release`, and independently flagged the same stale Javadoc in
`BookingCancelled.java`.

## Why not adopted

- ~1.2x on this repo, not 71x — the headline claim targets large mixed corpora (PDFs,
  transcripts, office files) we don't have; at ~30k LOC grep is already cheap.
- The navigation problem is already solved here twice over: the curated substrate docs
  (CLAUDE.md / CONTEXT.md / RESPONSIBILITIES.md / skills) and Spring Modulith's
  machine-verified module graph (`ApplicationModules` + `Documenter`).
- Adoption costs: a ~6.6MB generated `graphify-out/graph.json` that goes stale on every
  merge (another `riviera-docs-freshness` surface), a Python toolchain in a Gradle+npm
  repo, LLM cost for the semantic pass, and an unvetted personal-repo dependency in the
  SDLC loop.
- Caveats on the measurement itself: one task, one run per condition (treat 15% as
  directional), and training-data memorization of this public repo flatters any baseline.

**Revisit if** the corpus grows a large unstructured non-code pile (venue contracts,
transcripts, scans) — that is the tool's actual sweet spot.

## Reproducing

```
uv tool install graphifyy
graphify update .            # structural graph, no LLM needed (~5s)
graphify explain "BookingCancelled"
graphify path "BookingCancelled" "SetAvailability"
rm -rf graphify-out          # regenerable; gitignored
```
