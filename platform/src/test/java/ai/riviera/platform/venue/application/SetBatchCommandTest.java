package ai.riviera.platform.venue.application;

import java.util.Set;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Pins {@link SetBatchCommand}'s boundary: a non-empty, bounded id set; at least one touched field;
 * a tier from the stored vocabulary; a price that is both-or-neither and non-negative minor units
 * with an ISO currency (invariant #5). A violation is an {@link IllegalArgumentException} at the
 * application boundary (→ {@code 400 INVALID_REQUEST}, §6b).
 */
class SetBatchCommandTest {

	private static final Set<SetId> IDS = Set.of(new SetId(1), new SetId(2));

	@Test
	void carriesTheTouchedFieldsAndLeavesTheRestNull() {
		SetBatchCommand command = new SetBatchCommand(IDS, "PREMIUM", null, null, null);

		assertEquals(IDS, command.setIds());
		assertEquals("PREMIUM", command.tier());
		assertEquals(null, command.pool());
		assertEquals(null, command.priceMinor());
	}

	@Test
	void acceptsAPoolOnlyBatch() {
		assertEquals(Pool.WALK_IN, new SetBatchCommand(IDS, null, Pool.WALK_IN, null, null).pool());
	}

	@Test
	void acceptsAPriceOnlyBatch() {
		SetBatchCommand command = new SetBatchCommand(IDS, null, null, 4000L, "EUR");

		assertEquals(4000L, command.priceMinor());
		assertEquals("EUR", command.priceCurrency());
	}

	@Test
	void rejectsABatchTouchingNothing() {
		assertThrows(IllegalArgumentException.class, () -> new SetBatchCommand(IDS, null, null, null, null));
	}

	@Test
	void rejectsAnEmptyIdSet() {
		assertThrows(IllegalArgumentException.class,
				() -> new SetBatchCommand(Set.of(), "PREMIUM", null, null, null));
	}

	@Test
	void rejectsMoreIdsThanTheLayoutBound() {
		Set<SetId> tooMany = java.util.stream.LongStream.rangeClosed(1, SetBatchCommand.MAX_SETS + 1)
				.mapToObj(SetId::new).collect(java.util.stream.Collectors.toSet());

		assertThrows(IllegalArgumentException.class,
				() -> new SetBatchCommand(tooMany, "PREMIUM", null, null, null));
	}

	@Test
	void rejectsAnUnknownTier() {
		assertThrows(IllegalArgumentException.class, () -> new SetBatchCommand(IDS, "VIP", null, null, null));
	}

	@Test
	void rejectsAHalfStatedPrice() {
		assertThrows(IllegalArgumentException.class, () -> new SetBatchCommand(IDS, null, null, 4000L, null));
		assertThrows(IllegalArgumentException.class, () -> new SetBatchCommand(IDS, null, null, null, "EUR"));
	}

	@Test
	void rejectsANegativePriceAndABadCurrency() {
		assertThrows(IllegalArgumentException.class, () -> new SetBatchCommand(IDS, null, null, -1L, "EUR"));
		assertThrows(IllegalArgumentException.class, () -> new SetBatchCommand(IDS, null, null, 100L, "euro"));
	}
}
