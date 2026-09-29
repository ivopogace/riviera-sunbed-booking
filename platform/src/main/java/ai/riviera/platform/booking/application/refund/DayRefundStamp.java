package ai.riviera.platform.booking.application.refund;

import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.operator.vocabulary.OperatorId;

/**
 * What a day refund writes on the service day beside the amount: why ({@code WEATHER} or {@code VENUE},
 * the two {@code booking_day_refund_reason_check} admits), who ({@code actor}, required for {@code VENUE},
 * recorded without a foreign key) and whether the day's claim is {@code released} (ADR-0027 §4: a
 * {@code VENUE} day that is not past). The weather refund's stamp is {@link #weather()}.
 */
public record DayRefundStamp(RefundReason reason, OperatorId actor, boolean released) {

	public DayRefundStamp {
		if (reason != RefundReason.WEATHER && reason != RefundReason.VENUE) {
			throw new IllegalArgumentException("a day is refunded for weather or by the venue, not " + reason);
		}
		if (reason == RefundReason.VENUE && actor == null) {
			throw new IllegalArgumentException("a VENUE day refund names its actor");
		}
		if (released && reason != RefundReason.VENUE) {
			throw new IllegalArgumentException("only a VENUE day is released");
		}
	}

	/** The weather refund's stamp: the set stays held (ADR-0026 §3), no actor recorded. */
	public static DayRefundStamp weather() {
		return new DayRefundStamp(RefundReason.WEATHER, null, false);
	}

	/** The venue's own refund by {@code actor}; {@code released} iff the day is not past. */
	public static DayRefundStamp venue(OperatorId actor, boolean released) {
		return new DayRefundStamp(RefundReason.VENUE, actor, released);
	}
}
