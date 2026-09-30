package ai.riviera.platform.payment.domain;

import java.time.LocalDate;
import java.util.Objects;

/**
 * Which part of a booking's share a refund is for: the whole share ({@link #WHOLE}, the cancellation
 * refund) or one service day's share ({@link #day}, a day refund of a day the stay goes on past —
 * weather's, ADR-0026, or the venue's own, ADR-0027). One refund per scope is the rule
 * (`payment_refund_uniq`), so a replay finds its own row and a day is never refunded twice.
 * {@code kind()} is the {@code TEXT} token the DB {@code CHECK} lists (keep in lockstep).
 */
public record RefundScope(LocalDate serviceDate) {

	public static final RefundScope WHOLE = new RefundScope(null);

	private static final String KIND_BOOKING = "BOOKING";
	private static final String KIND_DAY = "DAY";

	public static RefundScope day(LocalDate serviceDate) {
		return new RefundScope(Objects.requireNonNull(serviceDate, "a day refund names its day"));
	}

	public boolean isDay() {
		return serviceDate != null;
	}

	public String kind() {
		return isDay() ? KIND_DAY : KIND_BOOKING;
	}

	/** The scope's part of the gateway idempotency key: {@code refund}, or {@code day-<yyyy-MM-dd>-refund}. */
	public String keySuffix() {
		return isDay() ? "day-" + serviceDate + "-refund" : "refund";
	}
}
