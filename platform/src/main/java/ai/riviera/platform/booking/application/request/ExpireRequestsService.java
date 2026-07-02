package ai.riviera.platform.booking.application.request;

import java.time.Clock;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.availability.api.AvailabilityClaim;
import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.application.reserve.ClaimRef;

/**
 * Expires overdue pending requests and frees their sets (issue #98), implementing
 * {@link ExpireRequests}. One guarded bulk transition ({@code UPDATE … RETURNING}) plus the
 * releases, in a single transaction — a request is never left {@code EXPIRED} with its set still
 * claimed (invariant #2). Lockless by design, matching the abandoned-payment sweep's posture
 * (improvement-plan D1/D3): the guarded transition serializes concurrent runners; the deployment
 * runs a single instance (documented in docs/deploy/production-hardening.md).
 */
@Service
class ExpireRequestsService implements ExpireRequests {

	private static final Logger log = LoggerFactory.getLogger(ExpireRequestsService.class);

	private final Bookings bookings;
	private final AvailabilityClaim availability;
	private final Clock clock;

	ExpireRequestsService(Bookings bookings, AvailabilityClaim availability, Clock clock) {
		this.bookings = bookings;
		this.availability = availability;
		this.clock = clock;
	}

	@Override
	@Transactional
	public int sweep() {
		List<ClaimRef> expired = bookings.expirePendingRequests(clock.instant());
		for (ClaimRef claim : expired) {
			availability.release(claim.setId(), claim.bookingDate());
		}
		if (!expired.isEmpty()) {
			log.info("request-expiry sweep expired {} pending request(s)", expired.size());
		}
		return expired.size();
	}
}
