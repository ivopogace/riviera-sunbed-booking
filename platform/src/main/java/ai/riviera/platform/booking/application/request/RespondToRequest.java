package ai.riviera.platform.booking.application.request;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The venue's decision on a pending booking request (issue #98): accept — the booking moves to
 * {@code AWAITING_PAYMENT} and a payment request is issued to the guest (a fresh PaymentIntent,
 * payment-request-on-accept) — or decline — the request ends terminally {@code DECLINED} and the
 * soft-held {@code (set, date)} is released. Both are venue-scoped operator commands: the
 * implementation verifies the operator owns the venue and rejects a mismatch (invariant #13).
 */
public interface RespondToRequest {

	AcceptOutcome accept(OperatorId operator, VenueId venueId, BookingId bookingId);

	DeclineOutcome decline(OperatorId operator, VenueId venueId, BookingId bookingId);
}
