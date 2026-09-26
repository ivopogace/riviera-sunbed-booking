package ai.riviera.platform.booking.adapter.in;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The remodel zone bounds from {@code riviera.booking.remodel.*}, durations to the day's open in
 * {@code Europe/Tirane}: {@code freeze-window} (default 24h, ≥ {@link #MIN_WINDOW}): a claim whose
 * service day opens within it (or opened) pins its set; {@code refund-notice-floor} (default 96h,
 * strictly beyond the freeze, or no move-only band exists): a claim within it moves, never refunds.
 * Validated in the compact constructor, not {@code @Validated}: no JSR-303 implementation is on the
 * classpath, so the annotation would validate nothing. Read via {@code RemodelConfig}.
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
