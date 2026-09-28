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

	/** A stored stay: its row id, its code and its stretches' booking ids in day order. */
	record SeededStay(long id, String code, List<Long> stretches) {
	}

	/**
	 * A stay inserted as stored, never claimed: the {@code stay} row, then one booking per stretch with the
	 * given status (the trigger writes the days of a {@code CONFIRMED} one). {@code first} is the stay's
	 * first day; the guest is on {@code a} for {@code daysOnA} days, then on {@code b} for {@code daysOnB}.
	 */
	static SeededStay insertStay(JdbcClient jdbc, Venue venue, String code, LocalDate first, SetId a, int daysOnA,
			String statusA, SetId b, int daysOnB, String statusB) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		LocalDate switchDay = first.plusDays(daysOnA);
		LocalDate last = switchDay.plusDays(daysOnB - 1L);
		long stay = jdbc.sql("INSERT INTO stay (code, venue_id, first_date, last_date) VALUES (:c, :v, :f, :l) RETURNING id")
				.param("c", code).param("v", venue.id()).param("f", first).param("l", last).query(Long.class).single();
		long onA = insertStretch(jdbc, code + "-1", venue, a, customer, first, switchDay.minusDays(1), stay, statusA);
		long onB = insertStretch(jdbc, code + "-2", venue, b, customer, switchDay, last, stay, statusB);
		return new SeededStay(stay, code, List.of(onA, onB));
	}

	private static long insertStretch(JdbcClient jdbc, String rowCode, Venue venue, SetId set, long customer,
			LocalDate first, LocalDate last, long stay, String status) {
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date, amount_minor,
				                     amount_currency, status, confirmed_at, stay_id)
				VALUES (:code, :venue, :set, :cust, :first, :last, :price, 'EUR', :status, now(), :stay)
				RETURNING id
				""").param("code", rowCode).param("venue", venue.id()).param("set", set.value()).param("cust", customer)
				.param("first", first).param("last", last).param("price", PRICE).param("status", status).param("stay", stay)
				.query(Long.class).single();
	}

	/**
	 * A stay request inserted as stored, holding nothing (ADR-0025): the {@code stay} row, then one
	 * {@code PENDING_REQUEST} booking per stretch sharing {@code expiresAt}, the guest on {@code a} for
	 * {@code daysOnA} days from {@code first}, then on {@code b} for {@code daysOnB}.
	 */
	static SeededStay insertPendingStay(JdbcClient jdbc, Venue venue, String code, LocalDate first, SetId a,
			int daysOnA, SetId b, int daysOnB, java.time.Instant expiresAt) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Stay Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		LocalDate switchDay = first.plusDays(daysOnA);
		LocalDate last = switchDay.plusDays(daysOnB - 1L);
		long stay = jdbc.sql("INSERT INTO stay (code, venue_id, first_date, last_date) VALUES (:c, :v, :f, :l) RETURNING id")
				.param("c", code).param("v", venue.id()).param("f", first).param("l", last).query(Long.class).single();
		long onA = insertPendingStretch(jdbc, code + "-1", venue, a, customer, first, switchDay.minusDays(1), stay,
				expiresAt);
		long onB = insertPendingStretch(jdbc, code + "-2", venue, b, customer, switchDay, last, stay, expiresAt);
		return new SeededStay(stay, code, List.of(onA, onB));
	}

	private static long insertPendingStretch(JdbcClient jdbc, String rowCode, Venue venue, SetId set, long customer,
			LocalDate first, LocalDate last, long stay, java.time.Instant expiresAt) {
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date, amount_minor,
				                     amount_currency, status, request_expires_at, stay_id)
				VALUES (:code, :venue, :set, :cust, :first, :last, :amount, 'EUR', 'PENDING_REQUEST', :expires, :stay)
				RETURNING id
				""").param("code", rowCode).param("venue", venue.id()).param("set", set.value()).param("cust", customer)
				.param("first", first).param("last", last)
				.param("amount", PRICE * (last.toEpochDay() - first.toEpochDay() + 1))
				.param("expires", java.sql.Timestamp.from(expiresAt)).param("stay", stay)
				.query(Long.class).single();
	}

	/** A lone {@code PENDING_REQUEST} on {@code set} over {@code first..last}, holding nothing. */
	static long insertPendingLone(JdbcClient jdbc, Venue venue, String code, SetId set, LocalDate first, LocalDate last,
			java.time.Instant expiresAt) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) VALUES (:e, 'Lone Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date, amount_minor,
				                     amount_currency, status, request_expires_at)
				VALUES (:code, :venue, :set, :cust, :first, :last, :amount, 'EUR', 'PENDING_REQUEST', :expires)
				RETURNING id
				""").param("code", code).param("venue", venue.id()).param("set", set.value()).param("cust", customer)
				.param("first", first).param("last", last)
				.param("amount", PRICE * (last.toEpochDay() - first.toEpochDay() + 1))
				.param("expires", java.sql.Timestamp.from(expiresAt))
				.query(Long.class).single();
	}

	/** The operator {@link #venue} made owner of a visible venue. */
	static ai.riviera.platform.operator.vocabulary.OperatorId ownerOf(JdbcClient jdbc, Venue venue) {
		return new ai.riviera.platform.operator.vocabulary.OperatorId(jdbc.sql(
				"SELECT operator_id FROM operator_venue WHERE venue_id = :v").param("v", venue.id())
				.query(Long.class).single());
	}

	static String statusOf(JdbcClient jdbc, long bookingId) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id").param("id", bookingId).query(String.class).single();
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
