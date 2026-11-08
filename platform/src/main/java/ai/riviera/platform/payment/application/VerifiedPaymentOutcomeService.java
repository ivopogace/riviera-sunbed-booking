package ai.riviera.platform.payment.application;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.payment.domain.PaymentStatus;
import ai.riviera.platform.payment.events.PaymentCanceled;
import ai.riviera.platform.payment.events.PaymentConfirmed;
import ai.riviera.platform.payment.vocabulary.BookingRef;

/**
 * Implements {@link VerifiedPaymentOutcomes}: the guarded {@code markStatus} and its events in one transaction, so a
 * crash leaves both or neither. A terminal record publishes nothing: a late {@code canceled} must not release a paid
 * booking's claim (invariant #2), nor a late {@code succeeded} confirm a refunded collection.
 */
@Service
class VerifiedPaymentOutcomeService implements VerifiedPaymentOutcomes {

	private static final Logger log = LoggerFactory.getLogger(VerifiedPaymentOutcomeService.class);

	private final Payments payments;
	private final ApplicationEventPublisher publisher;

	VerifiedPaymentOutcomeService(Payments payments, ApplicationEventPublisher publisher) {
		this.payments = payments;
		this.publisher = publisher;
	}

	@Override
	@Transactional
	public boolean succeeded(String reference) {
		if (!applied(reference, PaymentStatus.SUCCEEDED)) {
			return false;
		}
		for (BookingRef ref : bookingRefs(reference)) {
			publisher.publishEvent(new PaymentConfirmed(ref, reference));
		}
		return true;
	}

	@Override
	@Transactional
	public boolean canceled(String reference) {
		if (!applied(reference, PaymentStatus.CANCELED)) {
			return false;
		}
		for (BookingRef ref : bookingRefs(reference)) {
			publisher.publishEvent(new PaymentCanceled(ref));
		}
		return true;
	}

	@Override
	@Transactional
	public boolean failed(String reference) {
		return applied(reference, PaymentStatus.FAILED);
	}

	private boolean applied(String reference, PaymentStatus status) {
		boolean applied = payments.markStatus(reference, status);
		if (!applied) {
			log.warn("no open payment record for PaymentIntent {} — {} not applied", reference, status);
		}
		return applied;
	}

	private List<BookingRef> bookingRefs(String reference) {
		List<BookingRef> refs = payments.findBookingRefsByIntent(reference);
		if (refs.isEmpty()) {
			log.warn("no booking for PaymentIntent {} — ignoring it", reference);
		}
		return refs;
	}
}
