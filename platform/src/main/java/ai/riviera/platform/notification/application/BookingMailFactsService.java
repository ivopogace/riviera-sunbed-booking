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
 * Resolves a booking mail's facts through three owners' ports: {@code booking} (code, customer
 * id), {@code venue} (venue name, set label), {@code customer} (address); in {@code application},
 * not beside the listeners (ADR-0007). The reads short-circuit in this order on purpose: the
 * outcome names the <em>first</em> missing fact, which the caller's counter tags to point at one
 * module, and the contact read needs the booking's customer id. No transaction: callers are
 * after-commit listeners, and one would pin a connection across their SMTP send.
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
