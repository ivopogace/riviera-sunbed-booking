package ai.riviera.platform.payment.adapter.out;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.application.NewPayment;
import ai.riviera.platform.payment.application.Payments;
import ai.riviera.platform.payment.domain.PaymentStatus;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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
		payments.register(new NewPayment(new BookingRef(9001L), "pi_record_a", 4500L, "EUR", "cs_test_secret"));

		assertEquals("REQUIRES_PAYMENT", statusOf("pi_record_a"),
				"a freshly recorded PaymentIntent awaits payment");
		Optional<BookingRef> ref = payments.findBookingRefByIntent("pi_record_a");
		assertTrue(ref.isPresent(), "the webhook must correlate the PaymentIntent back to its booking");
		assertEquals(9001L, ref.get().value());
	}

	@Test
	void markStatusTransitionsThePayment() {
		payments.register(new NewPayment(new BookingRef(9002L), "pi_mark_b", 4500L, "EUR", "cs_test_secret"));

		payments.markStatus("pi_mark_b", PaymentStatus.SUCCEEDED);

		assertEquals("SUCCEEDED", statusOf("pi_mark_b"), "markStatus moves the payment to the new state");
	}

	@Test
	void lateFailureCannotOverwriteASucceededCollection() {
		payments.register(new NewPayment(new BookingRef(9401L), "pi_late_fail", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_late_fail", PaymentStatus.SUCCEEDED);

		boolean applied = payments.markStatus("pi_late_fail", PaymentStatus.FAILED);

		assertFalse(applied, "a collected payment is terminal — the transition reports no move");
		assertEquals("SUCCEEDED", statusOf("pi_late_fail"),
				"a late payment_failed never overwrites money Stripe collected (invariant #8)");
	}

	@Test
	void lateFailureCannotOverwriteARefundedCollection() {
		payments.register(new NewPayment(new BookingRef(9402L), "pi_late_refunded", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_late_refunded", PaymentStatus.SUCCEEDED);
		payments.markRefunded(new BookingRef(9402L), 4500L, "re_late");

		assertFalse(payments.markStatus("pi_late_refunded", PaymentStatus.FAILED),
				"a refunded payment is terminal too");

		var state = payments.findRefundState(new BookingRef(9402L)).orElseThrow();
		assertEquals(PaymentStatus.REFUNDED, state.status(),
				"a late payment_failed never contradicts a recorded refund");
		assertEquals(4500L, state.refundedMinor(), "the refunded amount survives the late event");
	}

	@Test
	void anOpenCollectionStillTransitions() {
		payments.register(new NewPayment(new BookingRef(9403L), "pi_retry", 4500L, "EUR", "cs_test_secret"));

		assertTrue(payments.markStatus("pi_retry", PaymentStatus.FAILED),
				"a freshly recorded intent is open to a webhook outcome");
		assertTrue(payments.markStatus("pi_retry", PaymentStatus.SUCCEEDED),
				"a declined intent may be retried — FAILED is not terminal in Stripe");
		assertEquals("SUCCEEDED", statusOf("pi_retry"), "the retry's success is recorded");
	}

	@Test
	void markStatusOnAnUnknownIntentReportsNoTransition() {
		assertFalse(payments.markStatus("pi_never_recorded", PaymentStatus.SUCCEEDED),
				"an event for an intent this app never recorded moves nothing");
	}

	@Test
	void findByUnknownIntentIsEmpty() {
		assertTrue(payments.findBookingRefByIntent("pi_does_not_exist").isEmpty(),
				"an unknown PaymentIntent id yields no booking ref (webhook then ignores it)");
	}

	@Test
	void findIntentByBookingRefCorrelates() {
		payments.register(new NewPayment(new BookingRef(9101L), "pi_by_booking", 4500L, "EUR", "cs_test_secret"));

		Optional<String> intent = payments.findIntentByBookingRef(new BookingRef(9101L));

		assertTrue(intent.isPresent(), "the refund path must find the PaymentIntent for a booking");
		assertEquals("pi_by_booking", intent.get());
	}

	@Test
	void markRefundedFullMovesToRefunded() {
		payments.register(new NewPayment(new BookingRef(9201L), "pi_refund_full", 4500L, "EUR", "cs_test_secret"));

		payments.markRefunded(new BookingRef(9201L), 4500L, "re_full");

		assertEquals("REFUNDED", statusOf("pi_refund_full"), "a full refund moves the payment to REFUNDED");
		assertEquals(4500L, jdbc.sql("SELECT refunded_minor FROM payment WHERE payment_intent_id = :i")
				.param("i", "pi_refund_full").query(Long.class).single());
	}

	@Test
	void readsRefundStateBackAfterMarkRefunded() {
		payments.register(new NewPayment(new BookingRef(9301L), "pi_refund_state", 4500L, "EUR", "cs_test_secret"));
		payments.markStatus("pi_refund_state", PaymentStatus.SUCCEEDED);

		var beforeRefund = payments.findRefundState(new BookingRef(9301L));
		assertTrue(beforeRefund.isPresent(), "a collected payment has readable refund state");
		assertEquals(PaymentStatus.SUCCEEDED, beforeRefund.get().status());
		assertEquals(0L, beforeRefund.get().refundedMinor(), "nothing refunded before the gateway accepts");

		payments.markRefunded(new BookingRef(9301L), 4500L, "re_state");

		var afterRefund = payments.findRefundState(new BookingRef(9301L));
		assertEquals(PaymentStatus.REFUNDED, afterRefund.orElseThrow().status());
		assertEquals(4500L, afterRefund.orElseThrow().refundedMinor(),
				"markRefunded's write is readable back through the same port");
	}

	@Test
	void findRefundStateIsEmptyWithoutAPaymentRow() {
		assertTrue(payments.findRefundState(new BookingRef(9302L)).isEmpty(),
				"no payment row (stub profile) reads as empty, never as a failed refund");
	}

	@Test
	void markRefundedPartialMovesToPartiallyRefunded() {
		payments.register(new NewPayment(new BookingRef(9202L), "pi_refund_part", 4500L, "EUR", "cs_test_secret"));

		payments.markRefunded(new BookingRef(9202L), 2250L, "re_part");

		assertEquals("PARTIALLY_REFUNDED", statusOf("pi_refund_part"),
				"a partial refund moves the payment to PARTIALLY_REFUNDED");
	}
}
