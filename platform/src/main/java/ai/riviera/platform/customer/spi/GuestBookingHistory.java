package ai.riviera.platform.customer.spi;

import java.time.LocalDate;
import java.util.Collection;
import java.util.Set;

import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * The one fact the {@code customer} module lacks when deciding whether a guest contact may still be held:
 * whether that guest's booking history reaches into the retention window. Used by the automated retention
 * sweep (#101 Slice 2) as the <em>retention basis</em> gate — a contact is scrubbed only once no booking
 * of theirs falls on or after the cutoff.
 *
 * <p><strong>Driven (SPI) port, dependency-inverted (invariant #11).</strong> Declared here, in the
 * <em>consumer</em>'s {@code spi} named interface — the surface customer needs another module to
 * implement — and <em>implemented by the {@code booking} module</em> (the sole owner/reader of the
 * {@code booking} table). The natural call direction ({@code customer} asking {@code booking}) would close
 * a Modulith cycle, since {@code booking} already depends on {@code customer::api} +
 * {@code customer::vocabulary}; inverting it keeps the graph acyclic — {@code booking → customer} is the
 * existing, allowed direction, and {@code customer} never imports {@code booking}. It mirrors
 * {@code venue.spi.BookingPresence} exactly. {@code ModularityTests} is the gate. It lives in {@code spi},
 * not {@code api}, because it is an "implement-me" port, not a "call-me" one (see the {@code riviera-modulith}
 * api-vs-spi rule).
 *
 * <p>The port answers only the <em>fact</em>: the retention window that produced the cutoff, and the scrub
 * it authorizes, both stay in {@code customer}. {@code booking} holds no retention policy.
 */
public interface GuestBookingHistory {

	/**
	 * Of these guests, which still have at least one booking dated on or after {@code cutoff}?
	 *
	 * <p>Any status counts, including terminal ones (cancelled / no-show / expired) — each still produced a
	 * financial and audit record, so it is still a retention basis. This mirrors
	 * {@code venue.spi.BookingPresence}'s "any booking row, any status" precedent. The date compared is
	 * {@code booking.booking_date} (the day of service), a {@code LocalDate} in {@code Europe/Tirane}
	 * (invariant #6).
	 *
	 * @param guests the candidate guests to probe; an empty collection yields an empty result without a query
	 * @param cutoff the retention cutoff, computed by {@code customer} from its configured window; a booking
	 *               exactly <em>on</em> this date still counts as a live basis (inclusive-retain)
	 * @return the subset of {@code guests} that still have a booking on or after {@code cutoff}
	 */
	Set<CustomerId> withBookingOnOrAfter(Collection<CustomerId> guests, LocalDate cutoff);
}
