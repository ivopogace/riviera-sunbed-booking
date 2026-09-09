package ai.riviera.platform.booking.application.remodel;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;

import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.booking.domain.RemodelZone;

/**
 * The remodel-zone rule: a claim's zone is the duration from now to its service day's open
 * ({@link BookingCutoff#serviceDayOpensAt}, midnight in {@code Europe/Tirane}) against the two
 * {@link RemodelWindows} bounds, both inclusive on the nearer side — exactly the freeze window
 * before open is still frozen, exactly the floor is still move-only. A day that already opened is
 * frozen. Sales close plays no role. Clock-backed, so it lives in {@code application} (ADR-0018 §2);
 * the instant overload exists so a caller classifying many claims reads the clock once.
 */
@Component
public class RemodelZones {

	private final BookingCutoff cutoff;
	private final RemodelWindows windows;
	private final Clock clock;

	public RemodelZones(BookingCutoff cutoff, RemodelWindows windows, Clock clock) {
		this.cutoff = cutoff;
		this.windows = windows;
		this.clock = clock;
	}

	/** The zone of a claim on {@code bookingDate}, read against this holder's clock. */
	public RemodelZone zoneOf(LocalDate bookingDate) {
		return zoneOf(bookingDate, clock.instant());
	}

	/** The zone of a claim on {@code bookingDate} as seen at {@code now}. */
	public RemodelZone zoneOf(LocalDate bookingDate, Instant now) {
		Duration untilOpen = Duration.between(now, cutoff.serviceDayOpensAt(bookingDate));
		if (untilOpen.compareTo(windows.freezeWindow()) <= 0) {
			return RemodelZone.FROZEN;
		}
		if (untilOpen.compareTo(windows.refundNoticeFloor()) <= 0) {
			return RemodelZone.MOVE_ONLY;
		}
		return RemodelZone.MOVE_OR_REFUND;
	}
}
