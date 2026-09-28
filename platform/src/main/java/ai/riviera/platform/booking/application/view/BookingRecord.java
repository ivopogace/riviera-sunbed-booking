package ai.riviera.platform.booking.application.view;

import java.time.Instant;
import java.time.LocalDate;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.DeclineReason;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The booking row {@link Bookings#findByCode} loads for the view and cancel use cases; a flat
 * read DTO, money in integer minor units + ISO currency (invariant #5). {@code cancelledAt},
 * {@code refundMinor} and {@code cancelReason} are stamped together, only by a cancellation that
 * decided a refund: all null when it never charged; pre-V14 rows carry a refund with no reason. It
 * holds the {@code customerId}, never the contact. {@code acceptedAt} (null until accepted) feeds the
 * pay deadline (invariant #4); {@code movedAt} (null unless moved) feeds the free-exit deadline.
 */
public record BookingRecord(long id, String code, BookingStatus status, VenueId venueId, SetId setId,
		CustomerId customerId, LocalDate bookingDate, LocalDate lastDate, long amountMinor, String currency,
		Instant cancelledAt, Long refundMinor, Instant requestExpiresAt, RefundReason cancelReason,
		Instant createdAt, Instant acceptedAt, Instant movedAt, DeclineReason declineReason,
		long dayRefundedMinor) {

	/** A booking none of whose days was refunded on its own. */
	public BookingRecord(long id, String code, BookingStatus status, VenueId venueId, SetId setId,
			CustomerId customerId, LocalDate bookingDate, LocalDate lastDate, long amountMinor, String currency,
			Instant cancelledAt, Long refundMinor, Instant requestExpiresAt, RefundReason cancelReason,
			Instant createdAt, Instant acceptedAt, Instant movedAt, DeclineReason declineReason) {
		this(id, code, status, venueId, setId, customerId, bookingDate, lastDate, amountMinor, currency,
				cancelledAt, refundMinor, requestExpiresAt, cancelReason, createdAt, acceptedAt, movedAt, declineReason,
				0L);
	}

	/**
	 * What the guest still holds: the amount less the days already refunded for weather (issue #1210) —
	 * the base of every later refund decision (invariant #10).
	 */
	public long remainingMinor() {
		return amountMinor - dayRefundedMinor;
	}

	/** A booking that was never declined. */
	public BookingRecord(long id, String code, BookingStatus status, VenueId venueId, SetId setId,
			CustomerId customerId, LocalDate bookingDate, LocalDate lastDate, long amountMinor, String currency,
			Instant cancelledAt, Long refundMinor, Instant requestExpiresAt, RefundReason cancelReason,
			Instant createdAt, Instant acceptedAt, Instant movedAt) {
		this(id, code, status, venueId, setId, customerId, bookingDate, lastDate, amountMinor, currency,
				cancelledAt, refundMinor, requestExpiresAt, cancelReason, createdAt, acceptedAt, movedAt, null);
	}

	/** A one-day booking: its last day is its first. */
	public BookingRecord(long id, String code, BookingStatus status, VenueId venueId, SetId setId,
			CustomerId customerId, LocalDate bookingDate, long amountMinor, String currency,
			Instant cancelledAt, Long refundMinor, Instant requestExpiresAt, RefundReason cancelReason,
			Instant createdAt, Instant acceptedAt, Instant movedAt) {
		this(id, code, status, venueId, setId, customerId, bookingDate, bookingDate, amountMinor, currency,
				cancelledAt, refundMinor, requestExpiresAt, cancelReason, createdAt, acceptedAt, movedAt);
	}
}
