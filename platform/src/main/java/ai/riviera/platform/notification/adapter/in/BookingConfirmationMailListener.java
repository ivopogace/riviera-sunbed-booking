package ai.riviera.platform.notification.adapter.in;

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
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;

/**
 * Mails the tourist their booking code when a booking is confirmed (#371, epic #367 story 1) — the
 * design spec's promised "booking code plus an email", which until #371 lived only in a browser tab.
 *
 * <p>The {@code notification} module's driving adapter for the registry vehicle (#382; until then
 * this listener sat at the platform edge — the move is why the module's {@code allowedDependencies}
 * read like a fan-in). It assembles one message from three owners' published ports: {@code booking}
 * supplies the arrival code + contact id, {@code venue} the venue name + set label, {@code customer}
 * the address. Nothing is re-derived that the event already carries: the date, amount and currency
 * are immutable facts of the confirmation and ride the payload. Delivery goes through
 * {@link TransactionalMailService} — the chokepoint — never the transport directly.
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
	private final TransactionalMailService mails;

	BookingConfirmationMailListener(BookingNotificationFacts bookings, SetBookingFacts sets,
			CustomerLookup customers, TransactionalMailService mails) {
		this.bookings = bookings;
		this.sets = sets;
		this.customers = customers;
		this.mails = mails;
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

		mails.sendBookingConfirmation(contact.get().email(), new BookingConfirmationMail(
				booking.get().code(), set.get().venueName(), event.bookingDate(),
				set.get().rowLabel(), set.get().positionNo(), event.amountMinor(), event.currency()));
	}
}
