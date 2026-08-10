package ai.riviera.platform.payment.adapter.out;

import java.util.List;
import java.util.Optional;

import ai.riviera.platform.payment.vocabulary.PaymentCredentials;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.application.NewPayment;
import ai.riviera.platform.payment.application.Payments;
import ai.riviera.platform.payment.application.RefundState;
import ai.riviera.platform.payment.domain.PaymentStatus;

/**
 * JDBC adapter for {@link Payments} — explicit SQL via {@link JdbcClient}, no JPA (invariant
 * #1). Package-private; only the port is referenced cross-layer. Stores the Stripe
 * {@code payment_intent_id} (never card data) so a signature-verified webhook can correlate
 * back to the booking (invariant #8).
 */
@Repository
class JdbcPayments implements Payments {

	// The PaymentIntent-id named-parameter key, reused across the correlation queries.
	private static final String PARAM_INTENT = "intent";
	private static final String PARAM_STATUS = "status";
	private static final String PARAM_OPEN = "open";

	/** The non-terminal statuses: an intent here can still be paid, so it is also still transitionable. */
	private static final List<String> OPEN_STATUSES =
			List.of(PaymentStatus.REQUIRES_PAYMENT.name(), PaymentStatus.FAILED.name());

	/** The statuses that mean a refund is on record, and so is there to be un-recorded. */
	private static final List<String> REFUND_RECORDED_STATUSES =
			List.of(PaymentStatus.REFUNDED.name(), PaymentStatus.PARTIALLY_REFUNDED.name());

	/** The statuses in which the gateway holds collected money, so a refund of it can be recorded. */
	private static final List<String> COLLECTED_STATUSES =
			List.of(PaymentStatus.SUCCEEDED.name(), PaymentStatus.REFUNDED.name(),
					PaymentStatus.PARTIALLY_REFUNDED.name());

	private static final String PARAM_REFUND_ID = "refundId";

	private final JdbcClient jdbc;

