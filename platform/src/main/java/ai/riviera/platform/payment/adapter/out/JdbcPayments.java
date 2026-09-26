package ai.riviera.platform.payment.adapter.out;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import ai.riviera.platform.payment.vocabulary.PaymentCredentials;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.application.NewPayment;
import ai.riviera.platform.payment.application.Payments;
import ai.riviera.platform.payment.application.RefundState;
import ai.riviera.platform.payment.domain.PaymentStatus;

/**
 * JDBC adapter for {@link Payments} — explicit SQL via {@link JdbcClient}, no JPA (invariant
 * #1). Package-private; only the port is referenced cross-layer. Stores the Stripe
 * {@code payment_intent_id} (never card data) so a signature-verified webhook can correlate
 * back to the bookings (invariant #8). The intent lives on {@code payment}, each booking's share
 * and refund on {@code payment_booking}; a refund write moves the one share and re-derives the
 * intent's status from every share in the same statement.
 */
@Repository
class JdbcPayments implements Payments {

	// The PaymentIntent-id named-parameter key, reused across the correlation queries.
	private static final String PARAM_INTENT = "intent";
	private static final String PARAM_STATUS = "status";
	private static final String PARAM_OPEN = "open";
	private static final String PARAM_REF = "ref";
	private static final String PARAM_COLLECTED = "collected";
	private static final String PARAM_REFUND_ID = "refundId";
	private static final String PARAM_DELTA = "delta";

	/** The non-terminal statuses: an intent here can still be paid, so it is also still transitionable. */
	private static final List<String> OPEN_STATUSES =
			List.of(PaymentStatus.REQUIRES_PAYMENT.name(), PaymentStatus.FAILED.name());

	/** The statuses that mean a refund is on record, and so is there to be un-recorded. */
	private static final List<String> REFUND_RECORDED_STATUSES =
			List.of(PaymentStatus.REFUNDED.name(), PaymentStatus.PARTIALLY_REFUNDED.name());

	/** The statuses in which the gateway holds collected money, so a refund of it can be recorded. */
	private static final List<String> COLLECTED_STATUSES = Arrays.stream(PaymentStatus.values())
			.filter(PaymentStatus::holdsCollectedMoney)
			.map(PaymentStatus::name)
			.toList();

	/**
	 * The second half of every refund write: the intent's status from what its shares hold refunded.
	 * A data-modifying CTE sees the snapshot from before the statement, so the moved share's new
	 * amount arrives as {@code :delta} and only its siblings are summed.
	 */
	private static final String DERIVE_INTENT_STATUS = """
			UPDATE payment p
			SET status = CASE WHEN total.refunded >= p.amount_minor THEN 'REFUNDED'
			                  WHEN total.refunded > 0 THEN 'PARTIALLY_REFUNDED'
			                  ELSE 'SUCCEEDED' END,
			    updated_at = NOW()
			FROM moved, LATERAL (
			    SELECT COALESCE(SUM(s.refunded_minor), 0) + :delta AS refunded
			    FROM payment_booking s
			    WHERE s.payment_id = moved.payment_id AND s.id <> moved.id
			) AS total
			WHERE p.id = moved.payment_id
			""";

	private final JdbcClient jdbc;

