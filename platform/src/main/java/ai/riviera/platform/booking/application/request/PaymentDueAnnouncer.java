package ai.riviera.platform.booking.application.request;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.booking.events.BookingPaymentDue;

/**
 * Publishes {@link BookingPaymentDue} durably (#373). One method, and its entire reason for existing
 * is the annotation on it.
 *
 * <p><strong>Why a transaction wraps a publish that writes nothing of its own.</strong> The Event
 * Publication Registry persists a publication row when the event is published and completes it when
 * the listener returns; both need a transaction, and {@code @TransactionalEventListener} delivers
 * only after one commits. The accept's own transaction cannot be that transaction: it commits before
 * {@code CheckoutPort.pay} is called (deliberately — no row lock is held across the Stripe
 * round-trip), and two of the three outcomes that follow mean nothing is owed
 * ({@link BookingPaymentDue} enumerates them). So the fact is raised afterwards, on the branch that
 * earned it, and this seam is what gives it a commit to ride.
 *
 * <p><strong>The cost, stated plainly:</strong> a crash between the accept commit and this one loses
 * the mail — at-most-once, where the registry's own contract from here on is at-least-once. That
 * window already exists for the payment row itself, the booking stays reachable by code, and the
 * sweep still protects the set; buying it back would mean publishing inside the accept transaction,
 * which is the defect this class exists to avoid.
 *
 * <p>Package-private, like every other collaborator behind the {@link RespondToRequest} seam
 * (invariant #11). Deliberately <em>not</em> where the failure is swallowed: a commit failure
 * surfaces after this method returns, so the catch has to sit at the call site, where
 * {@code RespondToRequestService} can say why an accept must survive it.
 */
@Service
class PaymentDueAnnouncer {

	private final ApplicationEventPublisher events;

	PaymentDueAnnouncer(ApplicationEventPublisher events) {
		this.events = events;
	}

	@Transactional
	void announce(BookingPaymentDue paymentDue) {
		events.publishEvent(paymentDue);
	}
}
