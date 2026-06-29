package ai.riviera.platform.payment;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Verifies the U4 migration (issue #8) creates {@code payment} and {@code stripe_webhook_event}
 * with the constraints that enforce the payment invariants (invariant #12): one PaymentIntent
 * per booking ({@code UNIQUE(booking_ref)}) and per Stripe id ({@code UNIQUE(payment_intent_id)}),
 * a closed {@code status} value set, non-negative money (invariant #5), and the webhook-id dedup
 * key ({@code stripe_webhook_event.event_id} PK — the idempotency guard, invariant #8). Real
 * Flyway on Testcontainers Postgres; skipped (not failed) where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class PaymentMigrationIT {

	@Autowired
	JdbcClient jdbc;

	private void insertPayment(long bookingRef, String intentId, String status) {
		jdbc.sql("""
				INSERT INTO payment (booking_ref, payment_intent_id, amount_minor, currency, status)
				VALUES (:ref, :intent, 4500, 'EUR', :status)
				""")
				.param("ref", bookingRef).param("intent", intentId).param("status", status)
				.update();
	}

	private void insertWebhookEvent(String eventId) {
		jdbc.sql("INSERT INTO stripe_webhook_event (event_id, event_type) "
						+ "VALUES (:id, 'payment_intent.succeeded')")
				.param("id", eventId).update();
	}

	@Test
	void duplicatePaymentIntentRejected() {
		insertPayment(1001L, "pi_dup_intent", "REQUIRES_PAYMENT");
		assertThrows(DataIntegrityViolationException.class,
				() -> insertPayment(1002L, "pi_dup_intent", "REQUIRES_PAYMENT"),
				"UNIQUE(payment_intent_id) must reject a reused PaymentIntent id.");
	}

	@Test
	void duplicateBookingRefRejected() {
		insertPayment(2001L, "pi_booking_a", "REQUIRES_PAYMENT");
		assertThrows(DataIntegrityViolationException.class,
				() -> insertPayment(2001L, "pi_booking_b", "REQUIRES_PAYMENT"),
				"UNIQUE(booking_ref) must enforce one collection per booking (Instant Book).");
	}

	@Test
	void unknownStatusRejected() {
		assertThrows(DataIntegrityViolationException.class,
				() -> insertPayment(3001L, "pi_bad_status", "PENDING"),
				"status CHECK must reject a value outside the closed set.");
	}

	@Test
	void negativeAmountRejected() {
		assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.sql("""
						INSERT INTO payment (booking_ref, payment_intent_id, amount_minor, currency, status)
						VALUES (4001, 'pi_negative', -1, 'EUR', 'REQUIRES_PAYMENT')
						""").update(),
				"amount_minor CHECK must reject a negative amount (invariant #5).");
	}

	@Test
	void duplicateWebhookEventIdRejected() {
		insertWebhookEvent("evt_dup_1");
		assertThrows(DataIntegrityViolationException.class,
				() -> insertWebhookEvent("evt_dup_1"),
				"stripe_webhook_event.event_id is the PK / dedup key (invariant #8).");
	}

	@Test
	void distinctRowsAllowed() {
		assertDoesNotThrow(() -> {
			insertPayment(5001L, "pi_ok_a", "REQUIRES_PAYMENT");
			insertPayment(5002L, "pi_ok_b", "SUCCEEDED");
			insertWebhookEvent("evt_ok_1");
			insertWebhookEvent("evt_ok_2");
		}, "distinct payments and webhook events must insert cleanly.");
	}

	@Test
	void refundStatesAccepted() {
		// U6 (V11): the refund terminal states + refund record columns.
		assertDoesNotThrow(() -> {
			insertPayment(6001L, "pi_refunded", "SUCCEEDED");
			jdbc.sql("""
					UPDATE payment SET status = 'REFUNDED', refunded_minor = 4500, refund_id = 're_full'
					WHERE payment_intent_id = 'pi_refunded'
					""").update();
			insertPayment(6002L, "pi_partial", "SUCCEEDED");
			jdbc.sql("""
					UPDATE payment SET status = 'PARTIALLY_REFUNDED', refunded_minor = 2250, refund_id = 're_part'
					WHERE payment_intent_id = 'pi_partial'
					""").update();
		}, "REFUNDED / PARTIALLY_REFUNDED + refund columns must be accepted (V11).");
	}

	@Test
	void refundExceedingAmountRejected() {
		insertPayment(7001L, "pi_over_refund", "SUCCEEDED"); // amount_minor = 4500
		assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.sql("UPDATE payment SET refunded_minor = 9999 "
						+ "WHERE payment_intent_id = 'pi_over_refund'").update(),
				"payment_refunded_check must reject a refund greater than the collected amount (V11).");
	}
}
