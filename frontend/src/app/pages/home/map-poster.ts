import {
  BEACH_CATALOGUE,
  beachEntry,
  beachesInRegion,
  REGION_CATALOGUE,
  regionEntry,
} from '../../shared/beaches';
import type { LngLat, MapHandle, MapView } from '../../shared/map-engine';
import { fitInWindow } from './camera-fit';
import { FOOT_ROW_PX, HALF_MAP_BAND_PX } from './sheet-geometry';

/**
 * The **map poster**: the still the venue sheet opens on instead of a live map, one JPEG per
 * catalogue region and beach, width bucket and DPR (`frontend/scripts/render-map-posters.mjs`,
 * ADR-0022), served under `/posters/`, never `/map/**` (Rationale: RESPONSIBILITIES.md §Platform
 * edge). The renderer bundles this module, so the poster camera and the pin projection are one
 * computation. Runtime venues aren't knowable at render time, so the page checks every pin and the
 * tourist's dot land in the pin window ({@link posterFrames}) and goes live at first paint if not.
 */

/** The shipped tourist header the ground runs under: measured at 73 at every width the sheet spans. */
export const POSTER_HEADER_PX = 73;
/** The window the pins are fitted into: from the header's foot to the foot row above the half rest. */
const WINDOW_TOP_PX = POSTER_HEADER_PX;
const WINDOW_BOTTOM_PX = POSTER_HEADER_PX + HALF_MAP_BAND_PX - FOOT_ROW_PX;
/** Where the sheet rests at half: a point below it is under the glass, not on the map. */
const HALF_TOP_PX = POSTER_HEADER_PX + HALF_MAP_BAND_PX;
/**
 * A beach's venues lie around its catalogue centre, not on it: a kilometre of reach either way
 * (0.01° is 1.1 km of latitude, 0.85 km of longitude here) is what the fit frames, so a lone
 * beach gets town scale with its venues inside the window rather than a point at its middle.
 */
const REACH_DEG = 0.01;

/** One width bucket: the still's box, and the viewport width its pins are fitted for. */
export interface PosterBucket {
  /** The still's width; a viewport up to this wide is covered with the still centred and cropped. */
  readonly width: number;
  /** The still's height; a viewport taller than this would show the pane fill under the sheet. */
  readonly height: number;
  /** The pane width the pins are fitted for: the bucket's common phone, not its widest. */
  readonly fitWidth: number;
}

/**
 * Phones up to 440 wide (the design record's 360–440, fitted for its 390) and tablets to 834 (the
 * 744–834 iPads in portrait, fitted for 768); above the widest bucket the ground is live from the
 * first paint. Each height covers the tallest device in its bucket at 2× and 3×.
 */
export const POSTER_BUCKETS: readonly PosterBucket[] = [
  { width: 440, height: 960, fitWidth: 390 },
  { width: 834, height: 1210, fitWidth: 768 },
];

export const POSTER_DENSITIES: readonly number[] = [2, 3];

/** One file of the set, as the renderer draws it and the completeness spec looks for it. */
export interface PosterEntry {
  readonly key: string;
  readonly bucket: PosterBucket;
  readonly density: number;
  readonly camera: MapView;
  readonly file: string;
}

/** The poster a viewport shows: its camera for the still handle, and the image candidates. */
export interface Poster {
  readonly key: string;
  readonly bucket: PosterBucket;
  readonly camera: MapView;
  readonly src: string;
  readonly srcset: string;
}

/** `beach-<code>` for one beach, else the region's code. */
export function posterKey(region: string, beach: string): string {
  return beach !== '' ? `beach-${beach}` : region;
}

export function posterFile(key: string, bucket: PosterBucket, density: number): string {
  return `${key}-${bucket.width}@${density}x.jpg`;
}

export function posterUrl(key: string, bucket: PosterBucket, density: number): string {
  return `/posters/${posterFile(key, bucket, density)}`;
}

/**
 * The camera a poster is rendered at, and the pins projected through: the entry's catalogue
 * geometry, each point with its reach, fitted into the pin window of a `fitWidth` × `height`
 * pane. `null` off the catalogue.
 */
export function posterCamera(region: string, beach: string, bucket: PosterBucket): MapView | null {
  const points = catalogueGeometry(region, beach);
  if (points === null) {
    return null;
  }
  const reach = points.flatMap(({ lng, lat }) => [
    { lng: lng - REACH_DEG, lat: lat - REACH_DEG },
    { lng: lng + REACH_DEG, lat: lat + REACH_DEG },
  ]);
  return fitInWindow(
    reach,
    { width: bucket.fitWidth, height: bucket.height },
    WINDOW_TOP_PX,
    WINDOW_BOTTOM_PX,
  );
}

function catalogueGeometry(region: string, beach: string): readonly LngLat[] | null {
  if (beach !== '') {
    const entry = beachEntry(beach);
    return entry === undefined ? null : [entry.view.center];
  }
  if (regionEntry(region) === undefined) {
    return null;
  }
  return beachesInRegion(regionEntry(region)!.code).map((entry) => entry.view.center);
}

/** Every still the set holds: each region and each beach of the catalogue, per bucket and density. */
export const POSTER_SET: readonly PosterEntry[] = [
  ...REGION_CATALOGUE.map((entry) => ({ region: entry.code, beach: '' })),
  ...BEACH_CATALOGUE.map((entry) => ({ region: entry.region, beach: entry.code })),
].flatMap(({ region, beach }) =>
  POSTER_BUCKETS.flatMap((bucket) =>
    POSTER_DENSITIES.map((density) => ({
      key: posterKey(region, beach),
      bucket,
      density,
      camera: posterCamera(region, beach, bucket)!,
      file: posterFile(posterKey(region, beach), bucket, density),
    })),
  ),
);

/**
 * The poster for a place on a viewport: the narrowest bucket that covers the viewport's width
 * and height, or none when the viewport is wider than the widest bucket, taller than its own, or
 * the place is off the catalogue — the ground is then live from the first paint.
 */
export function posterFor(
  region: string,
  beach: string,
  viewport: { readonly width: number; readonly height: number },
): Poster | undefined {
  const bucket = POSTER_BUCKETS.find((candidate) => candidate.width >= viewport.width);
  if (bucket === undefined || bucket.height < viewport.height) {
    return undefined;
  }
  const camera = posterCamera(region, beach, bucket);
  if (camera === null) {
    return undefined;
  }
  const key = posterKey(region, beach);
  return {
    key,
    bucket,
    camera,
    src: posterUrl(key, bucket, POSTER_DENSITIES[0]),
    srcset: POSTER_DENSITIES.map(
      (density) => `${posterUrl(key, bucket, density)} ${density}x`,
    ).join(', '),
  };
}

/**
 * Whether the poster shows every one of `points`: each projects inside the pane's width and the
 * band between the header and the sheet's half rest. The pins are fitted into that band by
 * construction; a venue off its catalogue beach, or a tourist's dot inland, may not be.
 */
export function posterFrames(
  still: Pick<MapHandle, 'project'>,
  points: readonly LngLat[],
  paneWidth: number,
): boolean {
  return points.every((point) => {
    const { x, y } = still.project(point);
    return x >= 0 && x <= paneWidth && y >= POSTER_HEADER_PX && y <= HALF_TOP_PX;
  });
}
