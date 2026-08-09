package ai.riviera.platform.booking.adapter.in;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.application.checkin.MarkNoShows;

/**
 * Periodically runs the no-show sweep. Not profile-gated, like {@code RequestSweepScheduler} and
 * unlike {@code AbandonedBookingScheduler}: that one is {@code @Profile("stripe")} because nothing
 * lingers in {@code AWAITING_PAYMENT} under the stub profile — a payment-specific reason. Bookings
 * reach {@code CONFIRMED} under both profiles, so this sweep always has work.
 *
 * <p><strong>Ships enabled, and the switch is a test-isolation seam, not an ops safety switch</strong>
 * (the inverse of {@code GuestContactRetentionScheduler}, which ships disabled because erasure is
 * irreversible). {@code NO_SHOW} has no other writer, so a sweep that never runs means the state
 * never exists — hence {@code matchIfMissing = true}. The condition earns its place on the test
 * side: {@code @EnableScheduling} is global here and this sweep's blast radius is <em>every</em>
 * past-day {@code CONFIRMED} row in the shared test container, so an integration test that seeds
 * one must set {@code booking.no-show.enabled=false} and get a context where the bean does not
 * exist. A bean that does not exist cannot fire.
 *
 * <p>The 30-minute initial delay is <strong>defense in depth for the fixtures nobody enumerated</strong>,
 * not the mechanism: no suite reaches the first tick, so an IT that seeds a past-day
 * {@code CONFIRMED} row and forgets the opt-out is still safe. It costs nothing in production —
 * nothing is gated on how quickly {@code NO_SHOW} appears (even the weather refund now reaches a
 * swept row), and only the <em>first</em> run after a boot is delayed; the interval is 15 minutes.
 *
 * <p>{@code fixedDelay} so runs never overlap on this instance; multi-instance safety needs no
 * distributed lock — the guarded batched {@code UPDATE … WHERE status = 'CONFIRMED'} makes the
 * loser of a contended row wait and then match nothing, so each row transitions exactly once.
 */
@Component
@ConditionalOnProperty(name = "booking.no-show.enabled", havingValue = "true", matchIfMissing = true)
class NoShowSweepScheduler {

	private final MarkNoShows markNoShows;

	NoShowSweepScheduler(MarkNoShows markNoShows) {
		this.markNoShows = markNoShows;
	}

	@Scheduled(fixedDelayString = "${booking.no-show.sweep-interval:PT15M}",
			initialDelayString = "${booking.no-show.initial-delay:PT30M}")
	void sweep() {
		markNoShows.sweep();
	}
}
