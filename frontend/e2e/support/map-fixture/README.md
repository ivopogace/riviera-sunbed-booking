# The riviera map's e2e fixture archive

`riviera-fixture.pmtiles` is a **synthetic** PMTiles archive (a few kB, zoom 0–6) that the mocked
Playwright suite serves for `/map/riviera.pmtiles` in place of the real extract
(`platform/map/riviera.pmtiles`, ADR-0022). It carries a straight coastline as a `water` polygon,
one `transportation` line and three `place` points named Himarë, Dhërmi and Ksamil, in the
OpenMapTiles schema the shipped OSM Liberty style reads — enough for the **real** MapLibre adapter
to request every resource kind through the style (sprite, glyph ranges, tiles), which is what the
network guard in `e2e/discover-map.e2e.ts` needs to see.

It is not OpenStreetMap data and must never ship: `e2e/support/map-resources.ts` is the only
reader. The style, sprites and glyphs the same helper serves are the real committed ones under
`platform/map/`.

Regenerate with `make-fixture.py` (Python 3.11+, `pip install pmtiles mapbox-vector-tile`); the
script is the provenance, and its constants are the only inputs.
