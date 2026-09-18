import type { MapView } from './map-engine';

/**
 * The fixed platform beach catalogue — the frontend mirror of the backend
 * `ai.riviera.platform.venue.vocabulary.Beach` enum, as `amenities.ts` mirrors `Amenity`. **Codes
 * travel the wire; labels are display-only**, spelled as the self-hosted map tiles draw the place
 * (OpenStreetMap's name, diacritics included), so the filter, the card, the place pill and the map
 * label all say the same word. Declaration order is the canonical display order: north to south,
 * the order a tourist reads the coast.
 *
 * Each entry also carries the riviera map's camera view for it — a hand-recorded centre and a
 * town-scale zoom — which is what lets the Discover filters move the map with no geocoding service
 * (ADR-0022). The backend never needs these, so they live only here.
 */
export type RegionCode = 'SHKODER' | 'LEZHE' | 'DURRES' | 'FIER' | 'VLORE' | 'HIMARE' | 'SARANDE';

export type BeachCode =
  | 'VELIPOJE'
  | 'SHENGJIN'
  | 'TALE'
  | 'PATOK'
  | 'LALEZ'
  | 'CURRILA'
  | 'DURRES'
  | 'SHKEMBI_I_KAVAJES'
  | 'GOLEM'
  | 'QERRET'
  | 'SPILLE'
  | 'DIVJAKE'
  | 'SEMAN'
  | 'DAREZEZE'
  | 'ZVERNEC'
  | 'VLORE'
  | 'RADHIME'
  | 'ORIKUM'
  | 'PALASE'
  | 'DRYMADES'
  | 'DHERMI'
  | 'GJIPE'
  | 'JALE'
  | 'LIVADHI'
  | 'HIMARE'
  | 'POTAM'
  | 'LLAMANI'
  | 'QEPARO'
  | 'BORSH'
  | 'LUKOVE'
  | 'BUNEC'
  | 'KAKOME'
  | 'SARANDE'
  | 'PASQYRA'
  | 'PULEBARDHA'
  | 'KSAMIL';

export interface RegionEntry {
  readonly code: RegionCode;
  readonly label: string;
  /** Where the riviera map eases to when this region is chosen: the stretch at area scale. */
  readonly view: MapView;
}

export interface BeachEntry {
  readonly code: BeachCode;
  readonly label: string;
  readonly region: RegionCode;
  /** Where the riviera map eases to when this beach is chosen: the beach at town scale. */
  readonly view: MapView;
}

/** The zoom a single beach is shown at: the bay and its venues, not the whole stretch. */
const BEACH_ZOOM = 13;

/** The regions in canonical (north to south) order. */
export const REGION_CATALOGUE: readonly RegionEntry[] = [
  { code: 'SHKODER', label: 'Shkodër', view: { center: { lng: 19.42, lat: 41.85 }, zoom: 11 } },
  { code: 'LEZHE', label: 'Lezhë', view: { center: { lng: 19.58, lat: 41.72 }, zoom: 10.5 } },
  { code: 'DURRES', label: 'Durrës', view: { center: { lng: 19.48, lat: 41.28 }, zoom: 10.5 } },
  { code: 'FIER', label: 'Fier', view: { center: { lng: 19.42, lat: 40.82 }, zoom: 10 } },
  { code: 'VLORE', label: 'Vlorë', view: { center: { lng: 19.46, lat: 40.4 }, zoom: 10.5 } },
  { code: 'HIMARE', label: 'Himarë', view: { center: { lng: 19.75, lat: 40.08 }, zoom: 10 } },
  { code: 'SARANDE', label: 'Sarandë', view: { center: { lng: 20.0, lat: 39.83 }, zoom: 11 } },
];

