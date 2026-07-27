package ai.riviera.platform;

import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.booking.vocabulary.BookingNotificationInfo;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;

/**
 * Mails the tourist their booking code when a booking is confirmed (#371, epic #367 story 1) — the
 * design spec's promised "booking code plus an email", which until now lived only in a browser tab.
 *
 * <p>It lives at the <strong>platform edge</strong>, not in a module: mail composition is an edge
 * concern and no bounded context may depend on {@link Mailer} (RV-BE-11, epic #367's locked seam
 * decision). The root package is not a Modulith module, so this listener may read several modules'
 * published ports — which is exactly what it does, assembling one message from three owners:
 * {@code booking} supplies the arrival code + contact id, {@code venue} the venue name + set label,
 * {@code customer} the address. Nothing is re-derived that the event already carries: the date,
 * amount and currency are immutable facts of the confirmation and ride the payload.
 *
 * <p><strong>Asynchronous</strong> {@code @ApplicationModuleListener} (= {@code @Async} +
 * {@code @Transactional} + {@code @TransactionalEventListener(AFTER_COMMIT)}), so a mail failure can
 * never roll back a booking. The Event Publication Registry is the <em>whole</em> idempotency story:
 * it marks a publication complete only after this method returns, and
 * {@code republish-outstanding-events-on-restart} resubmits only publications with a NULL
 * {@code completion_date}. There is deliberately no dedupe table — one written inside this
 * transaction would share the identical crash window (send succeeds, process dies, row rolls back),
 * so it would buy nothing. The accepted guarantee is therefore <strong>at-least-once</strong>; the
 * operational lever for the opposite failure ("completed, but the inbox is empty") is the admin
 * resend in #380, not a restart.
 *
 * <p>A missing booking, set or contact is logged and skipped rather than thrown: none of them can
 * appear later, so retrying would only park a permanently-failing publication in the outbox. A
 * transport failure, by contrast, propagates on purpose — that publication stays outstanding and is
 * retried. Nothing here logs the arrival code (invariant #7).
 */
@Component
class BookingConfirmationMailListener {

	private static final Logger log = LoggerFactory.getLogger(BookingConfirmationMailListener.class);

	private final BookingNotificationFacts bookings;
	private final SetBookingFacts sets;
	private final CustomerLookup customers;
	private final Mailer mailer;

	BookingConfirmationMailListener(BookingNotificationFacts bookings, SetBookingFacts sets,
			CustomerLookup customers, Mailer mailer) {
		this.bookings = bookings;
		this.sets = sets;
		this.customers = customers;
		this.mailer = mailer;
	}

	@ApplicationModuleListener
	void on(BookingConfirmed event) {
		long bookingId = event.bookingId().value();

		Optional<BookingNotificationInfo> booking = bookings.notificationInfo(event.bookingId());
		if (booking.isEmpty()) {
			log.warn("no booking {} — skipping confirmation mail", bookingId);
			return;
		}
		Optional<SetBookingInfo> set = sets.setBookingInfo(event.setId());
		if (set.isEmpty()) {
			log.warn("no set {} — skipping confirmation mail for booking {}",
					event.setId().value(), bookingId);
			return;
		}
		Optional<GuestContact> contact = customers.findById(booking.get().customerId());
		if (contact.isEmpty()) {
			log.warn("no contact for booking {} — skipping confirmation mail", bookingId);
			return;
		}

		mailer.sendBookingConfirmation(contact.get().email(), new BookingConfirmationMail(
				booking.get().code(), set.get().venueName(), event.bookingDate(),
				set.get().rowLabel(), set.get().positionNo(), event.amountMinor(), event.currency()));
	}
}
