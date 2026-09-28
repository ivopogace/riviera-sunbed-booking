package ai.riviera.platform.booking.application.request;

import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.StayId;

/**
 * The guest withdraw use case: transition first, read only to explain a miss, as
 * {@code RespondToRequestService} does. The guarded {@code UPDATE} in {@link RequestTerminationService}
 * <em>is</em> the decision, so no concurrent decline or expiry sweep can slip into a
 * read-then-write window; a lost race matches 0 rows and classifies as {@code NOT_PENDING}. Not
 * {@code @Transactional}: the classifying read must not join the transaction the transition commits
 * in. Package-private behind the {@link WithdrawRequest} port (invariant #11).
 */
@Service
class WithdrawRequestService implements WithdrawRequest {

	private static final Logger log = LoggerFactory.getLogger(WithdrawRequestService.class);

	private final Bookings bookings;
	private final RequestTerminationService release;

	WithdrawRequestService(Bookings bookings, RequestTerminationService release) {
		this.bookings = bookings;
		this.release = release;
	}

	@Override
	public WithdrawOutcome withdraw(String code) {
		Optional<BookingId> lone = release.withdraw(code);
		if (lone.isPresent()) {
			log.info("request {} withdrawn by the guest", lone.get().value());
			return new WithdrawOutcome.Withdrawn();
		}
		Optional<StayId> stay = release.withdrawStay(code);
		if (stay.isPresent()) {
			log.info("stay request {} withdrawn by the guest", stay.get().value());
			return new WithdrawOutcome.Withdrawn();
		}
		return classifyMiss(code);
	}

	/** The transition matched no row — read the booking or stay to say why. Never logs the code. */
	private WithdrawOutcome classifyMiss(String code) {
		boolean known = bookings.findByCode(code).isPresent() || bookings.findStayByCode(code).isPresent();
		return known ? WithdrawOutcome.Rejected.NOT_PENDING : WithdrawOutcome.Rejected.NO_SUCH_BOOKING;
	}
}
