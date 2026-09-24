package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.booking.api.RemodelClaims;
import ai.riviera.platform.booking.application.cancel.CancelBooking;
import ai.riviera.platform.booking.application.cancel.CancelOutcome;
import ai.riviera.platform.booking.application.refund.ReleaseAbandonedBooking;
import ai.riviera.platform.booking.application.request.DeclineOutcome;
import ai.riviera.platform.booking.application.request.ExpireRequests;
import ai.riviera.platform.booking.application.request.RespondToRequest;
import ai.riviera.platform.booking.application.request.WithdrawOutcome;
import ai.riviera.platform.booking.application.request.WithdrawRequest;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.PreviewToken;
import ai.riviera.platform.booking.vocabulary.RefundConfirmation;
import ai.riviera.platform.booking.vocabulary.RemodelClaim;
import ai.riviera.platform.booking.vocabulary.RemodelCommit;
import ai.riviera.platform.booking.vocabulary.RemodelOutcome;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Every terminal transition frees every service day of a stay, and the remodel move re-seats every
 * one of them: a three-day booking is seeded directly with its three {@code (set, date)} rows held,
 * the leg runs through its own driving port, and the proof is that all three days re-claim
 * afterwards. {@code set_availability} carries no link to a booking, so a day a leg forgot would be
 * unrecoverable (invariant #2); this is the slice's correctness risk stated as a test per leg. Each
 * case gets its own venue and sets, so the shared container never makes two legs share a row.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
		"booking.no-show.enabled=false",
		"booking.request.initial-delay=PT2H",
		"booking.awaiting-payment.initial-delay=PT2H"
})
class SpanReleaseIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private static final int DAYS = 3;

	@Autowired
	CancelBooking cancelBooking;

	@Autowired
	RespondToRequest respondToRequest;

	@Autowired
	ExpireRequests expireRequests;

	@Autowired
	WithdrawRequest withdrawRequest;

	@Autowired
	ReleaseAbandonedBooking releaseAbandonedBooking;

	@Autowired
	RemodelClaims remodelClaims;

	@Autowired
	AvailabilityClaim availability;

	@Autowired
	JdbcClient jdbc;

	private long venueId;
	private OperatorId operator;
	/** Ten days out: inside the guest's free window, beyond the remodel's refund-notice floor. */
	private LocalDate firstDay;

	@BeforeEach
	void seedOwnedVenue() {
		venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'KSAMIL', 'INSTANT', 1500, 'EUR')
				RETURNING id
				""").param("name", "Span Club " + System.nanoTime()).query(Long.class).single();
		long operatorId = jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", "span-op-" + System.nanoTime()).query(Long.class).single();
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", operatorId).update();
		operator = new OperatorId(operatorId);
		firstDay = LocalDate.now(TIRANE).plusDays(10);
	}

	private long insertSet(int positionNo) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', :pos, 'STANDARD', 'ONLINE', 4500, 'EUR', :pos, 1)
				RETURNING id
				""").param("venue", venueId).param("pos", positionNo).query(Long.class).single();
	}

	private record Stay(long id, String code, long setId) {
	}

	/** A {@code DAYS}-day stay in {@code status}, every day of it held as an online claim. */
	private Stay insertStay(long setId, String status, Instant requestExpiresAt) {
		String code = "SPAN" + System.nanoTime() % 1_000_000_000L;
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		long id = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date,
				                     amount_minor, amount_currency, status, confirmed_at, request_expires_at)
				VALUES (:code, :venue, :set, :cust, :first, :last, 4500, 'EUR', :status, :confirmedAt, :expires)
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", setId).param("cust", customer)
				.param("first", firstDay).param("last", firstDay.plusDays(DAYS - 1)).param("status", status)
				.param("confirmedAt", "CONFIRMED".equals(status) ? java.sql.Timestamp.from(Instant.now()) : null,
						java.sql.Types.TIMESTAMP)
				.param("expires", requestExpiresAt == null ? null : java.sql.Timestamp.from(requestExpiresAt),
						java.sql.Types.TIMESTAMP)
				.query(Long.class).single();
		for (LocalDate day : days()) {
			assertEquals(ClaimOutcome.CLAIMED, availability.claim(new SetId(setId), day), "seeding holds " + day);
		}
		return new Stay(id, code, setId);
	}

	private List<LocalDate> days() {
		return firstDay.datesUntil(firstDay.plusDays(DAYS)).toList();
	}

	private void assertEveryDayHeld(long setId) {
		for (LocalDate day : days()) {
			assertEquals(ClaimOutcome.ALREADY_TAKEN, availability.claim(new SetId(setId), day),
					day + " is still held on set " + setId);
		}
	}

	private void assertEveryDayReleased(long setId) {
		for (LocalDate day : days()) {
			assertEquals(ClaimOutcome.CLAIMED, availability.claim(new SetId(setId), day),
					day + " re-claims on set " + setId + " — the leg released it (invariant #2)");
		}
	}

	private String statusOf(long bookingId) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id").param("id", bookingId)
				.query(String.class).single();
	}

	@Test
	void guestCancelReleasesEveryDay() {
		Stay stay = insertStay(insertSet(1), "CONFIRMED", null);

		assertInstanceOf(CancelOutcome.Cancelled.class, cancelBooking.cancel(stay.code()));

		assertEquals("CANCELLED", statusOf(stay.id()));
		assertEveryDayReleased(stay.setId());
	}

	@Test
	void declineReleasesEveryDay() {
		Stay stay = insertStay(insertSet(1), "PENDING_REQUEST", Instant.now().plusSeconds(3600));

		assertInstanceOf(DeclineOutcome.Declined.class,
				respondToRequest.decline(operator, new VenueId(venueId), new BookingId(stay.id())));

		assertEquals("DECLINED", statusOf(stay.id()));
		assertEveryDayReleased(stay.setId());
	}

	@Test
	void expiryReleasesEveryDay() {
		Stay stay = insertStay(insertSet(1), "PENDING_REQUEST", Instant.now().minusSeconds(3600));

		assertTrue(expireRequests.sweep() >= 1, "the overdue request is swept");

		assertEquals("EXPIRED", statusOf(stay.id()));
		assertEveryDayReleased(stay.setId());
	}

	@Test
	void withdrawReleasesEveryDay() {
		Stay stay = insertStay(insertSet(1), "PENDING_REQUEST", Instant.now().plusSeconds(3600));

		assertInstanceOf(WithdrawOutcome.Withdrawn.class, withdrawRequest.withdraw(stay.code()));

		assertEquals("WITHDRAWN", statusOf(stay.id()));
		assertEveryDayReleased(stay.setId());
	}

	/** The seam the abandoned-payment sweep and the payment-canceled webhook share. */
	@Test
	void abandonedReleaseReleasesEveryDay() {
		Stay stay = insertStay(insertSet(1), "AWAITING_PAYMENT", null);

		assertTrue(releaseAbandonedBooking.release(new BookingId(stay.id())));

		assertEquals("CANCELLED", statusOf(stay.id()));
		assertEveryDayReleased(stay.setId());
	}

	@Test
	void remodelRefundReleasesEveryDay() {
		Stay stay = insertStay(insertSet(1), "CONFIRMED", null);

		RemodelCommit outcome = commitDisturbing(stay.setId(), RemodelOutcome.Refund.REFUND,
				new RefundConfirmation(1, "Re-laying row A"));

		assertInstanceOf(RemodelCommit.Applied.class, outcome);
		assertEquals("CANCELLED", statusOf(stay.id()));
		assertEveryDayReleased(stay.setId());
	}

	@Test
	void remodelReleaseReleasesEveryDay() {
		Stay stay = insertStay(insertSet(1), "AWAITING_PAYMENT", null);

		RemodelCommit outcome = commitDisturbing(stay.setId(), RemodelOutcome.Release.RELEASE, RefundConfirmation.NONE);

		assertInstanceOf(RemodelCommit.Applied.class, outcome);
		assertEquals("CANCELLED", statusOf(stay.id()));
		assertEveryDayReleased(stay.setId());
	}

	@Test
	void remodelDeclineReleasesEveryDay() {
		Stay stay = insertStay(insertSet(1), "PENDING_REQUEST", Instant.now().plusSeconds(3600));

		RemodelCommit outcome = commitDisturbing(stay.setId(), RemodelOutcome.Decline.DECLINE, RefundConfirmation.NONE);

		assertInstanceOf(RemodelCommit.Applied.class, outcome);
		assertEquals("DECLINED", statusOf(stay.id()));
		assertEveryDayReleased(stay.setId());
	}

	@Test
	void remodelMoveClaimsAndReleasesEveryDay() {
		long from = insertSet(1);
		long to = insertSet(2);
		Stay stay = insertStay(from, "CONFIRMED", null);

		List<RemodelClaim> claims = remodelClaims.classify(operator, new VenueId(venueId), List.of(new SetId(from)));
		assertEquals(1, claims.size());
		RemodelOutcome.Move move = assertInstanceOf(RemodelOutcome.Move.class, claims.getFirst().outcome());
		assertEquals(new SetId(to), move.to().setId());
		RemodelCommit outcome = remodelClaims.commit(operator, new VenueId(venueId), List.of(new SetId(from)),
				PreviewToken.of(claims), RefundConfirmation.NONE);

		assertInstanceOf(RemodelCommit.Applied.class, outcome);
		assertEquals(to, jdbc.sql("SELECT set_id FROM booking WHERE id = :id").param("id", stay.id())
				.query(Long.class).single(), "the booking sits on the new set");
		assertEveryDayHeld(to);
		assertEveryDayReleased(from);
	}

	/** Classify the one disturbed set (no candidate exists: it is the venue's only set), check the kind, commit. */
	private RemodelCommit commitDisturbing(long setId, RemodelOutcome expected, RefundConfirmation confirmation) {
		List<RemodelClaim> claims = remodelClaims.classify(operator, new VenueId(venueId), List.of(new SetId(setId)));
		assertEquals(1, claims.size());
		assertEquals(expected, claims.getFirst().outcome());
		return remodelClaims.commit(operator, new VenueId(venueId), List.of(new SetId(setId)),
				PreviewToken.of(claims), confirmation);
	}
}
