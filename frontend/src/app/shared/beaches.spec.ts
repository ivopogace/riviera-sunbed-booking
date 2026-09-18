import { describe, expect, it } from 'vitest';

import {
  BEACH_CATALOGUE,
  REGION_CATALOGUE,
  beachEntry,
  beachLabel,
  beachesInRegion,
  presentBeaches,
  presentRegions,
  regionEntry,
  regionLabel,
} from './beaches';

describe('beaches (the catalogue mirror)', () => {
  it('labels a code with the map spelling and echoes an unknown code unchanged', () => {
    expect(beachLabel('DHERMI')).toBe('Dhërmi');
    expect(beachLabel('KSAMIL')).toBe('Ksamil');
    expect(regionLabel('HIMARE')).toBe('Himarë');
    expect(beachLabel('Somewhere Else')).toBe('Somewhere Else');
    expect(regionLabel('valueOf')).toBe('valueOf');
  });

  it('places every beach in a catalogue region and gives it a town-scale view', () => {
    const regions = new Set(REGION_CATALOGUE.map((r) => r.code));
    for (const entry of BEACH_CATALOGUE) {
      expect(regions.has(entry.region)).toBe(true);
      expect(entry.view.zoom).toBeGreaterThan(regionEntry(entry.region)!.view.zoom);
      expect(entry.view.center.lat).toBeGreaterThan(39.5);
      expect(entry.view.center.lat).toBeLessThan(42.1);
      expect(entry.view.center.lng).toBeGreaterThan(19.2);
      expect(entry.view.center.lng).toBeLessThan(20.2);
    }
  });

  it('has no duplicate codes and reads the coast north to south', () => {
    const codes = BEACH_CATALOGUE.map((b) => b.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes[0]).toBe('VELIPOJE');
    expect(codes.at(-1)).toBe('KSAMIL');
    expect(beachEntry('PALASE')?.region).toBe('HIMARE');
    expect(beachesInRegion('LEZHE').map((b) => b.code)).toEqual(['SHENGJIN', 'TALE', 'PATOK']);
  });

  it('lists the present beaches and regions in catalogue order, unknowns dropped', () => {
    const present = presentBeaches(['KSAMIL', 'DHERMI', 'Nowhere', 'DHERMI', 'PALASE']);
    expect(present.map((b) => b.code)).toEqual(['PALASE', 'DHERMI', 'KSAMIL']);
    expect(presentRegions(['KSAMIL', 'DHERMI', 'Nowhere']).map((r) => r.code)).toEqual([
      'HIMARE',
      'SARANDE',
    ]);
  });
});
