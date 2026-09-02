package ai.riviera.platform;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Seeds the venue / set / customer / booking rows the review tests need, so each one can state its
 * own scenario in a line. Every fixture is unique per call, so tests never collide on the
 * uniqueness constraints the schema enforces (booking code, grid cell, guest email).
 */
public final class ReviewFixtures {

	private static final AtomicLong SEQ = new AtomicLong();

	private final JdbcClient jdbc;

	public ReviewFixtures(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public long venue(String name) {
		return jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'Ksamil', 'Review IT', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""")
				.param("name", name + " " + SEQ.incrementAndGet()).query(Long.class).single();
	}

	/** A booking in {@code status}, with {@code completedAt} stamped only when it is a real check-in. */
	public String booking(long venueId, String status, Instant completedAt) {
		long seq = SEQ.incrementAndGet();
		long setId = jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:v, 'A', :seq, 'STANDARD', 'ONLINE', 2500, 'EUR', :seq, 1)
				RETURNING id
				""")
				.param("v", venueId).param("seq", seq).query(Long.class).single();
		long customerId = jdbc.sql("""
				INSERT INTO customer (email, full_name, phone)
				VALUES (:email, 'Review Guest', '+355690000000')
				RETURNING id
				""")
				.param("email", "review-" + seq + "@example.test").query(Long.class).single();
		String code = "RVW" + seq + "TEST";
		jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, amount_minor,
				                     amount_currency, status, completed_at)
				VALUES (:code, :v, :s, :c, :date, 2500, 'EUR', :status, :completedAt)
				""")
				.param("code", code).param("v", venueId).param("s", setId).param("c", customerId)
				.param("date", LocalDate.of(2026, 7, 1))
				.param("status", status)
				.param("completedAt", completedAt == null ? null : Timestamp.from(completedAt))
				.update();
		return code;
	}

	/** A stay checked in at {@code completedAt} — the eligible starting point for most tests. */
	public String completedBooking(long venueId, Instant completedAt) {
		return booking(venueId, "COMPLETED", completedAt);
	}

	/**
	 * A stored review of the stay behind {@code code}, written the way the claim writes it — venue and
	 * stay date taken from the booking row. {@code comment} may be {@code null} for a star-only row.
	 *
	 * @return the review's id, the value the public listing's cursor is made of
	 */
	public long review(String code, int stars, String comment, String displayName) {
		return jdbc.sql("""
				INSERT INTO review (booking_id, venue_id, stay_date, stars, comment, display_name,
				                    created_at)
				SELECT id, venue_id, booking_date, :stars, :comment, :displayName, :createdAt
				FROM booking WHERE code = :code
				RETURNING id
				""")
				.param("code", code).param("stars", stars).param("comment", comment)
				.param("displayName", displayName).param("createdAt", Timestamp.from(Instant.now()))
				.query(Long.class).single();
	}

	/** Take the review with this id out of public view, the way an admin takedown leaves the row. */
	public void hide(long reviewId) {
		jdbc.sql("UPDATE review SET hidden_at = :hiddenAt WHERE id = :id")
				.param("id", reviewId).param("hiddenAt", Timestamp.from(Instant.now())).update();
	}

	public long bookingIdOf(String code) {
		return jdbc.sql("SELECT id FROM booking WHERE code = :code")
				.param("code", code).query(Long.class).single();
	}

	public long reviewCountFor(String code) {
		return jdbc.sql("SELECT count(*) FROM review WHERE booking_id = :id")
				.param("id", bookingIdOf(code)).query(Long.class).single();
	}
}
