package ai.riviera.platform.booking.vocabulary;

import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * The notification-relevant facts about a single booking (#371, Email S3) — mirroring
 * {@code venue.vocabulary.SetBookingInfo}'s shape: the narrow set of truths one consumer role needs,
 * resolved by id. Exactly two fields, because everything else a booking-confirmation email renders
 * is already available without this port: {@code venueId}, {@code setId}, {@code bookingDate},
 * {@code amountMinor} and {@code currency} ride on the {@code BookingConfirmed} payload as immutable
 * facts of the confirmation, and the venue name + set label come from
 * {@code venue.api.SetBookingFacts}.
 *
 * <p>{@code code} is the booking's arrival credential (invariant #7). It is deliberately absent from
 * every published event payload, because the Event Publication Registry serializes payloads into
 * {@code event_publication} as text and retains them under {@code archive} completion mode — a code
 * on the event would be a bearer credential persisted in cleartext. Reading it through this port at
 * send time keeps the payload ids-only (invariant #11) while still letting the mail carry the code.
 *
 * <p>{@code customerId} is the guest-contact link ({@code booking.customer_id}, NOT NULL since V5 and
 * populated for signed-in bookings too — {@code booking.account_id} is a separate, additive link,
 * V26). The consumer resolves an address from it via {@code customer.api.CustomerLookup}; this module
 * holds the id and never the contact PII.
 */
public record BookingNotificationInfo(String code, CustomerId customerId) {
}
