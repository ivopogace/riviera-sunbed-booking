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
 * A pending request is not a hold (ADR-0025): none of its termination legs touches {@code set_availability}.
 * Each case seeds a pending request on a set whose day another booking holds, runs the leg through its
 * driving port, and proves the foreign row survives — the row a release would have deleted, since the
 * table cannot tell whose it is (invariant #2).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
		"booking.no-show.enabled=false",
		"booking.request.initial-delay=PT2H",
		"booking.awaiting-payment.initial-delay=PT2H"
})
class RequestHoldsNothingIT {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	RespondToRequest respondToRequest;

	@Autowired
	ExpireRequests expireRequests;

	@Autowired
	WithdrawRequest withdrawRequest;

	@Autowired
	RemodelClaims remodelClaims;

	@Autowired
	AvailabilityClaim availability;

	@Autowired
	JdbcClient jdbc;

	private long venueId;
	private OperatorId operator;
	private LocalDate day;

	@BeforeEach
	void seedRequestVenue() {
		venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'KSAMIL', 'REQUEST', 1500, 'EUR')
				RETURNING id
				""").param("name", "No Hold Club " + System.nanoTime()).query(Long.class).single();
		long operatorId = jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", "nohold-op-" + System.nanoTime()).query(Long.class).single();
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", operatorId).update();
		operator = new OperatorId(operatorId);
		day = LocalDate.now(TIRANE).plusDays(10);
	}

	private long insertSet(int positionNo) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', :pos, 'STANDARD', 'ONLINE', 4500, 'EUR', :pos, 1)
				RETURNING id
				""").param("venue", venueId).param("pos", positionNo).query(Long.class).single();
	}

	private record Request(long id, String code, long setId) {
	}

	/** A one-day {@code PENDING_REQUEST} on {@code day}, holding nothing. */
	private Request insertPending(long setId, Instant requestExpiresAt) {
		String code = "NOHD" + System.nanoTime() % 1_000_000_000L;
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		long id = jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date,
				                     amount_minor, amount_currency, status, request_expires_at)
				VALUES (:code, :venue, :set, :cust, :day, :day, 4500, 'EUR', 'PENDING_REQUEST', :expires)
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", setId).param("cust", customer)
				.param("day", day).param("expires", java.sql.Timestamp.from(requestExpiresAt))
				.query(Long.class).single();
		return new Request(id, code, setId);
	}

	/** Another party's claim on the same set and day — the row a release would wrongly delete. */
	private void holdByAnotherParty(long setId) {
		assertEquals(ClaimOutcome.CLAIMED, availability.claim(new SetId(setId), day), "seeding the foreign hold");
	}

	private void assertForeignHoldSurvives(long setId) {
		assertEquals(ClaimOutcome.ALREADY_TAKEN, availability.claim(new SetId(setId), day),
				"the other party's row on " + day + " survives the leg (ADR-0025)");
	}

	private String statusOf(long bookingId) {
		return jdbc.sql("SELECT status FROM booking WHERE id = :id").param("id", bookingId)
				.query(String.class).single();
	}

	private String declineReasonOf(long bookingId) {
		return jdbc.sql("SELECT decline_reason FROM booking WHERE id = :id").param("id", bookingId)
				.query(String.class).single();
	}

	@Test
	void declineReleasesNothing() {
		long set = insertSet(1);
		Request request = insertPending(set, Instant.now().plusSeconds(3600));
		holdByAnotherParty(set);

		assertInstanceOf(DeclineOutcome.Declined.class,
				respondToRequest.decline(operator, new VenueId(venueId), new BookingId(request.id())));

		assertEquals("DECLINED", statusOf(request.id()));
		assertEquals("VENUE", declineReasonOf(request.id()));
		assertForeignHoldSurvives(set);
	}

	@Test
	void expiryReleasesNothing() {
		long set = insertSet(1);
		Request request = insertPending(set, Instant.now().minusSeconds(3600));
		holdByAnotherParty(set);

		assertTrue(expireRequests.sweep() >= 1, "the overdue request is swept");

		assertEquals("EXPIRED", statusOf(request.id()));
		assertForeignHoldSurvives(set);
	}

	@Test
	void withdrawReleasesNothing() {
		long set = insertSet(1);
		Request request = insertPending(set, Instant.now().plusSeconds(3600));
		holdByAnotherParty(set);

		assertInstanceOf(WithdrawOutcome.Withdrawn.class, withdrawRequest.withdraw(request.code()));

		assertEquals("WITHDRAWN", statusOf(request.id()));
		assertForeignHoldSurvives(set);
	}

	@Test
	void remodelDeclinesAPendingRequestAndReleasesNothing() {
		long set = insertSet(1);
		insertSet(2);
		Request request = insertPending(set, Instant.now().plusSeconds(3600));
		holdByAnotherParty(set);

		List<RemodelClaim> claims = remodelClaims.classify(operator, new VenueId(venueId), List.of(new SetId(set)));
		assertEquals(1, claims.size());
		assertEquals(RemodelOutcome.Decline.DECLINE, claims.getFirst().outcome(),
				"a pending request is declined, never moved, though a free candidate set exists");
		RemodelCommit outcome = remodelClaims.commit(operator, new VenueId(venueId), List.of(new SetId(set)),
				PreviewToken.of(claims), RefundConfirmation.NONE);

		assertInstanceOf(RemodelCommit.Applied.class, outcome);
		assertEquals("DECLINED", statusOf(request.id()));
		assertEquals("SET_UNAVAILABLE", declineReasonOf(request.id()));
		assertForeignHoldSurvives(set);
	}
}
