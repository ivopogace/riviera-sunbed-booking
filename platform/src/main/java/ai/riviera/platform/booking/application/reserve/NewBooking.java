package ai.riviera.platform.booking.application.reserve;

import java.time.LocalDate;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The data needed to persist a brand-new booking row in {@code AWAITING_PAYMENT}. Cross-
 * aggregate references are by typed id (invariant #11 / Spring Data JDBC rule). The
 * {@code code} is the unguessable credential (invariant #7); the amount is integer minor
 * units + currency (invariant #5). A driven-port DTO — not exposed beyond {@code booking}.
 *
 * <p>{@code accountId} is <strong>nullable</strong> (S3, #114): the {@link CustomerAccountId} of the
 * signed-in tourist, or {@code null} for a guest booking. Distinct from {@code customerId} (the
 * guest-contact row, V5) — the account link is additive and keyed by its own id (design D-6).
 */
public record NewBooking(String code, VenueId venueId, SetId setId, CustomerId customerId,
		CustomerAccountId accountId, LocalDate bookingDate, long amountMinor, String amountCurrency) {
}
