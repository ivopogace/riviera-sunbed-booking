package ai.riviera.platform.booking.application.request;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.booking.events.BookingPaymentDue;

/**
 * Publishes {@link BookingPaymentDue} durably. One method, and its entire reason for existing
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
 * <p><strong>The class is package-private and the method is public</strong> — {@link RequestReleaseService}'s
 * documented convention ("Methods public for the proxy; the class stays package-private"), and worth
 * following even though the advice currently applies either way. Spring's
 * {@code AnnotationTransactionAttributeSource} is public-methods-only by default, so a package-private
 * {@code @Transactional} rests on proxying behaviour that is not the documented contract — and the
 * failure mode if it ever stops holding is the worst kind: no transaction, so no commit for the
 * after-commit listener to follow and no {@code event_publication} row, which is a payment-due mail
 * that silently never sends. The visibility costs nothing; {@link PaymentDueAnnouncerIT} guards the
 * behaviour itself.
 *
 * <p>Deliberately <em>not</em> where the failure is swallowed: a commit failure
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
	public void announce(BookingPaymentDue paymentDue) {
		events.publishEvent(paymentDue);
	}
}
