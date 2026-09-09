package ai.riviera.platform.booking.domain;

import java.time.LocalDate;
import java.util.Collection;
import java.util.Comparator;
import java.util.Optional;

import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetSpot;

/**
 * The move rule: where a booking goes when a remodel takes its set. A candidate is a free spot on
 * the <em>same date</em>, in the {@link Pool#ONLINE} pool, of the same or a better tier; among
 * candidates the same row wins, then the closest position, then the closest row, the lowest id
 * breaking a tie so the answer is stable. Never a worse tier, never a walk-in set, never another
 * date. Pure, so it lives in {@code domain} (ADR-0018 §2); the caller hands in the free pool and
 * takes a picked spot out of it before ranking the next claim on that date.
 */
public final class MoveRanking {

	private MoveRanking() {
	}

	/** Where a claim on {@code from} would move, with the distance in rows and positions. */
	public record Move(SetSpot to, int rowsAway, int positionsAway) {
	}

	public static Optional<Move> pick(SetSpot from, LocalDate date, Collection<FreeSpot> pool) {
		return pool.stream()
				.filter(candidate -> candidate.date().equals(date))
				.map(FreeSpot::spot)
				.filter(spot -> spot.pool() == Pool.ONLINE && spot.tier().atLeast(from.tier()))
				.map(spot -> new Move(spot,
						Math.abs(spot.placement().gridY() - from.placement().gridY()),
						Math.abs(spot.placement().positionNo() - from.placement().positionNo())))
				.min(Comparator.comparingInt((Move move) -> move.rowsAway() == 0 ? 0 : 1)
						.thenComparingInt(Move::positionsAway)
						.thenComparingInt(Move::rowsAway)
						.thenComparingLong(move -> move.to().setId().value()));
	}
}
