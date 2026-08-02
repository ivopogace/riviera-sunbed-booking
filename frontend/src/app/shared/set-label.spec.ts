import { SetView } from './venue-views';
import { setLabel, setsById, tierLabel, tierSentenceLabel, touristTierLabel } from './set-label';

/**
 * The shared set + tier labelling vocabulary (#218): the per-surface rendered strings are pinned
 * here so the consuming components' specs only need to verify wiring, not wording.
 */
describe('set-label', () => {
  describe('setsById / setLabel', () => {
    it('labels a known set as "row · position"', () => {
      const byId = setsById([seat(1, 'A', 1), seat(7, 'B', 3)]);
      expect(setLabel(byId, 7)).toBe('B · 3');
    });

    it('falls back to the raw id for a set the loaded map does not know', () => {
      const byId = setsById([seat(1, 'A', 1)]);
      expect(setLabel(byId, 99)).toBe('Set 99');
    });

    it('indexes empty for an unloaded map, so every lookup falls back', () => {
      const byId = setsById(undefined);
      expect(byId.size).toBe(0);
      expect(setLabel(byId, 5)).toBe('Set 5');
    });
  });

  describe('tier labels — one mapping, three pinned surface variants', () => {
    it('names the operator-surface labels "Front row" / "Standard"', () => {
      expect(tierLabel('PREMIUM')).toBe('Front row');
      expect(tierLabel('STANDARD')).toBe('Standard');
    });

    it('lower-cases the sentence variant for mid-sentence accessible names', () => {
      expect(tierSentenceLabel('PREMIUM')).toBe('front row');
      expect(tierSentenceLabel('STANDARD')).toBe('standard');
    });

    it('names the tourist-facing tier "Premium" / "Standard"', () => {
      expect(touristTierLabel('PREMIUM')).toBe('Premium');
      expect(touristTierLabel('STANDARD')).toBe('Standard');
    });
  });
});

function seat(id: number, rowLabel: string, positionNo: number): SetView {
  return {
    id,
    rowLabel,
    positionNo,
    tier: 'STANDARD',
    pool: 'ONLINE',
    price: { minorUnits: 2000, currency: 'EUR' },
    gridX: positionNo,
    gridY: 1,
    availability: 'FREE',
  };
}
