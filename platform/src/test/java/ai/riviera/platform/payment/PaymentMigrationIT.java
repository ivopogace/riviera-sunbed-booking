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
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Verifies the payment schema's invariant-enforcing constraints (invariant #12): one collection per
 * Stripe id ({@code UNIQUE(payment_intent_id)}), one booking row per booking
 * ({@code payment_booking_uniq}) while one intent may collect for several, a closed {@code status}
 * value set, non-negative money and a share never refunded past itself (invariant #5), and the
 * webhook-id dedup key ({@code stripe_webhook_event.event_id} PK — the idempotency guard, invariant
 * #8). Real Flyway on Testcontainers Postgres; skipped (not failed) where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class PaymentMigrationIT {

	@Autowired
	JdbcClient jdbc;

	/** A collection for one booking whose share is the whole amount — the pre-V64 shape, on two tables. */
	private void insertPayment(long bookingRef, String intentId, String status) {
		long payment = insertCollection(intentId, 4500L, status);
		insertShare(payment, bookingRef, 4500L);
	}

	private long insertCollection(String intentId, long amountMinor, String status) {
		return jdbc.sql("""
				INSERT INTO payment (payment_intent_id, amount_minor, currency, status)
				VALUES (:intent, :amount, 'EUR', :status)
				RETURNING id
				""")
				.param("intent", intentId).param("amount", amountMinor).param("status", status)
				.query(Long.class).single();
	}

	private void insertShare(long paymentId, long bookingRef, long amountMinor) {
		jdbc.sql("""
				INSERT INTO payment_booking (payment_id, booking_ref, amount_minor)
				VALUES (:payment, :ref, :amount)
				""")
				.param("payment", paymentId).param("ref", bookingRef).param("amount", amountMinor)
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
	void oneBookingRowPerBooking() {
		long first = insertCollection("pi_booking_a", 4500L, "REQUIRES_PAYMENT");
		long second = insertCollection("pi_booking_b", 4500L, "REQUIRES_PAYMENT");
		insertShare(first, 2001L, 4500L);

		assertThrows(DataIntegrityViolationException.class, () -> insertShare(second, 2001L, 4500L),
				"payment_booking_uniq must enforce one collection per booking.");
	}

	@Test
	void oneIntentMayCollectForSeveralBookings() {
		long payment = insertCollection("pi_shared", 7500L, "REQUIRES_PAYMENT");

		assertDoesNotThrow(() -> {
			insertShare(payment, 2101L, 4500L);
			insertShare(payment, 2102L, 3000L);
		}, "a stay is a group of bookings paid with one PaymentIntent (D6/D8).");

		assertEquals(7500L, jdbc.sql("SELECT SUM(amount_minor) FROM payment_booking WHERE payment_id = :p")
				.param("p", payment).query(Long.class).single(), "the shares make up the intent's total");
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
				() -> insertCollection("pi_negative", -1L, "REQUIRES_PAYMENT"),
				"amount_minor CHECK must reject a negative amount (invariant #5).");
	}

	@Test
	void negativeShareRejected() {
		long payment = insertCollection("pi_negative_share", 4500L, "REQUIRES_PAYMENT");
		assertThrows(DataIntegrityViolationException.class, () -> insertShare(payment, 4002L, -1L),
				"payment_booking_amount_check must reject a negative share (invariant #5).");
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
		assertDoesNotThrow(() -> {
			insertPayment(6001L, "pi_refunded", "SUCCEEDED");
			jdbc.sql("""
					UPDATE payment_booking SET refunded_minor = 4500, refund_id = 're_mig_full' WHERE booking_ref = 6001
					""").update();
			jdbc.sql("UPDATE payment SET status = 'REFUNDED' WHERE payment_intent_id = 'pi_refunded'").update();
			insertPayment(6002L, "pi_partial", "SUCCEEDED");
			jdbc.sql("""
					UPDATE payment_booking SET refunded_minor = 2250, refund_id = 're_mig_part' WHERE booking_ref = 6002
					""").update();
			jdbc.sql("UPDATE payment SET status = 'PARTIALLY_REFUNDED' WHERE payment_intent_id = 'pi_partial'")
					.update();
		}, "REFUNDED / PARTIALLY_REFUNDED + the booking's refund columns must be accepted.");
	}

	@Test
	void aShareCannotBeOverRefunded() {
		insertPayment(7001L, "pi_over_refund", "SUCCEEDED"); // share = 4500
		assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.sql("UPDATE payment_booking SET refunded_minor = 9999 WHERE booking_ref = 7001")
						.update(),
				"payment_booking_refunded_check must reject a refund greater than the booking's share.");
	}

	@Test
	void aRefundIdIsRecordedOnce() {
		insertPayment(7101L, "pi_refund_id_a", "SUCCEEDED");
		insertPayment(7102L, "pi_refund_id_b", "SUCCEEDED");
		jdbc.sql("UPDATE payment_booking SET refund_id = 're_once' WHERE booking_ref = 7101").update();

		assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.sql("UPDATE payment_booking SET refund_id = 're_once' WHERE booking_ref = 7102")
						.update(),
				"payment_booking_refund_uniq: a gateway refund belongs to one booking, so its failure finds one row.");
	}

	/**
	 * The owed shape: a collected payment whose refund died is {@code SUCCEEDED} with nothing refunded
	 * and no live refund id on the booking, carrying only the failure trace. That combination is what
	 * makes the owed-refund list enumerable, so the schema must admit it rather than constrain it away.
	 */
	@Test
	void refundFailureTraceColumnsAdmitAnOwedRefund() {
		insertPayment(8001L, "pi_owed", "SUCCEEDED");

		assertDoesNotThrow(() -> jdbc.sql("""
				UPDATE payment_booking
				SET refund_attempted_at = NOW(), refund_failed_at = NOW(), failed_refund_id = 're_dead',
				    refunded_minor = 0, refund_id = NULL
				WHERE booking_ref = 8001
				""").update(), "the booking row must admit a collected payment whose refund returned no money.");

		assertEquals(1, jdbc.sql("""
				SELECT COUNT(*) FROM payment_booking b JOIN payment p ON p.id = b.payment_id
				WHERE b.booking_ref = 8001 AND b.refund_failed_at IS NOT NULL AND p.status = 'SUCCEEDED'
				""").query(Integer.class).single(),
				"the trace must be readable as the queryable list of bookings still owed a refund.");
	}

	@Test
	void refundFailureTraceIsNullForEveryFreshRow() {
		insertPayment(8002L, "pi_untouched", "SUCCEEDED");

		assertEquals(1, jdbc.sql("""
				SELECT COUNT(*) FROM payment_booking
				WHERE booking_ref = 8002 AND refund_attempted_at IS NULL AND refund_failed_at IS NULL
				  AND failed_refund_id IS NULL AND refunded_minor = 0
				""").query(Integer.class).single(),
				"no attempt recorded and no failure observed is a fresh booking row's truth.");
	}
}
