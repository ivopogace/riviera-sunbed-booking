package ai.riviera.platform.booking.vocabulary;

import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * The two facts a booking mail needs beyond the event payload and {@code venue.api.SetBookingFacts}.
 * {@code code} is the arrival credential (invariant #7): never put it on an event, whose payload the
 * registry persists as text (ADR-0011), so the mail reads it here at send time. {@code customerId} is
 * {@code booking.customer_id}, set for signed-in bookings too ({@code account_id} is a separate
 * link); the consumer resolves the address through {@code customer.api.CustomerLookup}, so this
 * module never holds contact PII.
 */
public record BookingNotificationInfo(String code, CustomerId customerId) {
}
