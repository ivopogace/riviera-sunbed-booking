import { miramarMapVenue } from './miramar-map';
import type { MockSetView, MockVenueMapView } from './venue-views';

/**
 * Made-up beaches at the layout editor's limits (40 columns × 26 rows), for the phone row lens
 * (#1762): `wide20` is the widest beach whose overview still fits a 390px phone, `wide40` the
 * widest the editor allows, `deep26` the deepest. Sets are taken where `(position + row) % 5 === 0`,
 * as on the Miramar fixture.
 */
export type WideBeach = 'wide20' | 'wide40' | 'deep26';

const letters = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => String.fromCharCode(65 + from + i));

/** Row label → [sets in the row, price in minor units]. */
function shape(kind: WideBeach): Record<string, readonly [number, number]> {
  const rows = (labels: readonly string[], width: number, minorUnits: number) =>
    Object.fromEntries(labels.map((label) => [label, [width, minorUnits] as const]));
  switch (kind) {
    case 'wide20':
      return {
        A: [20, 4500],
        B: [20, 3500],
        ...rows(letters(2, 5), 18, 2500),
        ...rows(letters(6, 7), 14, 2000),
      };
    case 'wide40':
      return {
        A: [40, 4500],
        ...rows(letters(1, 2), 40, 3500),
        ...rows(letters(3, 5), 36, 2500),
        ...rows(letters(6, 9), 32, 2000),
      };
    case 'deep26':
      return {
        A: [10, 4500],
        ...rows(letters(1, 2), 10, 3500),
        ...rows(letters(3, 7), 10, 2500),
        ...rows(letters(8, 25), 10, 2000),
      };
  }
}

export function wideBeachVenue(kind: WideBeach): MockVenueMapView {
  const sets: MockSetView[] = [];
  Object.entries(shape(kind)).forEach(([rowLabel, [width, minorUnits]], r) => {
    for (let p = 0; p < width; p++) {
      sets.push({
        id: sets.length + 1,
        rowLabel,
        positionNo: p + 1,
        tier: rowLabel === 'A' ? 'PREMIUM' : 'STANDARD',
        pool: 'ONLINE',
        price: { minorUnits, currency: 'EUR' },
        gridX: p + 1,
        gridY: r + 1,
        availability: (p + r) % 5 === 0 ? 'TAKEN' : 'FREE',
      });
    }
  });
  return { ...miramarMapVenue(), name: 'Wide Beach Club', sets };
}

/**
 * A venue re-read for a two-day stay with every tile state on it: in rows B–D the last set is
 * walk-in, and where `(position + row) % 7 === 3` a free set is free on the first day only.
 */
export function withEveryState(venue: MockVenueMapView, firstDate: string): MockVenueMapView {
  const rows = [...new Set(venue.sets.map((set) => set.rowLabel))];
  const widths = new Map(
    rows.map((row) => [row, venue.sets.filter((set) => set.rowLabel === row).length]),
  );
  return {
    ...venue,
    sets: venue.sets.map((set) => {
      const r = rows.indexOf(set.rowLabel);
      const p = set.positionNo - 1;
      if (set.availability !== 'FREE') {
        return set;
      }
      if (r > 0 && r < 4 && set.positionNo === widths.get(set.rowLabel)) {
        return { ...set, pool: 'WALK_IN' };
      }
      return (p + r) % 7 === 3
        ? { ...set, availability: 'PARTLY_FREE', freeDays: 1, takenDates: [addDay(firstDate)] }
        : set;
    }),
  };
}

function addDay(iso: string): string {
  const day = new Date(`${iso}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}
