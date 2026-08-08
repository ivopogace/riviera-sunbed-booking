package ai.riviera.platform.notification.application;

import java.util.Optional;

import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.BookingNotificationInfo;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * Assembles the facts a booking mail renders from three owners' published ports: {@code
 * booking} supplies the arrival code + contact id, {@code venue} the venue name + set label,
 * {@code customer} the address. One method, three reads, one typed outcome.
 *
 * <p><strong>Extracted from {@code BookingConfirmationMailListener} because a second listener was
 * about to need it verbatim.</strong> Applying the deletion test: removing this class does not
 * simplify anything — it puts the same three ordered reads, the same three-way missing-fact
 * vocabulary and the same injected-port block back into every listener that mails about a booking,
 * which is three today: confirmation, cancellation, payment-due. It is not a
 * published port and never should be: one implementation, no cross-module caller, so a
 * {@code notification.api} entry would be a hypothetical seam.
 *
 * <p><strong>It lives in {@code application}, not beside the listeners in {@code adapter/in}</strong>
 * — the ADR-0007 inside/outside asymmetry. Reading three ports and deciding what a missing row means
 * is the inside's work; a driving adapter's job is to be the thin thing on the other side of it.
 *
 * <p><strong>The reads short-circuit, and that ordering is load-bearing</strong>, not an
 * optimisation. Each early return names the <em>first</em> fact that failed, which is what the
 * caller tags its counter with and what points an operator at one module rather than three; running
 * all three and reporting the last would make the signal read as a {@code customer} fault whenever
 * {@code booking} was the one at fault. The contact read additionally <em>depends</em> on the
 * booking read, which supplies the customer id.
 *
 * <p><strong>No transaction, deliberately.</strong> Callers are after-commit registry listeners:
 * the producing transaction has already committed, so each read sees settled state and there
 * is nothing to keep consistent between them. Wrapping them would pin a Hikari connection across the
 * caller's subsequent SMTP round-trip — the second hazard
 * {@code BookingConfirmationMailListener}'s Javadoc declines to reintroduce.
 */
@Service
public class BookingMailFactsService {

	private final BookingNotificationFacts bookings;
	private final SetBookingFacts sets;
	private final CustomerLookup customers;

	BookingMailFactsService(BookingNotificationFacts bookings, SetBookingFacts sets,
			CustomerLookup customers) {
		this.bookings = bookings;
		this.sets = sets;
		this.customers = customers;
	}

	/**
	 * The facts for this booking on this set, or the first one that did not resolve. Never throws for
	 * a missing row: absence is an expected outcome the caller must account for, not an exceptional
	 * condition (riviera-java-conventions §6).
	 */
	public BookingMailFacts resolve(BookingId bookingId, SetId setId) {
		Optional<BookingNotificationInfo> booking = bookings.notificationInfo(bookingId);
		if (booking.isEmpty()) {
			return new BookingMailFacts.Missing(MissingBookingFact.NO_BOOKING);
		}
		Optional<SetBookingInfo> set = sets.setBookingInfo(setId);
		if (set.isEmpty()) {
			return new BookingMailFacts.Missing(MissingBookingFact.NO_SET);
		}
		Optional<GuestContact> contact = customers.findById(booking.get().customerId());
		if (contact.isEmpty()) {
			return new BookingMailFacts.Missing(MissingBookingFact.NO_CONTACT);
		}
		return new BookingMailFacts.Resolved(contact.get().email(), booking.get().code(),
				set.get().venueName(), set.get().rowLabel(), set.get().positionNo());
	}
}
