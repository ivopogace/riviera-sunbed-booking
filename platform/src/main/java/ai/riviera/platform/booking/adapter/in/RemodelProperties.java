package ai.riviera.platform.booking.adapter.in;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The remodel zone bounds, bound from {@code riviera.booking.remodel.*}: {@code freeze-window} —
 * a claim whose service day opens within it (or already opened) pins its set (default 24h) — and
 * {@code refund-notice-floor} — a claim within it may be moved but never refunded by a remodel
 * (default 96h). Both are durations to the day's open in {@code Europe/Tirane}. Converted to the
 * application-layer {@code RemodelWindows} value by {@code RemodelConfig}.
 *
 * <p>Validated in the compact constructor rather than with {@code @Validated}: no JSR-303
 * implementation is on the classpath, so an annotation would bind and validate nothing. The floor
 * must lie strictly beyond the freeze window, or no move-only band exists and the two bounds
 * contradict each other for the claims between them.
 *
 * @param freezeWindow      default {@code PT24H}, at least {@link #MIN_WINDOW}
 * @param refundNoticeFloor default {@code PT96H}, strictly greater than {@code freezeWindow}
 */
@ConfigurationProperties("riviera.booking.remodel")
public record RemodelProperties(Duration freezeWindow, Duration refundNoticeFloor) {

	private static final Duration DEFAULT_FREEZE_WINDOW = Duration.ofHours(24);
	private static final Duration DEFAULT_REFUND_NOTICE_FLOOR = Duration.ofHours(96);

	/** Below a minute the freeze window is a rounding error: a claim opening now would still move. */
	static final Duration MIN_WINDOW = Duration.ofMinutes(1);

	public RemodelProperties {
		freezeWindow = freezeWindow == null ? DEFAULT_FREEZE_WINDOW : freezeWindow;
		refundNoticeFloor = refundNoticeFloor == null ? DEFAULT_REFUND_NOTICE_FLOOR : refundNoticeFloor;
		if (freezeWindow.compareTo(MIN_WINDOW) < 0) {
			throw new IllegalArgumentException(
					"riviera.booking.remodel.freeze-window must be at least " + MIN_WINDOW + ", but was "
							+ freezeWindow + "; a claim whose service day is about to open must pin its set, "
							+ "or a remodel could re-seat a guest who is already on the way");
		}
		if (refundNoticeFloor.compareTo(freezeWindow) <= 0) {
			throw new IllegalArgumentException(
					"riviera.booking.remodel.refund-notice-floor must be greater than the freeze window "
							+ freezeWindow + ", but was " + refundNoticeFloor + "; the floor is the far edge of "
							+ "the move-only band and a floor at or inside the freeze leaves no such band");
		}
	}
}
