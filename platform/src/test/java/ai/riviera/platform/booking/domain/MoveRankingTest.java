package ai.riviera.platform.booking.domain;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.SetSpot;
import ai.riviera.platform.venue.vocabulary.Tier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The move rule: same date, online pool, same or better tier; prefer the same row, then the
 * closest position, then the closest row; the distance is reported in rows and positions. Pure
 * unit test of the {@code domain} holder — the pool is handed in already free.
 */
class MoveRankingTest {

	private static final LocalDate DATE = LocalDate.of(2026, 9, 20);
	private static final SetSpot A3 = spot(3, "A", 3, 1, Tier.STANDARD, Pool.ONLINE);

	private static SetSpot spot(long id, String row, int position, int gridY, Tier tier, Pool pool) {
		return new SetSpot(new SetId(id), new SetPlacement(row, position, position, gridY), tier, pool);
	}

	private static FreeSpot free(SetSpot spot) {
		return new FreeSpot(spot, DATE);
	}

	@Test
	void prefersTheSameRowOverACloserPositionInAnotherRow() {
		SetSpot a7 = spot(7, "A", 7, 1, Tier.STANDARD, Pool.ONLINE);
		SetSpot b3 = spot(13, "B", 3, 2, Tier.STANDARD, Pool.ONLINE);
		Optional<MoveRanking.Move> move = MoveRanking.pick(A3, DATE, List.of(free(b3), free(a7)));
		assertEquals(new MoveRanking.Move(a7, 0, 4), move.orElseThrow());
	}

	@Test
	void withinTheSameRowTheClosestPositionWins() {
		SetSpot a1 = spot(1, "A", 1, 1, Tier.STANDARD, Pool.ONLINE);
		SetSpot a7 = spot(7, "A", 7, 1, Tier.STANDARD, Pool.ONLINE);
		Optional<MoveRanking.Move> move = MoveRanking.pick(A3, DATE, List.of(free(a7), free(a1)));
		assertEquals(new MoveRanking.Move(a1, 0, 2), move.orElseThrow());
	}

	@Test
	void acrossRowsTheClosestPositionThenTheClosestRowWins() {
		SetSpot c3 = spot(23, "C", 3, 3, Tier.STANDARD, Pool.ONLINE);
		SetSpot b5 = spot(15, "B", 5, 2, Tier.STANDARD, Pool.ONLINE);
		SetSpot d3 = spot(33, "D", 3, 4, Tier.STANDARD, Pool.ONLINE);
		Optional<MoveRanking.Move> move = MoveRanking.pick(A3, DATE, List.of(free(d3), free(b5), free(c3)));
		assertEquals(new MoveRanking.Move(c3, 2, 0), move.orElseThrow());
	}

	@Test
	void neverAWorseTierButABetterOneWillDo() {
		SetSpot premiumA3 = spot(3, "A", 3, 1, Tier.PREMIUM, Pool.ONLINE);
		SetSpot standardA4 = spot(4, "A", 4, 1, Tier.STANDARD, Pool.ONLINE);
		SetSpot premiumB1 = spot(11, "B", 1, 2, Tier.PREMIUM, Pool.ONLINE);
		assertEquals(new MoveRanking.Move(premiumB1, 1, 2),
				MoveRanking.pick(premiumA3, DATE, List.of(free(standardA4), free(premiumB1))).orElseThrow());
		assertEquals(new MoveRanking.Move(premiumB1, 1, 2),
				MoveRanking.pick(A3, DATE, List.of(free(premiumB1))).orElseThrow());
	}

	@Test
	void neverAWalkInSetAndNeverAnotherDate() {
		SetSpot walkInA4 = spot(4, "A", 4, 1, Tier.STANDARD, Pool.WALK_IN);
		SetSpot a5 = spot(5, "A", 5, 1, Tier.STANDARD, Pool.ONLINE);
		assertTrue(MoveRanking.pick(A3, DATE, List.of(free(walkInA4), new FreeSpot(a5, DATE.plusDays(1))))
				.isEmpty());
	}

	@Test
	void anEmptyPoolAnswersEmpty() {
		assertTrue(MoveRanking.pick(A3, DATE, List.of()).isEmpty());
	}
}
