package ai.riviera.platform.booking.application.cancel;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.domain.CancellationWindow;

/**
 * Names the service day's three boundaries (invariant #4), all reasoned in {@code Europe/Tirane}
 * (invariant #6) from an injected UTC {@link Clock} — never the JVM default zone, never
 * {@code LocalDateTime.now()}: {@link #salesCloseAt}, when online sales for a date close, on the
 * day itself (venue-controlled); {@link #freeCancellationEndsAt}, the evening-before
 * boundary that now serves cancellation only; and {@link #serviceDayOpensAt}, midnight opening the
 * stay, past which cancellation is refused outright (invariant #10) and a payment may no longer be
 * taken. Rationale: {@code RESPONSIBILITIES.md} §{@code booking}.
 *
 * <p>Module-internal but {@code public} so the {@code reserve} slice ({@code ReserveSetService})
 * can consult the same boundaries the {@code cancel} slice enforces. Not exported:
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
		return clock.instant().isBefore(salesCloseAt(salesClose, bookingDate));
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
	CancellationWindow cancellationWindow(LocalTime cutoff, LocalDate bookingDate) {
		// One reading of the clock, so both boundaries classify the same instant.
		java.time.Instant now = clock.instant();
		if (now.isBefore(freeCancellationEndsAt(cutoff, bookingDate))) {
			return CancellationWindow.FREE;
		}
		return now.isBefore(serviceDayOpensAt(bookingDate))
				? CancellationWindow.LATE
				: CancellationWindow.CLOSED;
	}

	/**
	 * The instant the stay becomes consumable — midnight in {@code Europe/Tirane} (invariant #6).
	 * Public for the guest's pay deadline: past this instant a payment would buy a day already
	 * underway.
	 */
	public java.time.Instant serviceDayOpensAt(LocalDate bookingDate) {
		return bookingDate.atStartOfDay(TIRANE).toInstant();
	}

	/** Whether {@code bookingDate}'s stay is already underway — the per-booking pay-window bound. */
	public boolean serviceDayHasOpened(LocalDate bookingDate) {
		return !clock.instant().isBefore(serviceDayOpensAt(bookingDate));
	}

	/**
	 * Whether the booking was created before its own service day opened (the #576 fences apply
	 * only to these; a same-day-born booking is governed by its TTL until #792).
	 */
	public boolean bornBeforeServiceDay(java.time.Instant createdAt, LocalDate bookingDate) {
		return createdAt.isBefore(serviceDayOpensAt(bookingDate));
	}

	/**
	 * The latest booking date whose service day has already begun at {@code now} — the set-based form
	 * of {@link #serviceDayHasOpened}, for a sweep that selects rows by {@code booking_date} rather
	 * than asking per booking.
	 *
	 * <p><strong>Static, and that is the contract:</strong> it is a pure projection of the caller's
	 * own instant onto the Tirane civil day, so a sweep bounds every arm of one run against one
	 * reading. An instance method here would read as clock-backed like its neighbour and silently is
	 * not.
	 */
	public static LocalDate lastOpenedServiceDay(java.time.Instant now) {
		return LocalDate.ofInstant(now, TIRANE);
	}

	/**
	 * The instant free cancellation for {@code bookingDate} ends — the venue's evening-before
	 * {@code cutoff} wall-clock time in {@code Europe/Tirane} (ADR-0005; no sales role now).
	 */
	public java.time.Instant freeCancellationEndsAt(LocalTime cutoff, LocalDate bookingDate) {
		return bookingDate.minusDays(1).atTime(cutoff).atZone(TIRANE).toInstant();
	}
}
