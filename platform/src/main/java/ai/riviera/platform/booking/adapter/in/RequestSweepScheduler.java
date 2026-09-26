package ai.riviera.platform.booking.adapter.in;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.application.request.ExpireRequests;

/**
 * Periodically runs the request-expiry sweep. Unlike {@code AbandonedBookingScheduler} it is
 * <strong>not</strong> profile-gated (no Stripe is involved before accept) and takes no TTL (each
 * row carries its own {@code request_expires_at}). {@code fixedDelay}, so runs never overlap on one
 * instance; no distributed lock is needed — the guarded {@code UPDATE … WHERE status =
 * 'PENDING_REQUEST' …} lets at most one runner expire a request (posture: improvement-plan D3).
 * Cadence: {@code booking.request.sweep-interval}/{@code initial-delay}.
 */
@Component
class RequestSweepScheduler {

	private final ExpireRequests expireRequests;

	RequestSweepScheduler(ExpireRequests expireRequests) {
		this.expireRequests = expireRequests;
	}

	@Scheduled(fixedDelayString = "${booking.request.sweep-interval:PT5M}",
			initialDelayString = "${booking.request.initial-delay:PT1M}")
	void sweep() {
		expireRequests.sweep();
	}
}
