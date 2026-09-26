package ai.riviera.platform.booking.application.view;

import java.time.Instant;
import java.time.LocalDate;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The booking row {@link Bookings#findByCode} loads for the view and cancel use cases (U6); a flat
 * read DTO, money in integer minor units + ISO currency (invariant #5). {@code cancelledAt},
 * {@code refundMinor} and {@code cancelReason} are stamped together, only by a cancellation that
 * decided a refund: all null when it never charged; pre-V14 rows carry a refund with no reason. It
 * holds the {@code customerId}, never the contact. {@code acceptedAt} (null until accepted) feeds the
 * pay deadline (invariant #4); {@code movedAt} (null unless moved) feeds the free-exit deadline.
 */
public record BookingRecord(long id, String code, BookingStatus status, VenueId venueId, SetId setId,
		CustomerId customerId, LocalDate bookingDate, LocalDate lastDate, long amountMinor, String currency,
		Instant cancelledAt, Long refundMinor, Instant requestExpiresAt, RefundReason cancelReason,
		Instant createdAt, Instant acceptedAt, Instant movedAt) {

	/** A one-day booking: its last day is its first. */
	public BookingRecord(long id, String code, BookingStatus status, VenueId venueId, SetId setId,
			CustomerId customerId, LocalDate bookingDate, long amountMinor, String currency,
			Instant cancelledAt, Long refundMinor, Instant requestExpiresAt, RefundReason cancelReason,
			Instant createdAt, Instant acceptedAt, Instant movedAt) {
		this(id, code, status, venueId, setId, customerId, bookingDate, bookingDate, amountMinor, currency,
				cancelledAt, refundMinor, requestExpiresAt, cancelReason, createdAt, acceptedAt, movedAt);
	}
}
