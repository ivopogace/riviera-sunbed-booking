package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import com.stripe.StripeClient;
import com.stripe.exception.ApiConnectionException;
import com.stripe.model.PaymentIntent;
import com.stripe.net.RequestOptions;
import com.stripe.param.PaymentIntentCreateParams;
import com.stripe.service.PaymentIntentService;
import com.stripe.service.V1Services;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.StayFixtures.Venue;
import ai.riviera.platform.booking.application.reserve.CreateStay;
import ai.riviera.platform.booking.application.reserve.StayOutcome;
import ai.riviera.platform.venue.vocabulary.SetId;

import static ai.riviera.platform.booking.StayFixtures.PRICE;
import static ai.riviera.platform.booking.StayFixtures.firstDay;
import static ai.riviera.platform.booking.StayFixtures.heldDays;
import static ai.riviera.platform.booking.StayFixtures.plan;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The collect phase of a stay under the {@code stripe} profile with the Stripe client mocked: one
 * PaymentIntent for the group's total with one {@code payment_booking} share per stretch (design D8),
 * every stretch left {@code AWAITING_PAYMENT} under the one client secret (invariant #8); a failed
 * creation releases every day of every stretch (invariant #2). Real Postgres via Testcontainers.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
@ActiveProfiles("stripe")
@TestPropertySource(properties = {"stripe.api-key=sk_test_dummy", "stripe.webhook-secret=whsec_test"})
class CreateStayCheckoutIT {

	@Autowired
	CreateStay createStay;

	@Autowired
	JdbcClient jdbc;

	@MockitoBean
	StripeClient stripeClient;

	private final List<Long> venues = new ArrayList<>();

	@AfterEach
	void removeFixtures() {
		venues.forEach(venue -> StayFixtures.cleanup(jdbc, venue));
	}

	private PaymentIntentService intents() {
		V1Services v1 = mock(V1Services.class);
		PaymentIntentService intents = mock(PaymentIntentService.class);
		when(stripeClient.v1()).thenReturn(v1);
		when(v1.paymentIntents()).thenReturn(intents);
		return intents;
	}

	@Test
	void collectsOnceWithOneSharePerStretchAndWaitsForTheWebhook() throws Exception {
		PaymentIntentService intents = intents();
		String intentId = "pi_stay_" + System.nanoTime();
		PaymentIntent created = mock(PaymentIntent.class);
		when(created.getId()).thenReturn(intentId);
		when(created.getClientSecret()).thenReturn(intentId + "_secret");
		when(intents.create(any(PaymentIntentCreateParams.class), any(RequestOptions.class))).thenReturn(created);
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		SetId a = venue.online().get(0);
		SetId b = venue.online().get(1);
		LocalDate first = firstDay();

		StayOutcome outcome = createStay.create(plan(a, 3, b, 4, first));

		StayOutcome.AwaitingPayment awaiting = assertInstanceOf(StayOutcome.AwaitingPayment.class, outcome);
		assertEquals(intentId + "_secret", awaiting.clientSecret());
		ArgumentCaptor<PaymentIntentCreateParams> params = ArgumentCaptor.forClass(PaymentIntentCreateParams.class);
		verify(intents).create(params.capture(), any(RequestOptions.class));
		assertEquals(7 * PRICE, params.getValue().getAmount(), "one intent for the stay's total");
		assertEquals(List.of(3 * PRICE, 4 * PRICE), jdbc.sql("""
				SELECT pb.amount_minor FROM payment_booking pb JOIN booking b ON b.id = pb.booking_ref
				WHERE b.venue_id = :v ORDER BY b.booking_date
				""").param("v", venue.id()).query(Long.class).list(), "one share per stretch under the intent");
		assertEquals(1L, jdbc.sql("SELECT count(DISTINCT pb.payment_id) FROM payment_booking pb JOIN booking b "
						+ "ON b.id = pb.booking_ref WHERE b.venue_id = :v").param("v", venue.id())
				.query(Long.class).single(), "the shares sit under one PaymentIntent");
		assertEquals(List.of("AWAITING_PAYMENT", "AWAITING_PAYMENT"),
				jdbc.sql("SELECT status FROM booking WHERE venue_id = :v ORDER BY booking_date").param("v", venue.id())
						.query(String.class).list());
	}

	@Test
	void aFailedCollectionReleasesEveryStretch() throws Exception {
		PaymentIntentService intents = intents();
		when(intents.create(any(PaymentIntentCreateParams.class), any(RequestOptions.class)))
				.thenThrow(new ApiConnectionException("stripe unreachable"));
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		SetId a = venue.online().get(0);
		SetId b = venue.online().get(1);
		LocalDate first = firstDay();

		assertThrows(RuntimeException.class, () -> createStay.create(plan(a, 3, b, 4, first)));

		assertEquals(0L, heldDays(jdbc, a, first, first.plusDays(6)));
		assertEquals(0L, heldDays(jdbc, b, first, first.plusDays(6)), "every day of every stretch is released");
		assertEquals(List.of("CANCELLED", "CANCELLED"),
				jdbc.sql("SELECT status FROM booking WHERE venue_id = :v ORDER BY booking_date").param("v", venue.id())
						.query(String.class).list());
	}
}
