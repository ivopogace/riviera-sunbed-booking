package ai.riviera.platform.payment;

import java.time.LocalDate;

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
 * ({@code payment_booking_uniq}) while one intent may collect for several, one refund per booking and
 * scope ({@code payment_refund_uniq}: the whole share once, each day once), a closed {@code status}
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
			recordRefund(6001L, "BOOKING", null, 4500L, "re_mig_full");
			jdbc.sql("UPDATE payment SET status = 'REFUNDED' WHERE payment_intent_id = 'pi_refunded'").update();
			insertPayment(6002L, "pi_partial", "SUCCEEDED");
			recordRefund(6002L, "BOOKING", null, 2250L, "re_mig_part");
			jdbc.sql("UPDATE payment SET status = 'PARTIALLY_REFUNDED' WHERE payment_intent_id = 'pi_partial'")
					.update();
		}, "REFUNDED / PARTIALLY_REFUNDED + the booking's refund rows must be accepted.");
	}

	@Test
	void aShareCannotBeOverRefunded() {
		insertPayment(7001L, "pi_over_refund", "SUCCEEDED"); // share = 4500
		assertThrows(DataIntegrityViolationException.class,
				() -> jdbc.sql("UPDATE payment_booking SET refunded_minor = 9999 WHERE booking_ref = 7001")
						.update(),
				"payment_booking_refunded_check must reject a running sum greater than the booking's share.");
	}

	@Test
	void aRefundIdIsRecordedOnce() {
		insertPayment(7101L, "pi_refund_id_a", "SUCCEEDED");
		insertPayment(7102L, "pi_refund_id_b", "SUCCEEDED");
		recordRefund(7101L, "BOOKING", null, 4500L, "re_once");

		assertThrows(DataIntegrityViolationException.class,
				() -> recordRefund(7102L, "BOOKING", null, 4500L, "re_once"),
				"payment_refund_id_uniq: a gateway refund belongs to one row, so its failure finds one.");
	}

	@Test
	void oneRefundPerBookingAndScope() {
		// V70: the whole share once, each day once; a day and the whole share may both exist.
		insertPayment(7201L, "pi_scopes", "SUCCEEDED");
		LocalDate day = LocalDate.of(2029, 7, 8);
		recordRefund(7201L, "DAY", day, 300L, "re_day_8");

		assertThrows(DataIntegrityViolationException.class,
				() -> recordRefund(7201L, "DAY", day, 300L, "re_day_8_again"),
				"payment_refund_uniq: a day's share is refunded at most once");
		assertDoesNotThrow(() -> recordRefund(7201L, "DAY", day.plusDays(1), 300L, "re_day_9"),
				"another day is another refund");
		assertDoesNotThrow(() -> recordRefund(7201L, "BOOKING", null, 3900L, "re_rest"),
				"the whole-share refund sits beside the day refunds");
		assertThrows(DataIntegrityViolationException.class,
				() -> recordRefund(7201L, "BOOKING", null, 3900L, "re_rest_again"),
				"payment_refund_uniq: NULLS NOT DISTINCT keeps the whole-share refund one per booking");
	}

	@Test
	void aDayRefundNamesItsDayAndTheWholeShareDoesNot() {
		insertPayment(7301L, "pi_scope_shape", "SUCCEEDED");
		assertThrows(DataIntegrityViolationException.class, () -> recordRefund(7301L, "DAY", null, 300L, "re_x"),
				"payment_refund_day_check: a DAY refund names its day");
		assertThrows(DataIntegrityViolationException.class,
				() -> recordRefund(7301L, "BOOKING", LocalDate.of(2029, 7, 8), 300L, "re_y"),
				"payment_refund_day_check: the whole share carries no day");
		assertThrows(DataIntegrityViolationException.class, () -> recordRefund(7301L, "STAY", null, 300L, "re_z"),
				"payment_refund_scope_check admits only BOOKING | DAY");
	}

	/**
	 * The owed shape: a collected payment whose refund died is {@code SUCCEEDED} with nothing refunded
	 * and no live refund id on the refund row, carrying only the failure trace. That combination is what
	 * makes the owed-refund list enumerable, so the schema must admit it rather than constrain it away.
	 */
	@Test
	void refundFailureTraceColumnsAdmitAnOwedRefund() {
		insertPayment(8001L, "pi_owed", "SUCCEEDED");

		assertDoesNotThrow(() -> jdbc.sql("""
				INSERT INTO payment_refund (payment_booking_id, scope, attempted_at, failed_at, failed_refund_id)
				SELECT id, 'BOOKING', NOW(), NOW(), 're_dead' FROM payment_booking WHERE booking_ref = 8001
				""").update(), "the refund row must admit a collected payment whose refund returned no money.");

		assertEquals(1, jdbc.sql("""
				SELECT COUNT(*) FROM payment_refund r
				JOIN payment_booking b ON b.id = r.payment_booking_id JOIN payment p ON p.id = b.payment_id
				WHERE b.booking_ref = 8001 AND r.failed_at IS NOT NULL AND r.refund_id IS NULL
				  AND r.amount_minor = 0 AND p.status = 'SUCCEEDED'
				""").query(Integer.class).single(),
				"the trace must be readable as the queryable list of bookings still owed a refund.");
	}

	@Test
	void aFreshShareCarriesNoRefundRow() {
		insertPayment(8002L, "pi_untouched", "SUCCEEDED");

		assertEquals(0, jdbc.sql("""
				SELECT COUNT(*) FROM payment_refund r JOIN payment_booking b ON b.id = r.payment_booking_id
				WHERE b.booking_ref = 8002
				""").query(Integer.class).single(),
				"no attempt recorded and no failure observed is a fresh share's truth: no refund row at all.");
		assertEquals(0L, jdbc.sql("SELECT refunded_minor FROM payment_booking WHERE booking_ref = 8002")
				.query(Long.class).single());
	}

	private void recordRefund(long bookingRef, String scope, LocalDate serviceDate, long amountMinor, String refundId) {
		jdbc.sql("""
				INSERT INTO payment_refund (payment_booking_id, scope, service_date, amount_minor, refund_id)
				SELECT id, :scope, :day, :amount, :refundId FROM payment_booking WHERE booking_ref = :ref
				""")
				.param("ref", bookingRef).param("scope", scope).param("day", serviceDate)
				.param("amount", amountMinor).param("refundId", refundId)
				.update();
		jdbc.sql("UPDATE payment_booking SET refunded_minor = refunded_minor + :amount WHERE booking_ref = :ref")
				.param("amount", amountMinor).param("ref", bookingRef).update();
	}
}
