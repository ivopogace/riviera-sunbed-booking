package ai.riviera.platform.review.domain;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The rating mean, in tenths, as integer arithmetic (AC-5) — the invariant-#5 discipline applied to
 * the rating: no {@code double} anywhere, and the rounding direction written down where the division
 * happens. Half-up, so 3.75 stars is 38 tenths rather than 37.
 */
class AggregateRatingTest {

	@Test
	void averagesExactlyWhenTheMeanIsWhole() {
		assertEquals(50, AggregateRating.tenths(5, 1));
		assertEquals(40, AggregateRating.tenths(8, 2));
		assertEquals(30, AggregateRating.tenths(9, 3));
	}

	@Test
	void roundsHalfUpAtTheDivision() {
		assertEquals(45, AggregateRating.tenths(9, 2));    // 4.5
		assertEquals(27, AggregateRating.tenths(8, 3));    // 2.666… → 26.67 tenths → 27
		assertEquals(38, AggregateRating.tenths(15, 4));   // 3.75 → 37.5 tenths → 38 (half UP)
		assertEquals(43, AggregateRating.tenths(13, 3));   // 4.333… → 43.3 tenths → 43
	}

	@Test
	void zeroReviewsShortCircuitsBeforeTheDivision() {
		assertEquals(0, AggregateRating.tenths(0, 0));
	}

	@Test
	void staysInsideTheVenueColumnsCheckRange() {
		assertEquals(10, AggregateRating.tenths(3, 3), "all-ones is the floor: 1.0 stars");
		assertEquals(50, AggregateRating.tenths(15, 3), "all-fives is the ceiling: 5.0 stars");
	}
}