	JdbcPayments(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public void register(NewPayment payment) {
		jdbc.sql("""
				INSERT INTO payment (booking_ref, payment_intent_id, amount_minor, currency, status,
				                     client_secret)
				VALUES (:ref, :intent, :amount, :currency, :status, :clientSecret)
				""")
				.param("ref", payment.bookingRef().value())
				.param(PARAM_INTENT, payment.paymentIntentId())
				.param("amount", payment.amountMinor())
				.param("currency", payment.currency())
				.param(PARAM_STATUS, PaymentStatus.REQUIRES_PAYMENT.name())
				.param("clientSecret", payment.clientSecret())
				.update();
	}

	@Override
	public Optional<PaymentCredentials> findPendingCredentials(
			BookingRef booking) {
		// Pay-on-accept read (issue #98): an intent is payable while OPEN — including after a
		// payment_intent.payment_failed, which is NOT terminal in Stripe (the guest can retry the
		// same intent; hiding the credentials would strand an accepted guest whose card declined
		// once). Succeeded/canceled rows (or secret-less stub/pre-V19 rows) yield empty.
		return jdbc.sql("""
				SELECT payment_intent_id, client_secret
				FROM payment
				WHERE booking_ref = :ref AND status IN (:payable) AND client_secret IS NOT NULL
				""")
				.param("ref", booking.value())
				.param("payable", OPEN_STATUSES)
				.query((rs, rowNum) -> new ai.riviera.platform.payment.vocabulary.PaymentCredentials(
						rs.getString("client_secret"), rs.getString("payment_intent_id")))
				.optional();
	}

	@Override
	public Optional<BookingRef> findBookingRefByIntent(String paymentIntentId) {
		return jdbc.sql("SELECT booking_ref FROM payment WHERE payment_intent_id = :intent")
				.param(PARAM_INTENT, paymentIntentId)
				.query(Long.class)
				.optional()
				.map(BookingRef::new);
	}

	@Override
	public boolean markStatus(String paymentIntentId, PaymentStatus status) {
		// Guarded in the one statement, never read-then-write: two deliveries cannot both see "open".
		return jdbc.sql("""
				UPDATE payment
				SET status = :status, updated_at = NOW()
				WHERE payment_intent_id = :intent AND status IN (:open)
				""")
				.param(PARAM_STATUS, status.name())
				.param(PARAM_INTENT, paymentIntentId)
				.param(PARAM_OPEN, OPEN_STATUSES)
				.update() == 1;
	}

	@Override
	public Optional<String> findIntentByBookingRef(BookingRef booking) {
		return jdbc.sql("SELECT payment_intent_id FROM payment WHERE booking_ref = :ref")
				.param("ref", booking.value())
				.query(String.class)
				.optional();
	}

	@Override
	public Optional<RefundState> findRefundState(BookingRef booking) {
		return jdbc.sql("SELECT status, refunded_minor FROM payment WHERE booking_ref = :ref")
				.param("ref", booking.value())
				.query((rs, rowNum) -> new RefundState(
						PaymentStatus.valueOf(rs.getString(PARAM_STATUS)), rs.getLong("refunded_minor")))
				.optional();
	}

	@Override
	public void markRefundAttempted(BookingRef booking) {
		jdbc.sql("""
				UPDATE payment
				SET refund_attempted_at = NOW(), updated_at = NOW()
				WHERE booking_ref = :ref AND status IN (:collected)
				""")
				.param("ref", booking.value())
				.param("collected", COLLECTED_STATUSES)
				.update();
	}

	@Override
	public boolean markRefunded(BookingRef booking, long refundedMinor, String refundId) {
		// A refund covering the whole collected amount is REFUNDED, a smaller one PARTIALLY_REFUNDED.
		return jdbc.sql("""
				UPDATE payment
				SET refunded_minor = :refunded, refund_id = :refundId, refund_failed_at = NULL,
				    updated_at = NOW(),
				    status = CASE WHEN :refunded >= amount_minor THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END
				WHERE booking_ref = :ref
				  AND status IN (:collected)
				  AND (failed_refund_id IS NULL OR failed_refund_id <> :refundId)
				""")
				.param("refunded", refundedMinor)
				.param(PARAM_REFUND_ID, refundId)
				.param("ref", booking.value())
				.param("collected", COLLECTED_STATUSES)
				.update() == 1;
	}

	@Override
	public boolean markRefundFailed(String refundId) {
		// Guarded in the one statement, never read-then-write: two deliveries cannot both un-record.
		return jdbc.sql("""
				UPDATE payment
				SET refunded_minor = 0, status = :succeeded, refund_id = NULL,
				    failed_refund_id = :refundId, refund_failed_at = NOW(), updated_at = NOW()
				WHERE refund_id = :refundId AND status IN (:recorded)
				""")
				.param("succeeded", PaymentStatus.SUCCEEDED.name())
				.param(PARAM_REFUND_ID, refundId)
				.param("recorded", REFUND_RECORDED_STATUSES)
				.update() == 1;
	}

	@Override
	public boolean markUnrecordedRefundFailed(String paymentIntentId, String refundId) {
		// refund_attempted_at is the discriminator: without it this is someone else's manual refund.
		return jdbc.sql("""
				UPDATE payment
				SET failed_refund_id = :refundId, refund_failed_at = NOW(), updated_at = NOW()
				WHERE payment_intent_id = :intent
				  AND status = :succeeded
				  AND refund_id IS NULL
				  AND refund_attempted_at IS NOT NULL
				  AND (failed_refund_id IS NULL OR failed_refund_id <> :refundId)
				""")
				.param(PARAM_REFUND_ID, refundId)
				.param(PARAM_INTENT, paymentIntentId)
				.param("succeeded", PaymentStatus.SUCCEEDED.name())
				.update() == 1;
	}

	@Override
	public long owedRefundCount() {
		// Served by payment_refund_owed_idx, the partial index over exactly these rows (V42).
		return jdbc.sql("SELECT COUNT(*) FROM payment WHERE refund_failed_at IS NOT NULL")
				.query(Long.class)
				.single();
	}
}
