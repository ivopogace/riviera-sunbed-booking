package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.booking.application.reserve.CreateStayCommand;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * Fixtures the stitched-stay ITs share: a visible Instant venue on {@code KSAMIL} with online sets in
 * one row (position = grid x) plus one walk-in set, a plan over them, and the cleanup that deletes the
 * venue's rows in dependency order.
 */
final class StayFixtures {

	static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	static final long PRICE = 4500L;
	static final GuestContact GUEST = new GuestContact("stay@example.com", "Stay Guest", "+355699");

	private StayFixtures() {
	}

	/** Ten days out: inside the guest's free cancellation window, so a cancel is admitted. */
	static LocalDate firstDay() {
		return LocalDate.now(TIRANE).plusDays(10);
	}

	record Venue(long id, List<SetId> online, SetId walkIn) {
	}

	static Venue venue(JdbcClient jdbc, String mode, Integer maxStayDays, boolean visible) {
		long venue = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency, max_stay_days)
				VALUES (:name, 'KSAMIL', :mode, 1500, 'EUR', :max) RETURNING id
				""").param("name", "Stay " + mode + " " + System.nanoTime()).param("mode", mode).param("max", maxStayDays)
				.query(Long.class).single();
		if (visible) {
			long operator = jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
					.param("u", "stay-op-" + System.nanoTime()).query(Long.class).single();
			jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
					.param("v", venue).param("o", operator).update();
		}
		List<SetId> online = new ArrayList<>();
		for (int position = 1; position <= 3; position++) {
			online.add(insertSet(jdbc, venue, position, "ONLINE"));
		}
		return new Venue(venue, List.copyOf(online), insertSet(jdbc, venue, 4, "WALK_IN"));
	}

	private static SetId insertSet(JdbcClient jdbc, long venue, int position, String pool) {
		return new SetId(jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', :pos, 'STANDARD', :pool, :price, 'EUR', :pos, 1)
				RETURNING id
				""").param("venue", venue).param("pos", position).param("pool", pool).param("price", PRICE)
				.query(Long.class).single());
	}

	/** {@code a} for the first {@code daysOnA} days, {@code b} for the remaining {@code daysOnB}. */
	static CreateStayCommand plan(SetId a, int daysOnA, SetId b, int daysOnB, LocalDate first) {
		LocalDate switchDay = first.plusDays(daysOnA);
		return new CreateStayCommand(List.of(
				new CreateStayCommand.Stretch(a, first, switchDay.minusDays(1)),
				new CreateStayCommand.Stretch(b, switchDay, switchDay.plusDays(daysOnB - 1L))), GUEST, null);
	}

	static void take(JdbcClient jdbc, SetId set, LocalDate day) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:id, :date, 'BOOKED_ONLINE')")
				.param("id", set.value()).param("date", day).update();
	}

	static long heldDays(JdbcClient jdbc, SetId set, LocalDate first, LocalDate last) {
		return jdbc.sql("SELECT count(*) FROM set_availability WHERE set_id = :s AND booking_date BETWEEN :first AND :last")
				.param("s", set.value()).param("first", first).param("last", last).query(Long.class).single();
	}

	/** Waits for the async listeners (payout, mail) to finish writing, then deletes in dependency order. */
	static void cleanup(JdbcClient jdbc, long venue) {
		org.awaitility.Awaitility.await().atMost(java.time.Duration.ofSeconds(10)).until(() -> jdbc.sql(
				"SELECT count(*) FROM event_publication WHERE completion_date IS NULL").query(Long.class).single() == 0L);
		List<Long> payments = jdbc.sql("SELECT DISTINCT payment_id FROM payment_booking "
						+ "WHERE booking_ref IN (SELECT id FROM booking WHERE venue_id = :v)").param("v", venue)
				.query(Long.class).list();
		for (String dependent : List.of("booking_confirmation_mail_attempt", "payout_ledger_entry", "review")) {
			jdbc.sql("DELETE FROM " + dependent + " WHERE booking_id IN (SELECT id FROM booking WHERE venue_id = :v)")
					.param("v", venue).update();
		}
		for (String line : List.of("remodel_receipt_move", "remodel_receipt_outcome", "remodel_receipt_kept")) {
			jdbc.sql("DELETE FROM " + line + " WHERE receipt_id IN (SELECT id FROM remodel_receipt WHERE venue_id = :v)")
					.param("v", venue).update();
		}
		jdbc.sql("DELETE FROM remodel_receipt WHERE venue_id = :v").param("v", venue).update();
		jdbc.sql("DELETE FROM payment_booking WHERE booking_ref IN (SELECT id FROM booking WHERE venue_id = :v)")
				.param("v", venue).update();
		payments.forEach(payment -> jdbc.sql("DELETE FROM payment WHERE id = :p").param("p", payment).update());
		jdbc.sql("DELETE FROM booking WHERE venue_id = :v").param("v", venue).update();
		jdbc.sql("DELETE FROM stay WHERE venue_id = :v").param("v", venue).update();
		jdbc.sql("DELETE FROM set_availability WHERE set_id IN (SELECT id FROM set_position WHERE venue_id = :v)")
				.param("v", venue).update();
		jdbc.sql("DELETE FROM set_position WHERE venue_id = :v").param("v", venue).update();
		jdbc.sql("DELETE FROM operator_venue WHERE venue_id = :v").param("v", venue).update();
		jdbc.sql("DELETE FROM venue WHERE id = :v").param("v", venue).update();
	}
}
