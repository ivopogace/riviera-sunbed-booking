package ai.riviera.platform.booking;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import com.stripe.StripeClient;
import com.stripe.exception.ApiConnectionException;
import com.stripe.model.PaymentIntent;
import com.stripe.net.RequestOptions;
import com.stripe.param.PaymentIntentCreateParams;
import com.stripe.service.PaymentIntentService;
import com.stripe.service.V1Services;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.reserve.ClaimRef;
import ai.riviera.platform.booking.application.request.AcceptOutcome;
import ai.riviera.platform.booking.application.request.RespondToRequest;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.events.BookingPaymentDue;
import ai.riviera.platform.booking.events.StayPaymentDue;
import ai.riviera.platform.booking.events.StayRequestDeclined;
import ai.riviera.platform.booking.vocabulary.DeclineReason;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static ai.riviera.platform.booking.StayFixtures.PRICE;
import static ai.riviera.platform.booking.StayFixtures.heldDays;
import static ai.riviera.platform.booking.StayFixtures.statusOf;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The collect leg of a stay request's accept (#1267) under the {@code stripe} profile with the Stripe
 * client mocked: one PaymentIntent for the stay's total with one share per stretch, every stretch left
 * {@code AWAITING_PAYMENT} (invariant #8) and one {@link StayPaymentDue}; a failed set-up reverts every
 * stretch to pending and gives every day back (invariant #2).
 */
@RecordApplicationEvents
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {
		"booking.no-show.enabled=false",
		"booking.request.initial-delay=PT2H",
		"booking.awaiting-payment.initial-delay=PT2H"
})
@ActiveProfiles("stripe")
@TestPropertySource(properties = {"stripe.api-key=sk_test_dummy", "stripe.webhook-secret=whsec_test"})
class StayRequestAcceptPayIT {

	@Autowired
	RespondToRequest respondToRequest;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	ApplicationEvents events;

	@Autowired
	Bookings bookings;

	@Autowired
	AvailabilityClaim availability;

	@Autowired
	PlatformTransactionManager txManager;

	@MockitoBean
	StripeClient stripeClient;

	private StayFixtures.Venue venue;
	private OperatorId owner;
	private LocalDate first;
	private StayFixtures.SeededStay stay;

	@BeforeEach
	void seed() {
		venue = StayFixtures.venue(jdbc, "REQUEST", null, true);
		owner = StayFixtures.ownerOf(jdbc, venue);
		first = StayFixtures.firstDay();
		stay = StayFixtures.insertPendingStay(jdbc, venue, "SRPA" + System.nanoTime() % 100_000_000L, first,
				venue.online().get(0), 2, venue.online().get(1), 3, Instant.now().plusSeconds(3600));
	}

	@AfterEach
	void clean() {
		StayFixtures.cleanup(jdbc, venue.id());
	}

	private PaymentIntentService intents() {
		V1Services v1 = mock(V1Services.class);
		PaymentIntentService intents = mock(PaymentIntentService.class);
		when(stripeClient.v1()).thenReturn(v1);
		when(v1.paymentIntents()).thenReturn(intents);
		return intents;
	}

	@Test
	void acceptCollectsOnceAndAnnouncesThePaymentDue() throws Exception {
		PaymentIntentService intents = intents();
		String intentId = "pi_stay_req_" + System.nanoTime();
		PaymentIntent created = mock(PaymentIntent.class);
		when(created.getId()).thenReturn(intentId);
		when(created.getClientSecret()).thenReturn(intentId + "_secret");
		when(intents.create(any(PaymentIntentCreateParams.class), any(RequestOptions.class))).thenReturn(created);

		AcceptOutcome outcome = respondToRequest.acceptStay(owner, new VenueId(venue.id()), new StayId(stay.id()));

		assertEquals(new AcceptOutcome.Accepted(BookingStatus.AWAITING_PAYMENT), outcome);
		ArgumentCaptor<PaymentIntentCreateParams> params = ArgumentCaptor.forClass(PaymentIntentCreateParams.class);
		verify(intents).create(params.capture(), any(RequestOptions.class));
		assertEquals(5 * PRICE, params.getValue().getAmount(), "one intent for the stay's total");
		assertEquals(List.of(2 * PRICE, 3 * PRICE), jdbc.sql("""
				SELECT pb.amount_minor FROM payment_booking pb JOIN booking b ON b.id = pb.booking_ref
				WHERE b.stay_id = :s ORDER BY b.booking_date
				""").param("s", stay.id()).query(Long.class).list(), "one share per stretch");
		for (long id : stay.stretches()) {
			assertEquals("AWAITING_PAYMENT", statusOf(jdbc, id));
		}
		assertEquals(1L, jdbc.sql("SELECT count(DISTINCT accepted_at) FROM booking WHERE stay_id = :s")
				.param("s", stay.id()).query(Long.class).single(), "one accept instant, one pay window");
		List<StayPaymentDue> due = events.stream(StayPaymentDue.class).toList();
		assertEquals(1, due.size());
		assertEquals(new StayId(stay.id()), due.getFirst().stayId());
		assertEquals(5 * PRICE, due.getFirst().amountMinor());
		assertNotNull(due.getFirst().payBy());
		assertEquals(0L, events.stream(BookingPaymentDue.class).count(), "no per-stretch payment-due fact");
	}

	@Test
	void aFailedCollectionRevertsEveryStretch() throws Exception {
		when(intents().create(any(PaymentIntentCreateParams.class), any(RequestOptions.class)))
				.thenThrow(new ApiConnectionException("stripe unreachable"));

		AcceptOutcome outcome = respondToRequest.acceptStay(owner, new VenueId(venue.id()), new StayId(stay.id()));

		assertSame(AcceptOutcome.Rejected.PAYMENT_INIT_FAILED, outcome);
		for (long id : stay.stretches()) {
			assertEquals("PENDING_REQUEST", statusOf(jdbc, id), "back to pending, the operator may retry");
		}
		assertEquals(0L, heldDays(jdbc, venue.online().get(0), first, first.plusDays(4)));
		assertEquals(0L, heldDays(jdbc, venue.online().get(1), first, first.plusDays(4)), "every day given back");
		assertEquals(0L, events.stream(StayPaymentDue.class).count());
	}

	@Test
	void aFailedCollectionAfterARemodelReleaseDeclinesTheStay() throws Exception {
		long released = stay.stretches().get(1);
		AtomicBoolean remodelled = new AtomicBoolean();
		when(intents().create(any(PaymentIntentCreateParams.class), any(RequestOptions.class))).thenAnswer(createCall -> {
			// A remodel releases the second stretch inside the Stripe call (#1302), as RemodelClaimsService.applyRelease does.
			if (remodelled.compareAndSet(false, true)) {
				new TransactionTemplate(txManager).executeWithoutResult(status -> {
					ClaimRef held = bookings.cancelAwaitingPayment(released).orElseThrow();
					held.bookingDate().datesUntil(held.lastDate().plusDays(1))
							.forEach(day -> availability.release(held.setId(), day));
				});
			}
			throw new ApiConnectionException("stripe unreachable");
		});

		AcceptOutcome outcome = respondToRequest.acceptStay(owner, new VenueId(venue.id()), new StayId(stay.id()));

		assertSame(AcceptOutcome.Rejected.PAYMENT_INIT_FAILED, outcome);
		assertEquals("DECLINED", statusOf(jdbc, stay.stretches().get(0)),
				"a stay the revert cannot restore whole is declined, as the remodel declines a pending stay");
		assertEquals("SET_UNAVAILABLE", jdbc.sql("SELECT decline_reason FROM booking WHERE id = :id")
				.param("id", stay.stretches().get(0)).query(String.class).single());
		assertEquals("CANCELLED", statusOf(jdbc, released), "the remodel's release stands");
		assertEquals(0L, heldDays(jdbc, venue.online().get(0), first, first.plusDays(4)));
		assertEquals(0L, heldDays(jdbc, venue.online().get(1), first, first.plusDays(4)), "no day of the stay is held");
		assertEquals(List.of(new StayRequestDeclined(new StayId(stay.id()), DeclineReason.SET_UNAVAILABLE)),
				events.stream(StayRequestDeclined.class).toList());
	}
}
