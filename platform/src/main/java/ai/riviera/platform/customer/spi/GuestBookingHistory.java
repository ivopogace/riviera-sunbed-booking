package ai.riviera.platform.customer.spi;

import java.time.LocalDate;
import java.util.Collection;
import java.util.Set;

import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * The retention-basis fact the {@code customer} module lacks: does a guest's booking history reach into
 * the retention window? The retention sweep scrubs a contact only once it does not.
 *
 * <p>Driven port implemented by {@code booking} (invariant #11), inverted because a
 * {@code customer → booking} call would cycle ({@code ModularityTests}). It answers only the fact: the
 * window and the scrub stay in {@code customer}; {@code booking} holds no retention policy.
 */
public interface GuestBookingHistory {

	/**
	 * The subset of {@code guests} with a booking of any status (terminal too: still a financial record)
	 * whose last day, {@code booking.last_date}, falls on or after {@code cutoff}, inclusive (Tirane
	 * dates, #6). An empty {@code guests} yields an empty set without a query.
	 */
	Set<CustomerId> withBookingOnOrAfter(Collection<CustomerId> guests, LocalDate cutoff);
}
