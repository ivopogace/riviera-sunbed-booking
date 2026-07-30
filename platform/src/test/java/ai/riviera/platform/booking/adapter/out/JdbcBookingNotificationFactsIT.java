package ai.riviera.platform.booking.adapter.out;

import java.time.LocalDate;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.vocabulary.BookingConfirmationFacts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.BookingNotificationInfo;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The {@code booking.api.BookingNotificationFacts} read port (#371, Email S3): the two facts
 * {@code BookingConfirmed} deliberately does not carry — the arrival code (invariant #7) and the
 * guest-contact id the edge resolves an address from. Everything else the confirmation email needs
 * is either on the event payload or already published by {@code venue.api.SetBookingFacts}, which
 * is why this port stays two fields wide.
 *
 * <p>Since #380 it also covers {@code confirmationFacts} — the wider read an admin resend needs,
 * because a resend has no event payload to take the date, amount and currency from.
 *
 * <p>Deliberately <strong>not</strong> filtered by status: the listener fires on a published
 * confirmation fact, and a booking cancelled in the interim must still resolve (plan R-7).
 * Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JdbcBookingNotificationFactsIT {

	@Autowired
	BookingNotificationFacts notificationFacts;

	@Autowired
	JdbcClient jdbc;

	private record SetRef(long setId, long venueId) {
	}

	private SetRef onlineSet() {
		return jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"))).single();
	}

	private long insertCustomer(String email) {
		return jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", email).query(Long.class).single();
	}

	private long insertBooking(String code, long customerId, String status) {
		SetRef set = onlineSet();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, 2500, 'EUR', :status)
				RETURNING id
				""")
				.param("code", code).param("venue", set.venueId()).param("set", set.setId())
				.param("cust", customerId).param("date", LocalDate.of(2027, 9, 4))
				.param("status", status).query(Long.class).single();
	}

	@Test
	void resolvesTheArrivalCodeAndTheContactIdToNotify() {
		long customerId = insertCustomer("notify-me@example.com");
		long bookingId = insertBooking("NOTIFY01", customerId, "CONFIRMED");

		BookingNotificationInfo info =
				notificationFacts.notificationInfo(new BookingId(bookingId)).orElseThrow();

		assertEquals("NOTIFY01", info.code(), "the arrival code the email must carry (invariant #7)");
		assertEquals(customerId, info.customerId().value(),
				"the guest-contact id the edge resolves the recipient address from");
	}

	@Test
	void resolvesABookingCancelledAfterConfirmation() {
		long customerId = insertCustomer("cancelled-late@example.com");
		long bookingId = insertBooking("NOTIFY02", customerId, "CANCELLED");

		assertTrue(notificationFacts.notificationInfo(new BookingId(bookingId)).isPresent(),
				"no status filter — a booking cancelled between confirmation and the async send "
						+ "must still resolve, so the listener never silently drops a published fact");
	}

	@Test
	void unknownBookingIsEmptyNotAnError() {
		Optional<BookingNotificationInfo> info =
				notificationFacts.notificationInfo(new BookingId(-1L));

		assertTrue(info.isEmpty(), "an absent booking is empty, never null and never an exception");
	}

	/**
	 * The resend read (#380). The automatic listener takes date, amount and currency off the
	 * {@code BookingConfirmed} payload, but an admin resend has no event to read — so the same facts
	 * have to come from the module that owns them, in one round trip.
	 */
	@Test
	void readsEveryFactAResendMustRebuildTheMailFrom() {
		long customerId = insertCustomer("resend-me@example.com");
		long bookingId = insertConfirmedBooking("RESEND01", customerId, 4500L);

		BookingConfirmationFacts facts =
				notificationFacts.confirmationFacts(new BookingId(bookingId)).orElseThrow();

		assertEquals(onlineSet().setId(), facts.setId().value(), "the set the venue labels come from");
		assertEquals(LocalDate.of(2027, 9, 4), facts.bookingDate());
		assertEquals(4500L, facts.amountMinor(), "integer minor units (invariant #5)");
		assertEquals("EUR", facts.currency());
		assertEquals("RESEND01", facts.code(), "read at send time, never persisted into an event (#7)");
		assertEquals(customerId, facts.customerId().value());
		assertTrue(facts.everConfirmed(), "confirmed_at is stamped, so a confirmation was due");
	}

	/**
	 * The guard the resend needs: a booking that never reached CONFIRMED was never owed a confirmation,
	 * and mailing "your booking is confirmed" for one would be a lie to the tourist. Reported as a fact
	 * rather than as an empty {@code Optional}, so the admin surface can say <em>why</em> it refused.
	 */
	@Test
	void reportsABookingThatWasNeverConfirmedAsSuch() {
		long customerId = insertCustomer("never-confirmed@example.com");
		long bookingId = insertBooking("NEVERCON", customerId, "AWAITING_PAYMENT");

		BookingConfirmationFacts facts =
				notificationFacts.confirmationFacts(new BookingId(bookingId)).orElseThrow();

		assertFalse(facts.everConfirmed(), "no confirmed_at stamp — no confirmation mail was ever due");
	}

	/**
	 * {@code confirmed_at}, not {@code status}, is what "was a confirmation due" reads from: a booking
	 * cancelled after confirmation did receive one, and a status test would report it as never confirmed.
	 */
	@Test
	void stillReportsAConfirmationWasDueAfterACancellation() {
		long customerId = insertCustomer("cancelled-after-confirm@example.com");
		long bookingId = insertConfirmedBooking("CANCAFTR", customerId, 3000L);
		jdbc.sql("UPDATE booking SET status = 'CANCELLED' WHERE id = :id").param("id", bookingId).update();

		assertTrue(notificationFacts.confirmationFacts(new BookingId(bookingId)).orElseThrow().everConfirmed());
	}

	@Test
	void unknownBookingHasNoConfirmationFacts() {
		assertTrue(notificationFacts.confirmationFacts(new BookingId(-1L)).isEmpty());
	}

	/** A booking that really went through the confirm transition — {@code confirmed_at} stamped. */
	private long insertConfirmedBooking(String code, long customerId, long amountMinor) {
		long bookingId = insertBooking(code, customerId, "CONFIRMED");
		jdbc.sql("UPDATE booking SET confirmed_at = NOW(), amount_minor = :amount WHERE id = :id")
				.param("amount", amountMinor).param("id", bookingId).update();
		return bookingId;
	}
}
