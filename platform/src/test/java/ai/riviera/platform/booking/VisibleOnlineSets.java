package ai.riviera.platform.booking;

import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * The shared "newest bookable set" picker for booking ITs on the shared Testcontainers instance.
 * Newest, so a `(set, date)` choice cannot collide with older fixtures' claims; visible-only
 * (owner {@code ACTIVE}), because since #693 the reserve path refuses a hidden venue's set — a
 * sibling test's hidden fixture venue must never be pickable here.
 */
final class VisibleOnlineSets {

	private VisibleOnlineSets() {
	}

	record VisibleOnlineSet(long id, long venueId, long priceMinor, String priceCurrency) {
	}

	static VisibleOnlineSet newest(JdbcClient jdbc) {
		return jdbc.sql("""
				SELECT sp.id, sp.venue_id, sp.price_minor, sp.price_currency
				FROM set_position sp
				JOIN operator_venue ov ON ov.venue_id = sp.venue_id
				JOIN operator o ON o.id = ov.operator_id AND o.status = 'ACTIVE'
				WHERE sp.pool = 'ONLINE' ORDER BY sp.id DESC LIMIT 1
				""")
				.query((rs, n) -> new VisibleOnlineSet(rs.getLong("id"), rs.getLong("venue_id"),
						rs.getLong("price_minor"), rs.getString("price_currency")))
				.single();
	}
}
