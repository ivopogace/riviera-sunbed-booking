package ai.riviera.platform.booking.adapter.in;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.application.checkin.MarkNoShows;

/**
 * Runs the no-show sweep ({@code RESPONSIBILITIES.md} §booking). Not profile-gated: bookings reach
 * {@code CONFIRMED} under both payment profiles, and {@code NO_SHOW} has no other writer, so it ships
 * enabled. {@code booking.no-show.enabled} is a test-isolation seam: {@code @EnableScheduling} is
 * global, so an IT seeding a past-day {@code CONFIRMED} row must set it {@code false}; the 30-minute
 * initial delay only backstops a forgotten opt-out. {@code fixedDelay} never overlaps runs here, and
 * other instances need no lock: the guarded {@code UPDATE} makes a contended row's loser match nothing.
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
