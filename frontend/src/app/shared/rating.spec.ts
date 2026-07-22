import { isRated, ratingScore } from './rating';

describe('rating helpers', () => {
  describe('isRated', () => {
    it('is true for a venue with at least one review', () => {
      expect(isRated({ ratingTenths: 48, reviewsCount: 326 })).toBe(true);
    });

    it('is false for a venue with no reviews (the "New" / unrated case, #154)', () => {
      expect(isRated({ ratingTenths: 0, reviewsCount: 0 })).toBe(false);
    });

    it('is false even if ratingTenths is non-zero but there are no reviews', () => {
      // reviewsCount is the source of truth for "rated"; a stray score without reviews is still New.
      expect(isRated({ ratingTenths: 40, reviewsCount: 0 })).toBe(false);
    });
  });

  describe('ratingScore', () => {
    it('renders tenths as a one-decimal display string', () => {
      expect(ratingScore(48)).toBe('4.8');
      expect(ratingScore(41)).toBe('4.1');
      expect(ratingScore(50)).toBe('5.0');
    });
  });
});