	JdbcPayments(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	@Transactional
	public void register(NewPayment payment) {
		long paymentId = jdbc.sql("""
				INSERT INTO payment (payment_intent_id, amount_minor, currency, status, client_secret)
				VALUES (:intent, :amount, :currency, :status, :clientSecret)
				RETURNING id
				""")
				.param(PARAM_INTENT, payment.paymentIntentId())
				.param("amount", payment.amountMinor())
				.param("currency", payment.currency())
				.param(PARAM_STATUS, PaymentStatus.REQUIRES_PAYMENT.name())
				.param("clientSecret", payment.clientSecret())
				.query(Long.class)
				.single();
		for (NewPayment.Share share : payment.shares()) {
			jdbc.sql("""
					INSERT INTO payment_booking (payment_id, booking_ref, amount_minor)
					VALUES (:payment, :ref, :amount)
					""")
					.param("payment", paymentId)
					.param(PARAM_REF, share.bookingRef().value())
					.param("amount", share.amountMinor())
					.update();
		}
	}

	@Override
	public Optional<PaymentCredentials> findPendingCredentials(
			BookingRef booking) {
		// Pay-on-accept read: an intent is payable while OPEN — including after a
		// payment_intent.payment_failed, which is NOT terminal in Stripe (the guest can retry the
		// same intent; hiding the credentials would strand an accepted guest whose card declined
		// once). Succeeded/canceled rows (or secret-less stub/pre-V19 rows) yield empty.
		return jdbc.sql("""
				SELECT p.payment_intent_id, p.client_secret
				FROM payment p JOIN payment_booking b ON b.payment_id = p.id
				WHERE b.booking_ref = :ref AND p.status IN (:payable) AND p.client_secret IS NOT NULL
				""")
				.param(PARAM_REF, booking.value())
				.param("payable", OPEN_STATUSES)
				.query((rs, rowNum) -> new ai.riviera.platform.payment.vocabulary.PaymentCredentials(
						rs.getString("client_secret"), rs.getString("payment_intent_id")))
				.optional();
	}

	@Override
	public List<BookingRef> findBookingRefsByIntent(String paymentIntentId) {
		return jdbc.sql("""
				SELECT b.booking_ref
				FROM payment_booking b JOIN payment p ON p.id = b.payment_id
				WHERE p.payment_intent_id = :intent
				ORDER BY b.id
				""")
				.param(PARAM_INTENT, paymentIntentId)
				.query(Long.class)
				.list()
				.stream()
				.map(BookingRef::new)
				.toList();
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
		return jdbc.sql("""
				SELECT p.payment_intent_id
				FROM payment p JOIN payment_booking b ON b.payment_id = p.id
				WHERE b.booking_ref = :ref
				""")
				.param(PARAM_REF, booking.value())
				.query(String.class)
				.optional();
	}

	@Override
	public Optional<RefundState> findRefundState(BookingRef booking) {
		return jdbc.sql("""
				SELECT p.status, b.refunded_minor
				FROM payment_booking b JOIN payment p ON p.id = b.payment_id
				WHERE b.booking_ref = :ref
				""")
				.param(PARAM_REF, booking.value())
				.query((rs, rowNum) -> new RefundState(
						PaymentStatus.valueOf(rs.getString(PARAM_STATUS)), rs.getLong("refunded_minor")))
				.optional();
	}

	@Override
	public void markRefundAttempted(BookingRef booking) {
		jdbc.sql("""
				UPDATE payment_booking b
				SET refund_attempted_at = NOW(), updated_at = NOW()
				FROM payment p
				WHERE p.id = b.payment_id AND b.booking_ref = :ref AND p.status IN (:collected)
				""")
				.param(PARAM_REF, booking.value())
				.param(PARAM_COLLECTED, COLLECTED_STATUSES)
				.update();
	}

	@Override
	public boolean markRefunded(BookingRef booking, long refundedMinor, String refundId) {
		return jdbc.sql("""
				WITH moved AS (
				    UPDATE payment_booking b
				    SET refunded_minor = :delta, refund_id = :refundId, refund_failed_at = NULL,
				        refund_attempted_at = NULL, updated_at = NOW()
				    FROM payment p
				    WHERE p.id = b.payment_id
				      AND b.booking_ref = :ref
				      AND p.status IN (:collected)
				      AND (b.failed_refund_id IS NULL OR b.failed_refund_id <> :refundId)
				    RETURNING b.id, b.payment_id
				)
				""" + DERIVE_INTENT_STATUS)
				.param(PARAM_DELTA, refundedMinor)
				.param(PARAM_REFUND_ID, refundId)
				.param(PARAM_REF, booking.value())
				.param(PARAM_COLLECTED, COLLECTED_STATUSES)
				.update() == 1;
	}

	@Override
	public boolean markRefundFailed(String refundId) {
		// Guarded in the one statement, never read-then-write: two deliveries cannot both un-record.
		return jdbc.sql("""
				WITH moved AS (
				    UPDATE payment_booking b
				    SET refunded_minor = 0, refund_id = NULL,
				        failed_refund_id = :refundId, refund_failed_at = NOW(),
				        refund_attempted_at = NULL, updated_at = NOW()
				    FROM payment p
				    WHERE p.id = b.payment_id AND b.refund_id = :refundId AND p.status IN (:recorded)
				    RETURNING b.id, b.payment_id
				)
				""" + DERIVE_INTENT_STATUS)
				.param(PARAM_REFUND_ID, refundId)
				.param("recorded", REFUND_RECORDED_STATUSES)
				.param(PARAM_DELTA, 0L)
				.update() == 1;
	}

	@Override
	public boolean markUnrecordedRefundFailed(BookingRef booking, String refundId) {
		// refund_attempted_at is the discriminator: without it this is someone else's manual refund.
		return jdbc.sql("""
				UPDATE payment_booking b
				SET failed_refund_id = :refundId, refund_failed_at = NOW(),
				    refund_attempted_at = NULL, updated_at = NOW()
				FROM payment p
				WHERE p.id = b.payment_id
				  AND b.booking_ref = :ref
				  AND p.status IN (:collected)
				  AND b.refund_id IS NULL
				  AND b.refund_attempted_at IS NOT NULL
				  AND (b.failed_refund_id IS NULL OR b.failed_refund_id <> :refundId)
				""")
				.param(PARAM_REFUND_ID, refundId)
				.param(PARAM_REF, booking.value())
				.param(PARAM_COLLECTED, COLLECTED_STATUSES)
				.update() == 1;
	}

	@Override
	public long owedRefundCount() {
		// Served by payment_booking_refund_owed_idx, the partial index over exactly these rows (V64).
		return jdbc.sql("SELECT COUNT(*) FROM payment_booking WHERE refund_failed_at IS NOT NULL")
				.query(Long.class)
				.single();
	}
}
