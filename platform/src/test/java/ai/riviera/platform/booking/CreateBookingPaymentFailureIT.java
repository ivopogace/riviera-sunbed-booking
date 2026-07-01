package ai.riviera.platform.booking;

import java.time.LocalDate;

import com.stripe.StripeClient;
import com.stripe.exception.ApiConnectionException;
import com.stripe.service.PaymentIntentService;
import com.stripe.service.V1Services;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.reserve.CreateBooking;
import ai.riviera.platform.booking.application.reserve.CreateBookingCommand;
import ai.riviera.platform.customer.api.GuestContact;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The two-phase create failure path (issue #52, AC-3): under the {@code stripe} profile, when the
 * Stripe PaymentIntent creation fails (Stripe unreachable), the booking + claim were already
 * committed {@code AWAITING_PAYMENT}, so {@code create} must <strong>compensate</strong> — cancel
 * the booking and free the {@code (set, date)} — rather than leave an orphaned booking holding the
 * set (invariant #2). This is the second half of the R-3 hardening: the network call is out of the
 * locked transaction (so it can't pin the lock), and its failure is cleaned up.
 *
 * <p>Drives the inner-hexagon {@link CreateBooking} port directly (Cockburn: ACs at the application
 * boundary, not the HTTP edge). The {@link StripeClient} is mocked to throw on PI creation, so no
 * live Stripe call is made. Testcontainers Postgres; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@ActiveProfiles("stripe")
@TestPropertySource(properties = {"stripe.api-key=sk_test_dummy", "stripe.webhook-secret=whsec_test"})
class CreateBookingPaymentFailureIT {

	@Autowired
	CreateBooking createBooking;

	@Autowired
	JdbcClient jdbc;

	@MockitoBean
	StripeClient stripeClient;

	@BeforeEach
	void stubStripeToFailOnCreate() throws Exception {
		V1Services v1 = mock(V1Services.class);
		PaymentIntentService intents = mock(PaymentIntentService.class);
		when(stripeClient.v1()).thenReturn(v1);
		when(v1.paymentIntents()).thenReturn(intents);
		// The exact failure issue #52 targets: a degraded/unreachable Stripe at PI creation.
		when(intents.create(any(), any())).thenThrow(new ApiConnectionException("stripe unreachable"));
	}

	private SetId anyOnlineSet() {
		return new SetId(jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query(Long.class).single());
	}

	private String bookingStatus(SetId set, LocalDate date) {
		// .single() asserts EXACTLY one booking row for this (set, date) — also proving the failed
		// attempt created no duplicate; the date is unique to this test so no other row can match.
		return jdbc.sql("SELECT status FROM booking WHERE set_id = :id AND booking_date = :date")
				.param("id", set.value()).param("date", date).query(String.class).single();
	}

	private long availabilityRows(SetId set, LocalDate date) {
		return jdbc.sql(
				"SELECT count(*) FROM set_availability WHERE set_id = :id AND booking_date = :date")
				.param("id", set.value()).param("date", date).query(Long.class).single();
	}

	@Test
	void releasesClaimWhenPaymentIntentCreationFails() {
		SetId set = anyOnlineSet();
		LocalDate date = LocalDate.now().plusYears(1).plusDays(11);

		assertThrows(RuntimeException.class, () -> createBooking.create(new CreateBookingCommand(
				set, date, new GuestContact("f@e.com", "Fail Guest", "+355699"))),
				"a failed PaymentIntent creation surfaces as a thrown failure");

		assertEquals("CANCELLED", bookingStatus(set, date),
				"the committed AWAITING_PAYMENT booking must be compensated to CANCELLED, not orphaned");
		assertEquals(0L, availabilityRows(set, date),
				"the (set, date) claim is released (re-claimable) after the compensating release");
	}
}