/** The beaches in canonical (north to south) order — the backend enum's ordinal order. */
export const BEACH_CATALOGUE: readonly BeachEntry[] = [
  beach('VELIPOJE', 'Velipojë', 'SHKODER', 19.411, 41.848),
  beach('SHENGJIN', 'Shëngjin', 'LEZHE', 19.594, 41.813),
  beach('TALE', 'Tale', 'LEZHE', 19.575, 41.72),
  beach('PATOK', 'Patok', 'LEZHE', 19.57, 41.62),
  beach('LALEZ', 'Lalëz', 'DURRES', 19.48, 41.47),
  beach('CURRILA', 'Currila', 'DURRES', 19.43, 41.33),
  beach('DURRES', 'Durrës', 'DURRES', 19.46, 41.3),
  beach('SHKEMBI_I_KAVAJES', 'Shkëmbi i Kavajës', 'DURRES', 19.49, 41.27),
  beach('GOLEM', 'Golem', 'DURRES', 19.51, 41.24),
  beach('QERRET', 'Qerret', 'DURRES', 19.51, 41.21),
  beach('SPILLE', 'Spille', 'DURRES', 19.47, 41.09),
  beach('DIVJAKE', 'Divjakë', 'FIER', 19.47, 40.98),
  beach('SEMAN', 'Seman', 'FIER', 19.4, 40.78),
  beach('DAREZEZE', 'Darëzezë', 'FIER', 19.38, 40.66),
  beach('ZVERNEC', 'Zvërnec', 'VLORE', 19.42, 40.51),
  beach('VLORE', 'Vlorë', 'VLORE', 19.48, 40.43),
  beach('RADHIME', 'Radhimë', 'VLORE', 19.48, 40.36),
  beach('ORIKUM', 'Orikum', 'VLORE', 19.47, 40.32),
  beach('PALASE', 'Palasë', 'HIMARE', 19.607, 40.175),
  beach('DRYMADES', 'Drymades', 'HIMARE', 19.627, 40.155),
  beach('DHERMI', 'Dhërmi', 'HIMARE', 19.645, 40.145),
  beach('GJIPE', 'Gjipe', 'HIMARE', 19.665, 40.125),
  beach('JALE', 'Jalë', 'HIMARE', 19.7, 40.117),
  beach('LIVADHI', 'Livadhi', 'HIMARE', 19.723, 40.107),
  beach('HIMARE', 'Himarë', 'HIMARE', 19.744, 40.1),
  beach('POTAM', 'Potam', 'HIMARE', 19.76, 40.09),
  beach('LLAMANI', 'Llamani', 'HIMARE', 19.78, 40.075),
  beach('QEPARO', 'Qeparo', 'HIMARE', 19.81, 40.06),
  beach('BORSH', 'Borsh', 'HIMARE', 19.86, 40.06),
  beach('LUKOVE', 'Lukovë', 'HIMARE', 19.92, 39.99),
  beach('BUNEC', 'Bunec', 'HIMARE', 19.94, 39.96),
  beach('KAKOME', 'Kakome', 'HIMARE', 19.965, 39.93),
  beach('SARANDE', 'Sarandë', 'SARANDE', 20.005, 39.875),
  beach('PASQYRA', 'Pasqyra', 'SARANDE', 20.02, 39.8),
  beach('PULEBARDHA', 'Pulëbardha', 'SARANDE', 20.03, 39.79),
  beach('KSAMIL', 'Ksamil', 'SARANDE', 20.0, 39.77),
];

function beach(
  code: BeachCode,
  label: string,
  region: RegionCode,
  lng: number,
  lat: number,
): BeachEntry {
  return { code, label, region, view: { center: { lng, lat }, zoom: BEACH_ZOOM } };
}

const BEACH_BY_CODE: ReadonlyMap<string, BeachEntry> = new Map(
  BEACH_CATALOGUE.map((entry) => [entry.code, entry]),
);
const REGION_BY_CODE: ReadonlyMap<string, RegionEntry> = new Map(
  REGION_CATALOGUE.map((entry) => [entry.code, entry]),
);

/** The catalogue entry for a beach code, or `undefined` off the catalogue. */
export function beachEntry(code: string): BeachEntry | undefined {
  return BEACH_BY_CODE.get(code);
}

/** The catalogue entry for a region code, or `undefined` off the catalogue. */
export function regionEntry(code: string): RegionEntry | undefined {
  return REGION_BY_CODE.get(code);
}

/** The display label for a beach code; an unknown code is shown as it came, never thrown on. */
export function beachLabel(code: string): string {
  return BEACH_BY_CODE.get(code)?.label ?? code;
}

/** The display label for a region code; an unknown code is shown as it came, never thrown on. */
export function regionLabel(code: string): string {
  return REGION_BY_CODE.get(code)?.label ?? code;
}

/** The catalogue's beaches in one region, in catalogue order. */
export function beachesInRegion(region: RegionCode): readonly BeachEntry[] {
  return BEACH_CATALOGUE.filter((entry) => entry.region === region);
}

/**
 * The catalogue entries among `codes`, in catalogue order, unknowns and duplicates dropped — what a
 * filter select lists so it never offers a beach no venue is on, in the order the coast reads.
 */
export function presentBeaches(codes: readonly string[]): readonly BeachEntry[] {
  const present = new Set(codes);
  return BEACH_CATALOGUE.filter((entry) => present.has(entry.code));
}

/** The regions of the given beach codes, in catalogue order, each once. */
export function presentRegions(codes: readonly string[]): readonly RegionEntry[] {
  const regions = new Set(presentBeaches(codes).map((entry) => entry.region));
  return REGION_CATALOGUE.filter((entry) => regions.has(entry.code));
}
