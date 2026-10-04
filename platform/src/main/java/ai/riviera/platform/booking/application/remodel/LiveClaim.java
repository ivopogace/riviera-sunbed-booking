package ai.riviera.platform.booking.application.remodel;

import java.time.LocalDate;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * A booking a guest may still turn up on, read for the remodel classification off a disturbed set or a released stay:
 * its id, set, span (first and last service day), status (live by construction), snapshotted
 * amount, the days of it already refunded (invariant #5, ADR-0026, ADR-0027), the stay it is a
 * stretch of ({@code null} for a lone booking) and whether every service day it has is refunded (a confirmed one
 * then has nothing left, #1300). Module-internal; the published shape is {@code booking.vocabulary.RemodelClaim}.
 */
public record LiveClaim(long bookingId, SetId setId, LocalDate bookingDate, LocalDate lastDate,
		BookingStatus status, long amountMinor, String currency, long dayRefundedMinor, StayId stayId,
		boolean everyDayRefunded) {

	public LiveClaim(long bookingId, SetId setId, LocalDate bookingDate, LocalDate lastDate,
			BookingStatus status, long amountMinor, String currency) {
		this(bookingId, setId, bookingDate, lastDate, status, amountMinor, currency, 0L, null, false);
	}

	public LiveClaim(long bookingId, SetId setId, LocalDate bookingDate, LocalDate lastDate,
			BookingStatus status, long amountMinor, String currency, long dayRefundedMinor) {
		this(bookingId, setId, bookingDate, lastDate, status, amountMinor, currency, dayRefundedMinor, null, false);
	}

	/** What a refund of the whole claim still returns: the amount less the days refunded (#10). */
	public long remainingMinor() {
		return amountMinor - dayRefundedMinor;
	}
}
