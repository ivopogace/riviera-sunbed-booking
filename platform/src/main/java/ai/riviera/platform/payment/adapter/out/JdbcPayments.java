package ai.riviera.platform.payment.adapter.out;

import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.application.NewPayment;
import ai.riviera.platform.payment.application.Payments;
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
	public Optional<ai.riviera.platform.payment.vocabulary.PaymentCredentials> findPendingCredentials(
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
				.param("payable", java.util.List.of(PaymentStatus.REQUIRES_PAYMENT.name(),
						PaymentStatus.FAILED.name()))
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
	public void markStatus(String paymentIntentId, PaymentStatus status) {
		jdbc.sql("""
				UPDATE payment
				SET status = :status, updated_at = NOW()
				WHERE payment_intent_id = :intent
				""")
				.param(PARAM_STATUS, status.name())
				.param(PARAM_INTENT, paymentIntentId)
				.update();
	}

	@Override
	public Optional<String> findIntentByBookingRef(BookingRef booking) {
		return jdbc.sql("SELECT payment_intent_id FROM payment WHERE booking_ref = :ref")
				.param("ref", booking.value())
				.query(String.class)
				.optional();
	}

	@Override
	public void markRefunded(BookingRef booking, long refundedMinor, String refundId) {
		// Status is decided from the collected amount: a refund covering the whole amount is REFUNDED,
		// otherwise PARTIALLY_REFUNDED. A 0-row no-op if no payment row exists (stub profile).
		jdbc.sql("""
				UPDATE payment
				SET refunded_minor = :refunded, refund_id = :refundId, updated_at = NOW(),
				    status = CASE WHEN :refunded >= amount_minor THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END
				WHERE booking_ref = :ref
				""")
				.param("refunded", refundedMinor)
				.param("refundId", refundId)
				.param("ref", booking.value())
				.update();
	}
}
