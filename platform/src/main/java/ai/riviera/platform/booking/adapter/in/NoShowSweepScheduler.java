package ai.riviera.platform.booking.adapter.in;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.application.checkin.MarkNoShows;

/**
 * Periodically runs the no-show sweep. Not profile-gated, like {@code RequestSweepScheduler} and
 * unlike {@code AbandonedBookingScheduler}: that one is {@code @Profile("stripe")} because nothing
 * lingers in {@code AWAITING_PAYMENT} under the stub profile — a payment-specific reason. Bookings
 * reach {@code CONFIRMED} under both profiles, so this sweep always has work.
 *
 * <p>The cadence is deliberately slack, and that is a test-isolation decision as much as a
 * behavioural one. A booking becomes a no-show at a <em>day</em> boundary, so sweeping often buys
 * nothing; meanwhile {@code @EnableScheduling} is global here, and this sweep's blast radius is
 * every past-day {@code CONFIRMED} row in the database — several ITs seed exactly those. An hour of
 * initial delay puts the first run beyond any suite, so no test can race it (case history: #98/#122).
 * {@code fixedDelay} so runs never overlap on this instance; multi-instance safety needs no
 * distributed lock — the bulk guarded {@code UPDATE … WHERE status = 'CONFIRMED'} makes a second
 * runner a 0-row no-op.
 */
@Component
class NoShowSweepScheduler {

	private final MarkNoShows markNoShows;

	NoShowSweepScheduler(MarkNoShows markNoShows) {
		this.markNoShows = markNoShows;
	}

	@Scheduled(fixedDelayString = "${booking.no-show.sweep-interval:PT1H}",
			initialDelayString = "${booking.no-show.initial-delay:PT1H}")
	void sweep() {
		markNoShows.sweep();
	}
}
