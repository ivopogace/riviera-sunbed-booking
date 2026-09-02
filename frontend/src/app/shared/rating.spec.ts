import { isRated, ratingScore, reviewsLabel, starGlyphs, starsOutOfFive } from './rating';

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

describe('reviewsLabel', () => {
  it('agrees the noun with the count', () => {
    expect(reviewsLabel(1)).toBe('1 review');
    expect(reviewsLabel(2)).toBe('2 reviews');
    expect(reviewsLabel(326)).toBe('326 reviews');
  });

  it('is plural at zero, which no rated surface renders anyway', () => {
    expect(reviewsLabel(0)).toBe('0 reviews');
  });
});

describe('starGlyphs', () => {
  it('fills the given stars and leaves the rest hollow, five in all', () => {
    expect(starGlyphs(4)).toBe('★★★★☆');
    expect(starGlyphs(1)).toBe('★☆☆☆☆');
    expect(starGlyphs(5)).toBe('★★★★★');
  });
});

describe('starsOutOfFive', () => {
  it('names the rating the way the review panel announces it', () => {
    expect(starsOutOfFive(4)).toBe('4 out of 5 stars');
  });
});
