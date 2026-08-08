package ai.riviera.platform.booking.application.cancel;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.domain.CancellationWindow;

/**
 * Enforces the no-same-day booking rule (invariant #4): bookings for a date close at the
 * venue's cutoff time the <strong>evening before</strong>. This single rule also serves as
 * collision-prevention Layer 2 and (later, U6) the cancellation cutoff.
 *
 * <p>The civil day is reasoned in {@code Europe/Tirane} (invariant #6) from an injected UTC
 * {@link Clock} — never the JVM default zone, never {@code LocalDateTime.now()}. A date is
 * bookable iff "now" is strictly before {@code (bookingDate − 1 day)} at the cutoff time in
 * that zone; past and same-day dates fail naturally.
 *
 * <p>Module-internal but {@code public} so the {@code reserve} slice ({@code ReserveSetService})
 * can consult the same cutoff the {@code cancel} slice enforces — invariant #4's "one rule, two
 * jobs" shared across use-case sub-packages. Not exported: {@code application} is not a
 * {@code @NamedInterface}, so Modulith still keeps it inside the {@code booking} module (invariant #11).
 */
@Component
public class BookingCutoff {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final Clock clock;

	public BookingCutoff(Clock clock) {
		this.clock = clock;
	}

	public boolean isBookable(LocalTime cutoff, LocalDate bookingDate) {
		return isBeforeCutoff(cutoff, bookingDate);
	}

	/**
	 * Which cancellation window {@code bookingDate} is in right now (invariant #10). Two boundaries:
	 * the evening-before cutoff {@link #isBookable} already enforces (invariant #4: one rule, two
	 * jobs), then the start of the service day, past which cancellation is refused outright.
	 */
	CancellationWindow cancellationWindow(LocalTime cutoff, LocalDate bookingDate) {
		if (isBeforeCutoff(cutoff, bookingDate)) {
			return CancellationWindow.FREE;
		}
		return clock.instant().isBefore(serviceDayOpensAt(bookingDate))
				? CancellationWindow.LATE
				: CancellationWindow.CLOSED;
	}

	/** The instant the stay becomes consumable — midnight in {@code Europe/Tirane} (invariant #6). */
	private java.time.Instant serviceDayOpensAt(LocalDate bookingDate) {
		return bookingDate.atStartOfDay(TIRANE).toInstant();
	}

	/**
	 * The instant at which booking (and free cancellation) for {@code bookingDate} closes — the
	 * evening-before {@code cutoff} wall-clock time in {@code Europe/Tirane} (invariants #4/#6).
	 * Public for the Request-to-Book deadline (issue #98): a pending request's
	 * {@code request_expires_at} is capped at this instant, so a venue can never accept a request
	 * after bookings for that date have closed — one rule, three jobs.
	 */
	public java.time.Instant closesAt(LocalTime cutoff, LocalDate bookingDate) {
		return bookingDate.minusDays(1).atTime(cutoff).atZone(TIRANE).toInstant();
	}

	private boolean isBeforeCutoff(LocalTime cutoff, LocalDate bookingDate) {
		return clock.instant().isBefore(closesAt(cutoff, bookingDate));
	}
}
