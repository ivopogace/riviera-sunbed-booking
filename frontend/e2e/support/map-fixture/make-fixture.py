#!/usr/bin/env python3
"""Builds riviera-fixture.pmtiles: a tiny, synthetic OpenMapTiles-schema archive (z0-z6) the mocked
Playwright suite serves in place of the real extract, so the REAL MapLibre adapter renders sea, a
coast road and three labelled places through the shipped style, sprites and glyphs.

Synthetic geometry, not OpenStreetMap data: a straight coastline, one road, three points. It exists
only so the real-engine e2e requests every resource kind (style, sprite, glyph, tile) and the
network guard sees them all. Regenerate with:

    pip install pmtiles mapbox-vector-tile
    python3 frontend/e2e/support/map-fixture/make-fixture.py

README.md next to this file records provenance.
"""

import gzip
import math
from pathlib import Path

import mapbox_vector_tile
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer
from shapely import clip_by_rect
from shapely.geometry import LineString, Point, Polygon

OUT = Path(__file__).with_name("riviera-fixture.pmtiles")
BBOX = (19.30, 39.55, 20.20, 40.55)  # west, south, east, north — the riviera stretch the synthetic geometry covers
MAX_ZOOM = 6
EXTENT = 4096
R = 6378137.0


def mercator(lng: float, lat: float) -> tuple[float, float]:
    return R * math.radians(lng), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def tile_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    n = 2**z
    lng0, lng1 = x / n * 360 - 180, (x + 1) / n * 360 - 180
    lat1 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    lat0 = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    (minx, miny), (maxx, maxy) = mercator(lng0, lat0), mercator(lng1, lat1)
    return minx, miny, maxx, maxy


def tile_at(lng: float, lat: float, z: int) -> tuple[int, int]:
    n = 2**z
    lat_r = math.radians(lat)
    x = int((lng + 180) / 360 * n)
    y = int((1 - math.log(math.tan(lat_r) + 1 / math.cos(lat_r)) / math.pi) / 2 * n)
    return min(x, n - 1), min(y, n - 1)


def to_mercator(coords):
    return [mercator(lng, lat) for lng, lat in coords]


SEA = Polygon(to_mercator([(17.0, 38.0), (19.58, 38.0), (19.58, 42.0), (17.0, 42.0)]))
COAST_ROAD = LineString(
    to_mercator([(19.50, 40.45), (19.63, 40.20), (19.75, 40.10), (19.92, 39.92), (20.00, 39.77)])
)
PLACES = [
    ("Himarë", "town", 19.744, 40.101),
    ("Dhërmi", "village", 19.647, 40.152),
    ("Ksamil", "village", 20.005, 39.767),
]


def layers_for(bounds):
    minx, miny, maxx, maxy = bounds
    pad = (maxx - minx) * 0.05
    clip = (minx - pad, miny - pad, maxx + pad, maxy + pad)
    layers = []
    sea = clip_by_rect(SEA, *clip)
    if not sea.is_empty:
        layers.append({"name": "water", "features": [{"geometry": sea, "properties": {"class": "ocean"}}]})
    road = clip_by_rect(COAST_ROAD, *clip)
    if not road.is_empty:
        layers.append(
            {"name": "transportation", "features": [{"geometry": road, "properties": {"class": "primary"}}]}
        )
    places = [
        {
            "geometry": Point(*mercator(lng, lat)),
            "properties": {"class": cls, "name": name, "name_en": name, "name:latin": name, "rank": 1},
        }
        for name, cls, lng, lat in PLACES
        if minx <= mercator(lng, lat)[0] <= maxx and miny <= mercator(lng, lat)[1] <= maxy
    ]
    if places:
        layers.append({"name": "place", "features": places})
    return layers


def main() -> None:
    tiles = {}
    for z in range(MAX_ZOOM + 1):
        x0, y0 = tile_at(BBOX[0], BBOX[3], z)
        x1, y1 = tile_at(BBOX[2], BBOX[1], z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                bounds = tile_bounds(z, x, y)
                layers = layers_for(bounds)
                if not layers:
                    continue
                data = mapbox_vector_tile.encode(
                    layers, default_options={"quantize_bounds": bounds, "extents": EXTENT}
                )
                tiles[zxy_to_tileid(z, x, y)] = gzip.compress(data)

    with OUT.open("wb") as f:
        writer = Writer(f)
        for tile_id in sorted(tiles):
            writer.write_tile(tile_id, tiles[tile_id])
        writer.finalize(
            {
                "tile_type": TileType.MVT,
                "tile_compression": Compression.GZIP,
                "min_zoom": 0,
                "max_zoom": MAX_ZOOM,
                "min_lon_e7": int(BBOX[0] * 1e7),
                "min_lat_e7": int(BBOX[1] * 1e7),
                "max_lon_e7": int(BBOX[2] * 1e7),
                "max_lat_e7": int(BBOX[3] * 1e7),
                "center_zoom": 5,
                "center_lon_e7": int((BBOX[0] + BBOX[2]) / 2 * 1e7),
                "center_lat_e7": int((BBOX[1] + BBOX[3]) / 2 * 1e7),
            },
            {
                "name": "riviera-fixture",
                "description": "Synthetic e2e fixture — not OpenStreetMap data",
                "vector_layers": [
                    {"id": "water", "fields": {"class": "String"}},
                    {"id": "transportation", "fields": {"class": "String"}},
                    {"id": "place", "fields": {"class": "String", "name": "String", "name_en": "String", "rank": "Number"}},
                ],
            },
        )
    print(f"{OUT.name}: {len(tiles)} tiles, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
