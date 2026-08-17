package ai.riviera.platform;

import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Test-fixture ownership grants. Since #693 the tourist reads and the reserve path hide any
 * venue without an {@code ACTIVE} owner, so a fixture venue that a test books or expects in the
 * tourist reads needs an ownership row — the bootstrap {@code operator} (always {@code ACTIVE})
 * is the standard owner.
 */
public final class OwnershipFixtures {

	private OwnershipFixtures() {
	}

	/** Map {@code venueId} to the bootstrap {@code operator} so the venue is tourist-visible. */
	public static void grantToBootstrap(JdbcClient jdbc, long venueId) {
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) "
						+ "SELECT :v, id FROM operator WHERE username = 'operator'")
				.param("v", venueId).update();
	}
}
