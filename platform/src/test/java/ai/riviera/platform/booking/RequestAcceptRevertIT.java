package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.availability.vocabulary.ClaimOutcome;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.request.AcceptOutcome;
import ai.riviera.platform.booking.application.request.RespondToRequest;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.payment.api.CheckoutPort;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;

/**
 * A payment set-up that fails after the accept claimed the day reverts the request to pending and gives
 * the claim back (ADR-0025): the operator may retry, and meanwhile the day is free again.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
		"booking.no-show.enabled=false",
		"booking.request.initial-delay=PT2H",
		"booking.awaiting-payment.initial-delay=PT2H"
})
class RequestAcceptRevertIT {

	@Autowired
	RespondToRequest respondToRequest;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	Bookings bookings;

	@Autowired
	AvailabilityClaim availability;

	@Autowired
	PlatformTransactionManager txManager;

	/** A spy, not a mock: the payment service also serves the credentials lookup the view needs. */
	@MockitoSpyBean
	CheckoutPort checkout;

	private long venueId;
	private OperatorId operator;
	private long setId;
	private final LocalDate day = LocalDate.now(ZoneId.of("Europe/Tirane")).plusDays(10);

	@BeforeEach
	void seedRequestVenue() {
		venueId = jdbc.sql("""
				INSERT INTO venue (name, beach, booking_mode, commission_bps, payout_currency)
				VALUES (:name, 'KSAMIL', 'REQUEST', 1500, 'EUR')
				RETURNING id
				""").param("name", "Revert Club " + System.nanoTime()).query(Long.class).single();
		long operatorId = jdbc.sql("INSERT INTO operator (username, status) VALUES (:u, 'ACTIVE') RETURNING id")
				.param("u", "revert-op-" + System.nanoTime()).query(Long.class).single();
		jdbc.sql("INSERT INTO operator_venue (venue_id, operator_id) VALUES (:v, :o)")
				.param("v", venueId).param("o", operatorId).update();
		operator = new OperatorId(operatorId);
		setId = insertSet(1);
	}

	@Test
	void aFailedPaymentSetUpRevertsAndReleasesTheClaim() {
		doReturn(new PaymentOutcome.Failed("stripe_error")).when(checkout).pay(any(), any());
		long request = insertRequest();

		AcceptOutcome outcome = respondToRequest.accept(operator, new VenueId(venueId), new BookingId(request));

		assertSame(AcceptOutcome.Rejected.PAYMENT_INIT_FAILED, outcome);
		assertEquals("PENDING_REQUEST", jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", request).query(String.class).single());
		assertEquals(0L, heldOn(setId), "the accept's claim is given back");
	}

	@Test
	void aRevertAfterARemodelMoveReleasesTheMovedToSetOnly() {
		long candidate = insertSet(2);
		long request = insertRequest();
		doAnswer(payCall -> {
			// A remodel commit lands inside the Stripe call (#1302): the booking moves off its set, and a guest takes the day.
			new TransactionTemplate(txManager).executeWithoutResult(status -> {
				assertSame(ClaimOutcome.CLAIMED, availability.claim(new SetId(candidate), day));
				availability.release(new SetId(setId), day);
				assertTrue(bookings.moveToSet(request, new SetId(setId), new SetId(candidate), Instant.now()));
			});
			assertSame(ClaimOutcome.CLAIMED, availability.claim(new SetId(setId), day));
			return new PaymentOutcome.Failed("stripe_error");
		}).when(checkout).pay(any(), any());

		AcceptOutcome outcome = respondToRequest.accept(operator, new VenueId(venueId), new BookingId(request));

		assertSame(AcceptOutcome.Rejected.PAYMENT_INIT_FAILED, outcome);
		assertEquals("PENDING_REQUEST", jdbc.sql("SELECT status FROM booking WHERE id = :id")
				.param("id", request).query(String.class).single());
		assertEquals(candidate, jdbc.sql("SELECT set_id FROM booking WHERE id = :id")
				.param("id", request).query(Long.class).single(), "the request stands where the remodel put it");
		assertEquals(1L, heldOn(setId), "the other guest's claim on the accepted set stands (#2)");
		assertEquals(0L, heldOn(candidate), "the claim the request held is the one given back");
	}

	private long insertSet(int position) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', :pos, 'STANDARD', 'ONLINE', 4500, 'EUR', :pos, 1)
				RETURNING id
				""").param("venue", venueId).param("pos", position).query(Long.class).single();
	}

	private long insertRequest() {
		String code = "RVRT" + System.nanoTime() % 1_000_000_000L;
		long customer = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Guest', '+355600') RETURNING id")
				.param("e", code + "@example.com").query(Long.class).single();
		return jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date, last_date,
				                     amount_minor, amount_currency, status, request_expires_at)
				VALUES (:code, :venue, :set, :cust, :day, :day, 4500, 'EUR', 'PENDING_REQUEST', :expires)
				RETURNING id
				""")
				.param("code", code).param("venue", venueId).param("set", setId).param("cust", customer)
				.param("day", day).param("expires", java.sql.Timestamp.from(Instant.now().plusSeconds(3600)))
				.query(Long.class).single();
	}

	private long heldOn(long set) {
		return jdbc.sql("SELECT COUNT(*) FROM set_availability WHERE set_id = :set AND booking_date = :day")
				.param("set", set).param("day", day).query(Long.class).single();
	}
}
