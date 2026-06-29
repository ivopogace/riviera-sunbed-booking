package ai.riviera.platform.payment.infrastructure.out;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.application.out.NewPayment;
import ai.riviera.platform.payment.application.out.Payments;
import ai.riviera.platform.payment.domain.PaymentStatus;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Verifies the {@code payment} persistence adapter against real Postgres (Testcontainers): a
 * recorded PaymentIntent starts {@code REQUIRES_PAYMENT}, is found by its Stripe id for the
 * webhook correlation, and transitions on {@code markStatus}. JDBC-only (invariant #1); skipped
 * where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JdbcPaymentsIT {

	@Autowired
	Payments payments;

	@Autowired
	JdbcClient jdbc;

	private String statusOf(String intentId) {
		return jdbc.sql("SELECT status FROM payment WHERE payment_intent_id = :i")
				.param("i", intentId).query(String.class).single();
	}

	@Test
	void recordStartsRequiresPaymentAndIsFoundByIntent() {
		payments.record(new NewPayment(new BookingRef(9001L), "pi_record_a", 4500L, "EUR"));

		assertEquals("REQUIRES_PAYMENT", statusOf("pi_record_a"),
				"a freshly recorded PaymentIntent awaits payment");
		Optional<BookingRef> ref = payments.findBookingRefByIntent("pi_record_a");
		assertTrue(ref.isPresent(), "the webhook must correlate the PaymentIntent back to its booking");
		assertEquals(9001L, ref.get().value());
	}

	@Test
	void markStatusTransitionsThePayment() {
		payments.record(new NewPayment(new BookingRef(9002L), "pi_mark_b", 4500L, "EUR"));

		payments.markStatus("pi_mark_b", PaymentStatus.SUCCEEDED);

		assertEquals("SUCCEEDED", statusOf("pi_mark_b"), "markStatus moves the payment to the new state");
	}

	@Test
	void findByUnknownIntentIsEmpty() {
		assertTrue(payments.findBookingRefByIntent("pi_does_not_exist").isEmpty(),
				"an unknown PaymentIntent id yields no booking ref (webhook then ignores it)");
	}
}
