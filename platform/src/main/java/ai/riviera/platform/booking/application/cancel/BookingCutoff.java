package ai.riviera.platform.booking.application.cancel;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import org.springframework.stereotype.Component;

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
	 * Whether free cancellation is still open for {@code bookingDate} — the same evening-before
	 * boundary as {@link #isBookable} (invariant #4: one rule, two jobs). Before it, a cancellation
	 * is fully refundable (invariant #10); after it, the venue's late-cancel policy applies.
	 */
	boolean freeCancellationOpen(LocalTime cutoff, LocalDate bookingDate) {
		return isBeforeCutoff(cutoff, bookingDate);
	}

	private boolean isBeforeCutoff(LocalTime cutoff, LocalDate bookingDate) {
		ZonedDateTime closesAt = bookingDate.minusDays(1).atTime(cutoff).atZone(TIRANE);
		return clock.instant().isBefore(closesAt.toInstant());
	}
}
