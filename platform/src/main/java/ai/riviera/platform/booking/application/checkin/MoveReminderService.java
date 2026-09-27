package ai.riviera.platform.booking.application.checkin;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import ai.riviera.platform.booking.application.Bookings;
import ai.riviera.platform.booking.domain.MoveReminderWindow;
import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * The move-reminder sweep: read the moves due tomorrow, then stamp and announce each through
 * {@link StayMoveAnnouncer} in its own transaction, so one bad row neither rolls back nor starves the
 * batch — it is retried next run, safely, because the stamp is guarded. The request-expiry sweep's shape.
 * Rationale: {@code RESPONSIBILITIES.md} §booking.
 */
@Service
class MoveReminderService implements RemindStayMoves {

	private static final Logger log = LoggerFactory.getLogger(MoveReminderService.class);
	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final Bookings bookings;
	private final StayMoveAnnouncer announcer;
	private final Clock clock;

	MoveReminderService(Bookings bookings, StayMoveAnnouncer announcer, Clock clock) {
		this.bookings = bookings;
		this.announcer = announcer;
		this.clock = clock;
	}

	@Override
	public int sweep(LocalTime sendFrom) {
		Instant now = clock.instant();
		Optional<java.time.LocalDate> moveDay = MoveReminderWindow.dueMoveDay(now.atZone(TIRANE), sendFrom);
		if (moveDay.isEmpty()) {
			return 0;
		}
		List<BookingId> due = bookings.findStayMovesDue(moveDay.get());
		int announced = 0;
		for (BookingId id : due) {
			try {
				if (announcer.announce(id, now)) {
					announced++;
				}
			}
			catch (RuntimeException ex) {
				log.warn("move-reminder sweep failed for booking {} — continuing, will retry next run", id.value(), ex);
			}
		}
		if (announced > 0) {
			log.info("move-reminder sweep announced {} move(s) for {}", announced, moveDay.get());
		}
		return announced;
	}
}
