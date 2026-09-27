package ai.riviera.platform.booking.adapter.in;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.application.checkin.RemindStayMoves;

/**
 * Runs the move-reminder sweep ({@code RESPONSIBILITIES.md} §booking). Not profile-gated: stays confirm
 * under both payment profiles. {@code booking.move-reminder.enabled} is a test-isolation seam, as the
 * no-show sweep's: an IT seeding a stay that moves tomorrow under a fixed clock must set it
 * {@code false}. {@code fixedDelay} never overlaps runs here, and other instances need no lock: the
 * guarded stamp makes a contended row's loser publish nothing.
 */
@Component
@ConditionalOnProperty(name = "booking.move-reminder.enabled", havingValue = "true", matchIfMissing = true)
class MoveReminderScheduler {

	private final RemindStayMoves remindStayMoves;
	private final MoveReminderProperties properties;

	MoveReminderScheduler(RemindStayMoves remindStayMoves, MoveReminderProperties properties) {
		this.remindStayMoves = remindStayMoves;
		this.properties = properties;
	}

	@Scheduled(fixedDelayString = "${booking.move-reminder.sweep-interval:PT15M}",
			initialDelayString = "${booking.move-reminder.initial-delay:PT30M}")
	void sweep() {
		remindStayMoves.sweep(properties.sendFrom());
	}
}
