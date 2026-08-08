package ai.riviera.platform.booking.application.request;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.application.Bookings;

/**
 * The guest withdraw use case. Transition first, read only to explain a miss — the same
 * shape {@code RespondToRequestService} uses for accept/decline: the guarded {@code UPDATE} in
 * {@link RequestReleaseService} <em>is</em> the decision, so there is no read-then-write window a
 * concurrent decline or expiry sweep could slip through. A lost race matches 0 rows and classifies
 * as {@code NOT_PENDING}, which is exactly what happened.
 *
 * <p>Not {@code @Transactional} itself: the transition and its hold release commit together inside
 * {@link RequestReleaseService}, and the classifying read must not join that transaction — it runs
 * only once the write has already missed. Package-private behind the {@link WithdrawRequest} port
 * (invariant #11).
 */
@Service
class WithdrawRequestService implements WithdrawRequest {

	private static final Logger log = LoggerFactory.getLogger(WithdrawRequestService.class);

	private final Bookings bookings;
	private final RequestReleaseService release;

	WithdrawRequestService(Bookings bookings, RequestReleaseService release) {
		this.bookings = bookings;
		this.release = release;
	}

	@Override
	public WithdrawOutcome withdraw(String code) {
		return release.withdraw(code)
				.<WithdrawOutcome>map(bookingId -> {
					log.info("request {} withdrawn by the guest", bookingId.value());
					return new WithdrawOutcome.Withdrawn();
				})
				.orElseGet(() -> classifyMiss(code));
	}

	/** The transition matched no row — read the booking to say why. Never logs the code. */
	private WithdrawOutcome classifyMiss(String code) {
		return bookings.findByCode(code)
				.<WithdrawOutcome>map(booking -> WithdrawOutcome.Rejected.NOT_PENDING)
				.orElse(WithdrawOutcome.Rejected.NO_SUCH_BOOKING);
	}
}
