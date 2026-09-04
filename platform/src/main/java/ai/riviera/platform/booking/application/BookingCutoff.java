package ai.riviera.platform.booking.application;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.vocabulary.CancellationWindow;

/**
 * Names the service day's boundaries (invariant #4), all reasoned in {@code Europe/Tirane}
 * (invariant #6) from an injected UTC {@link Clock} — never the JVM default zone, never
 * {@code LocalDateTime.now()}: {@link #salesCloseAt}, when online sales for a date close, on the
 * day itself (venue-controlled); {@link #freeCancellationEndsAt}, the evening-before
 * boundary that now serves cancellation only; {@link #serviceDayOpensAt}, midnight opening the
 * stay, past which cancellation is refused outright (invariant #10); and {@link #serviceDayEndsAt},
 * the next midnight, the pay deadline's outer bound. Rationale: {@code RESPONSIBILITIES.md}
 * §{@code booking}.
 *
 * <p>Lives at the {@code application} root, beside {@code Bookings}: the module-wide day-boundary
 * authority, consulted by the reserve, request, view, refund and cancel slices alike. Not exported:
 * {@code application} is not a {@code @NamedInterface}, so Modulith still keeps it inside the
 * {@code booking} module (invariant #11).
 */
@Component
public class BookingCutoff {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final Clock clock;

	public BookingCutoff(Clock clock) {
		this.clock = clock;
	}

	/** Whether online booking for {@code bookingDate} is currently open (strictly before the close). */
	public boolean isBookable(LocalTime salesClose, LocalDate bookingDate) {
		return isBookable(salesClose, bookingDate, clock.instant());
	}

	/**
	 * The same fence against a caller-supplied reading, so a fence and a deadline computed from one
	 * instant cannot disagree about which side of the close it falls on.
	 */
	public boolean isBookable(LocalTime salesClose, LocalDate bookingDate, java.time.Instant now) {
		return now.isBefore(salesCloseAt(salesClose, bookingDate));
	}

	/**
	 * The instant online sales for {@code bookingDate} end: the venue's sales close on the day
	 * itself, {@code Europe/Tirane} (invariant #4).
	 */
	public java.time.Instant salesCloseAt(LocalTime salesClose, LocalDate bookingDate) {
		return bookingDate.atTime(salesClose).atZone(TIRANE).toInstant();
	}

	/**
	 * Which cancellation window {@code bookingDate} is in right now (invariant #10). Two boundaries:
	 * {@link #freeCancellationEndsAt}, then the start of the service day, past which cancellation is
	 * refused outright.
	 */
	public CancellationWindow cancellationWindow(LocalTime cutoff, LocalDate bookingDate) {
		// One reading of the clock, so both boundaries classify the same instant.
		return cancellationWindow(cutoff, bookingDate, clock.instant());
	}

	/** The same classification against a caller-supplied reading (the {@link #isBookable} precedent). */
	public CancellationWindow cancellationWindow(LocalTime cutoff, LocalDate bookingDate,
			java.time.Instant at) {
		if (at.isBefore(freeCancellationEndsAt(cutoff, bookingDate))) {
			return CancellationWindow.FREE;
		}
		return at.isBefore(serviceDayOpensAt(bookingDate))
				? CancellationWindow.LATE
				: CancellationWindow.CLOSED;
	}

	/**
	 * The instant the stay becomes consumable — midnight in {@code Europe/Tirane} (invariant #6).
	 * The cancellation window's outer fence (invariant #10), and the anchor
	 * {@link #serviceDayEndsAt} delegates to.
	 */
	public java.time.Instant serviceDayOpensAt(LocalDate bookingDate) {
		return bookingDate.atStartOfDay(TIRANE).toInstant();
	}

	/** The instant service day {@code bookingDate} ends: the next day's Tirane midnight. */
	public java.time.Instant serviceDayEndsAt(LocalDate bookingDate) {
		return serviceDayOpensAt(bookingDate.plusDays(1));
	}

	/**
	 * The most recent service day already ended at {@code now}, for a sweep that selects rows by
	 * {@code booking_date} rather than asking per booking.
	 *
	 * <p><strong>Static, and that is the contract:</strong> it is a pure projection of the caller's
	 * own instant onto the Tirane civil day, so a sweep bounds every arm of one run against one
	 * reading. An instance method here would read as clock-backed like its neighbour and silently is
	 * not.
	 */
	public static LocalDate lastEndedServiceDay(java.time.Instant now) {
		return LocalDate.ofInstant(now, TIRANE).minusDays(1);
	}

	/**
	 * The instant free cancellation for {@code bookingDate} ends — the venue's evening-before
	 * {@code cutoff} wall-clock time in {@code Europe/Tirane} (ADR-0005; no sales role now).
	 */
	public java.time.Instant freeCancellationEndsAt(LocalTime cutoff, LocalDate bookingDate) {
		return bookingDate.minusDays(1).atTime(cutoff).atZone(TIRANE).toInstant();
	}
}
