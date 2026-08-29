package ai.riviera.platform.venue.domain;

import java.time.LocalTime;
import java.util.Arrays;

/**
 * The venue's sales-close choice (invariant #4): online sales for a service day run until this
 * wall-clock time on the day itself, {@code Europe/Tirane}. A choice among exactly three fixed
 * values — the times mirror the {@code venue_sales_close_check} tokens (V44), and this enum is
 * their single Java mirror: the write path speaks the choice, so an off-vocabulary time is
 * unrepresentable past {@link #fromTime}. Cross-module carriers deliberately keep
 * {@link LocalTime} — the fence does time arithmetic; the three-ness is venue's write concern.
 */
public enum SalesClose {

	/** {@code 00:01} — the venue opts out of same-day online sales. */
	DAY_START(LocalTime.of(0, 1)),
	/** {@code 16:00} — mid-afternoon close, the epic-decided default. */
	MID_AFTERNOON(LocalTime.of(16, 0)),
	/** {@code 23:59} — online sales stay open all day. */
	DAY_END(LocalTime.of(23, 59));

	public static final SalesClose DEFAULT = MID_AFTERNOON;

	private final LocalTime time;

	SalesClose(LocalTime time) {
		this.time = time;
	}

	public LocalTime time() {
		return time;
	}

	/** The one conversion in; anything but the three fixed values is an {@link IllegalArgumentException}. */
	public static SalesClose fromTime(LocalTime time) {
		return Arrays.stream(values())
				.filter(choice -> choice.time.equals(time))
				.findFirst()
				.orElseThrow(() -> new IllegalArgumentException(
						"salesClose must be one of 00:01, 16:00, 23:59"));
	}
}
