package ai.riviera.platform.booking.adapter.in;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.application.request.ExpireRequests;

/**
 * Periodically runs the request-expiry sweep (issue #98) — the sibling of
 * {@code AbandonedBookingScheduler}, with two deliberate differences: it is <strong>not</strong>
 * profile-gated (a pending request lingers regardless of the payment profile — no Stripe is
 * involved before accept), and it needs no TTL parameter (each row carries its own
 * {@code request_expires_at} deadline). {@code fixedDelay} so runs never overlap on this
 * instance; multi-instance safety needs no distributed lock — the guarded
 * {@code UPDATE … WHERE status = 'PENDING_REQUEST' …} lets at most one runner expire a given
 * request. Lockless-on-one-instance is the documented deployment posture (improvement-plan D3).
 * Cadence configurable via {@code booking.request.sweep-interval}/{@code initial-delay}.
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
