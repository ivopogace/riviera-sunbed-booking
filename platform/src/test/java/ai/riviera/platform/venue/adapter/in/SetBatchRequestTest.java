package ai.riviera.platform.venue.adapter.in;

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.application.SetBatchCommand;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.Pool;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Pins the wire-to-command edge of the batch body: absent fields stay absent (never defaulted), the
 * pool token becomes a {@link Pool} here, a duplicate id collapses, and a missing id list or an
 * unknown token is an {@link IllegalArgumentException} — raised inside the controller's
 * {@code InvalidApiRequestException.parsing}, so the client sees {@code 400 INVALID_REQUEST} (§6b).
 */
class SetBatchRequestTest {

	@Test
	void mapsOnlyTheFieldsTheBodyCarries() {
		SetBatchCommand command = new SetBatchRequest(List.of(1L, 2L, 2L), null, "WALK_IN", null, 5L)
				.toCommand();

		assertEquals(Set.of(new SetId(1), new SetId(2)), command.setIds());
		assertNull(command.tier());
		assertEquals(Pool.WALK_IN, command.pool());
		assertNull(command.priceMinor());
		assertNull(command.priceCurrency());
	}

	@Test
	void mapsThePriceToMinorUnitsAndCurrency() {
		SetBatchCommand command = new SetBatchRequest(List.of(1L), "PREMIUM", null,
				new MoneyView(4000, "EUR"), 5L).toCommand();

		assertEquals(4000L, command.priceMinor());
		assertEquals("EUR", command.priceCurrency());
		assertEquals("PREMIUM", command.tier());
	}

	@Test
	void rejectsAMissingIdList() {
		assertThrows(IllegalArgumentException.class,
				() -> new SetBatchRequest(null, "PREMIUM", null, null, 5L).toCommand());
	}

	@Test
	void rejectsAnUnknownPoolToken() {
		assertThrows(IllegalArgumentException.class,
				() -> new SetBatchRequest(List.of(1L), null, "vip", null, 5L).toCommand());
	}
}
