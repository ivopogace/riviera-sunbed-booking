package ai.riviera.platform.booking.events;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.vocabulary.StayId;

/**
 * Published when a booking becomes {@code CONFIRMED}, only from {@code ConfirmBooking}, the one seam
 * both confirm paths share; {@code payout} accrues on it, {@code notification} mails it. Id-based
 * (invariant #11): days in {@code Europe/Tirane} (#6), {@code amountMinor} the stay's gross in minor
 * units + ISO currency (#5). Never add the commission rate ({@code payout} re-reads it). The birth
 * window and bps are frozen (a null window renders no disclosure); a null {@code stayId} is a lone
 * booking or an older payload. Rationale: {@code RESPONSIBILITIES.md} §booking.
 */
public record BookingConfirmed(BookingId bookingId, VenueId venueId, SetId setId,
		LocalDate bookingDate, long amountMinor, String currency,
		CancellationWindow cancellationWindowAtBirth, int lateCancelRefundBps, LocalDate lastDate,
		StayId stayId) {

	/** A lone booking: it names no stay. */
	public BookingConfirmed(BookingId bookingId, VenueId venueId, SetId setId, LocalDate bookingDate,
			long amountMinor, String currency, CancellationWindow cancellationWindowAtBirth,
			int lateCancelRefundBps, LocalDate lastDate) {
		this(bookingId, venueId, setId, bookingDate, amountMinor, currency, cancellationWindowAtBirth,
				lateCancelRefundBps, lastDate, null);
	}

	/** A lone one-day booking: its last day is its first. */
	public BookingConfirmed(BookingId bookingId, VenueId venueId, SetId setId, LocalDate bookingDate,
			long amountMinor, String currency, CancellationWindow cancellationWindowAtBirth,
			int lateCancelRefundBps) {
		this(bookingId, venueId, setId, bookingDate, amountMinor, currency, cancellationWindowAtBirth,
				lateCancelRefundBps, bookingDate);
	}

	/** The last service day; a payload serialized before {@code lastDate} existed is a one-day booking. */
	public LocalDate lastDay() {
		return lastDate != null ? lastDate : bookingDate;
	}
}
