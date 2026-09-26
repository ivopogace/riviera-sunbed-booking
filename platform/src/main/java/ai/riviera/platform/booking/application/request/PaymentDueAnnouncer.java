package ai.riviera.platform.booking.application.request;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.booking.events.BookingPaymentDue;

/**
 * Publishes {@link BookingPaymentDue} in its own transaction, so the Event Publication Registry gets
 * its row and a commit — the accept's transaction committed before the Stripe call. A crash between
 * the two commits loses the mail (at-most-once, accepted). Keep {@code announce} public: Spring's
 * {@code @Transactional} proxy contract is public-methods-only, and without it the mail silently never
 * sends ({@code PaymentDueAnnouncerIT}). A failure surfaces after return, so the caller
 * ({@code RespondToRequestService}) is where it is caught.
 */
@Service
class PaymentDueAnnouncer {

	private final ApplicationEventPublisher events;

	PaymentDueAnnouncer(ApplicationEventPublisher events) {
		this.events = events;
	}

	@Transactional
	public void announce(BookingPaymentDue paymentDue) {
		events.publishEvent(paymentDue);
	}
}
