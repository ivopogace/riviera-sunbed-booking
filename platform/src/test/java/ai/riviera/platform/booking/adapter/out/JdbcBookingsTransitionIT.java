package ai.riviera.platform.booking.adapter.out;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.reserve.ClaimRef;
import ai.riviera.platform.booking.application.reserve.ConfirmedBooking;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Deterministic guard semantics for the webhook-driven transitions (issue #8) — the idempotency the
 * async {@code @ApplicationModuleListener} relies on, tested directly (no async timing). Under
 * at-least-once delivery these guards make a re-delivery a safe no-op (invariant #8) and stop a stale
 * {@code canceled} from freeing a set whose booking already left {@code AWAITING_PAYMENT} (invariant
 * #2). Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JdbcBookingsTransitionIT {

	@Autowired
	Bookings bookings;

	@Autowired
	JdbcClient jdbc;

	private record SetRef(long setId, long venueId) {
	}

	private SetRef onlineSet() {
		return jdbc.sql("SELECT id, venue_id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query((rs, n) -> new SetRef(rs.getLong("id"), rs.getLong("venue_id"))).single();
	}

	private long insertAwaiting(String code, SetRef set, LocalDate date) {
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				VALUES (:code, :venue, :set, :cust, :date, 4500, 'EUR', 'AWAITING_PAYMENT')
				RETURNING id
				""")
				.param("code", code).param("venue", set.venueId()).param("set", set.setId())
				.param("cust", customer).param("date", date).query(Long.class).single();
	}

	private String statusOf(long bookingId) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", bookingId).query(String.class).single();
	}

	@Test
	void confirmFromPaymentIsIdempotent() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2027, 8, 1);
		long booking = insertAwaiting("GUARDCONF01", set, date);

		Optional<ConfirmedBooking> first =
				bookings.confirmFromPayment(booking, Instant.parse("2027-07-01T10:00:00Z"));
		assertTrue(first.isPresent(), "first delivery transitions AWAITING_PAYMENT -> CONFIRMED");
		// RETURNING yields the facts the BookingConfirmed payload is built from (invariant #11).
		assertEquals(set.setId(), first.get().setId().value());
		assertEquals(set.venueId(), first.get().venueId().value());
		assertEquals(date, first.get().bookingDate());
		assertEquals(4500L, first.get().amountMinor());
		assertEquals("EUR", first.get().currency());

		assertTrue(bookings.confirmFromPayment(booking, Instant.parse("2027-07-01T10:05:00Z")).isEmpty(),
				"a re-delivery is a benign no-op (empty), not an error");
		assertEquals("CONFIRMED", statusOf(booking));
	}

	@Test
	void cancelReturnsClaimOnceThenEmpty() {
		SetRef set = onlineSet();
		LocalDate date = LocalDate.of(2027, 8, 2);
		long booking = insertAwaiting("GUARDCANC01", set, date);

		Optional<ClaimRef> first = bookings.cancelAwaitingPayment(booking);
		assertTrue(first.isPresent(), "first cancel transitions and returns the (set,date) to release");
		assertEquals(set.setId(), first.get().setId().value());
		assertEquals(date, first.get().bookingDate());

		assertTrue(bookings.cancelAwaitingPayment(booking).isEmpty(),
				"a re-delivered cancel returns empty — nothing more to release");
		assertEquals("CANCELLED", statusOf(booking));
	}

	@Test
	void confirmAfterCancelIsNoOp() {
		// A stale confirm arriving after cancellation must not resurrect the booking.
		long booking = insertAwaiting("GUARDRACE01", onlineSet(), LocalDate.of(2027, 8, 3));
		bookings.cancelAwaitingPayment(booking);

		assertTrue(bookings.confirmFromPayment(booking, Instant.parse("2027-07-01T10:00:00Z")).isEmpty(),
				"confirm on a non-AWAITING_PAYMENT booking is a no-op (empty)");
		assertEquals("CANCELLED", statusOf(booking));
	}
	@Test
	void sweepSelectionUsesTheAcceptClockForAcceptedRequests() {
		// #98 AC-6 (plan R-2): an ACCEPTED request is expirable only after accepted_at + pay-window,
		// NEVER on the created_at + instant-TTL clock — a request often sits pending for hours
		// before accept, so the creation clock would sweep it the moment it was accepted.
		SetRef set = onlineSet();
		java.time.Instant now = java.time.Instant.now();

		// Accepted request: created 25h ago, accepted 1h ago.
		long acceptedRequest = insertAwaiting("SWEEPCLK01", set, LocalDate.of(2027, 9, 1));
		jdbc.sql("UPDATE booking SET created_at = :created, accepted_at = :accepted WHERE id = :id")
				.param("created", java.sql.Timestamp.from(now.minus(java.time.Duration.ofHours(25))))
				.param("accepted", java.sql.Timestamp.from(now.minus(java.time.Duration.ofHours(1))))
				.param("id", acceptedRequest).update();
		// Instant booking: created 20 minutes ago, never accepted (accepted_at NULL).
		long instantBooking = insertAwaiting("SWEEPCLK02", set, LocalDate.of(2027, 9, 2));
		jdbc.sql("UPDATE booking SET created_at = :created WHERE id = :id")
				.param("created", java.sql.Timestamp.from(now.minus(java.time.Duration.ofMinutes(20))))
				.param("id", instantBooking).update();

		// TTL 15m / pay-window 12h: the stale instant booking is selected; the accepted request
		// (1h into its 12h window, though 25h old by creation) is NOT.
		var withinPayWindow = bookings.findExpirableAwaitingPayment(
				now.minus(java.time.Duration.ofMinutes(15)), now.minus(java.time.Duration.ofHours(12)));
		var ids = withinPayWindow.stream().map(ai.riviera.platform.booking.vocabulary.BookingId::value).toList();
		org.junit.jupiter.api.Assertions.assertTrue(ids.contains(instantBooking),
				"a stale instant booking expires on the creation clock");
		org.junit.jupiter.api.Assertions.assertFalse(ids.contains(acceptedRequest),
				"an accepted request inside its pay-window must not be swept (accept clock)");

		// Once the pay-window has elapsed (window shrunk to 30m), the accepted request IS selected.
		var pastPayWindow = bookings.findExpirableAwaitingPayment(
				now.minus(java.time.Duration.ofMinutes(15)), now.minus(java.time.Duration.ofMinutes(30)));
		var lateIds = pastPayWindow.stream().map(ai.riviera.platform.booking.vocabulary.BookingId::value).toList();
		org.junit.jupiter.api.Assertions.assertTrue(lateIds.contains(acceptedRequest),
				"an accepted request past its pay-window is expirable");
	}

}
