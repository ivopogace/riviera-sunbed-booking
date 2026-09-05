package ai.riviera.platform.venue.adapter.in;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.Pool;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Pins the wire-to-command edge for the pool token: the body carries the same string the CHECK
 * stores, {@link SetPositionRequest#toCommand()} is where it becomes a {@link Pool}, and a missing
 * or unknown token is an {@link IllegalArgumentException} there — raised inside the controller's
 * {@code InvalidApiRequestException.parsing}, so the client sees {@code 400 INVALID_REQUEST} (§6b).
 */
class SetPositionRequestTest {

	private static SetPositionRequest withPool(String pool) {
		return new SetPositionRequest("Row A", 1, "STANDARD", pool, new MoneyView(3000, "EUR"), 1, 1);
	}

	@Test
	void mapsTheTokenToThePool() {
		assertEquals(Pool.WALK_IN, withPool("WALK_IN").toCommand().pool());
	}

	@Test
	void rejectsAnUnknownPoolToken() {
		assertThrows(IllegalArgumentException.class, () -> withPool("VIP").toCommand());
		assertThrows(IllegalArgumentException.class, () -> withPool("online").toCommand());
	}

	@Test
	void rejectsAMissingPool() {
		assertThrows(IllegalArgumentException.class, () -> withPool(null).toCommand());
	}
}
