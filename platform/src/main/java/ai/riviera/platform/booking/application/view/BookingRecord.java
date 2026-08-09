package ai.riviera.platform.booking.application.view;

import java.time.Instant;
import java.time.LocalDate;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * A booking row loaded by {@link Bookings#findByCode} — the persisted facts the view and cancel use
 * cases (U6) need: identity + lifecycle {@code status}, the {@code (venue, set, date)} ids, the gross
 * {@code amountMinor} paid (integer minor units + ISO currency, invariant #5), and the cancellation
 * audit ({@code cancelledAt} / {@code refundMinor} / {@code cancelReason}, all {@code null} until the
 * booking is cancelled). A flat read DTO, not the aggregate.
 *
 * <p>{@code cancelReason} stays {@code null} even for some cancelled bookings: only a cancellation
 * that took a refund decision stamps one, so an abandoned-payment release leaves it unset. Null
 * therefore reads as "cancelled without ever being charged" — except on rows cancelled before the
 * column existed (V14), which carry a refund with no reason.
 *
 * <p>{@code customerId} is the guest-contact link ({@code booking.customer_id}, NOT NULL since V5).
 * The view carries the id only — never the contact itself, which belongs to {@code customer} — so a
 * confirmed booking can ask {@code booking.spi.ConfirmationMailDelivery} whether its confirmation
 * mail was withheld (#390) without this module ever handling an address.
 */
public record BookingRecord(long id, String code, BookingStatus status, VenueId venueId, SetId setId,
		CustomerId customerId, LocalDate bookingDate, long amountMinor, String currency,
		Instant cancelledAt, Long refundMinor, Instant requestExpiresAt, RefundReason cancelReason) {
}
