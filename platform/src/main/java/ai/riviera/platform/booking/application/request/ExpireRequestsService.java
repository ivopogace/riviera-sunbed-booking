package ai.riviera.platform.booking.application.request;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.application.Bookings;

/**
 * Expires overdue pending requests and frees their sets (issue #98), implementing
 * {@link ExpireRequests}. Mirrors the abandoned-payment sweep's shape: read the candidate ids,
 * then expire each via {@link RequestReleaseService#expire} — its own transaction per row, with
 * a per-row try/catch so one bad row (e.g. a transient failure releasing its claim) cannot roll
 * back or starve the rest of the batch; the failed row is retried on the next run, safely,
 * because the guarded transition is idempotent. Lockless by design, matching the abandoned
 * sweep's documented single-instance posture (improvement-plan D1/D3;
 * docs/deploy/production-hardening.md).
 */
@Service
class ExpireRequestsService implements ExpireRequests {

	private static final Logger log = LoggerFactory.getLogger(ExpireRequestsService.class);

	private final Bookings bookings;
	private final RequestReleaseService requestRelease;
	private final Clock clock;

	ExpireRequestsService(Bookings bookings, RequestReleaseService requestRelease, Clock clock) {
		this.bookings = bookings;
		this.requestRelease = requestRelease;
		this.clock = clock;
	}

	@Override
	public int sweep() {
		Instant now = clock.instant();
		List<BookingId> overdue = bookings.findOverduePendingRequests(now);
		int expired = 0;
		for (BookingId id : overdue) {
			try {
				if (requestRelease.expire(id, now)) {
					expired++;
				}
			}
			catch (RuntimeException ex) {
				// Isolate each request: one failing row must not abort the batch — logged and
				// retried next run (the guarded transition makes the retry safe).
				log.warn("request-expiry sweep failed for booking {} — continuing, will retry next run",
						id.value(), ex);
			}
		}
		if (expired > 0) {
			log.info("request-expiry sweep expired {} pending request(s)", expired);
		}
		return expired;
	}
}
