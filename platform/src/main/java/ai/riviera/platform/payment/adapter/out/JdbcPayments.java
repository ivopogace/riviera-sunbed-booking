package ai.riviera.platform.payment.adapter.out;

import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.payment.api.BookingRef;
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

	private final JdbcClient jdbc;

	JdbcPayments(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public void register(NewPayment payment) {
		jdbc.sql("""
				INSERT INTO payment (booking_ref, payment_intent_id, amount_minor, currency, status)
				VALUES (:ref, :intent, :amount, :currency, :status)
				""")
				.param("ref", payment.bookingRef().value())
				.param(PARAM_INTENT, payment.paymentIntentId())
				.param("amount", payment.amountMinor())
				.param("currency", payment.currency())
				.param("status", PaymentStatus.REQUIRES_PAYMENT.name())
				.update();
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
				.param("status", status.name())
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
