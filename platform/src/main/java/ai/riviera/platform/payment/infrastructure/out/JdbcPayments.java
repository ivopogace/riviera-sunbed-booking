package ai.riviera.platform.payment.infrastructure.out;

import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.application.out.NewPayment;
import ai.riviera.platform.payment.application.out.Payments;
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
}
