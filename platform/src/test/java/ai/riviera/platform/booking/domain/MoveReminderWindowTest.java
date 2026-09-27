package ai.riviera.platform.booking.domain;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The evening-before rule: from the send hour until midnight the move day due is tomorrow; earlier in
 * the day nothing is due. Read in {@code Europe/Tirane}, so a UTC reading that is still the evening
 * before in Albania names the same tomorrow (invariant #6).
 */
class MoveReminderWindowTest {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private static final LocalTime SEND_FROM = LocalTime.of(18, 0);
	private static final LocalDate MOVE_DAY = LocalDate.of(2026, 8, 12);

	private static ZonedDateTime tirane(int day, int hour, int minute) {
		return ZonedDateTime.of(2026, 8, day, hour, minute, 0, 0, TIRANE);
	}

	@Test
	void nothingIsDueBeforeTheSendHour() {
		assertEquals(Optional.empty(), MoveReminderWindow.dueMoveDay(tirane(11, 17, 59), SEND_FROM));
	}

	@Test
	void fromTheSendHourTomorrowIsDue() {
		assertEquals(Optional.of(MOVE_DAY), MoveReminderWindow.dueMoveDay(tirane(11, 18, 0), SEND_FROM));
		assertEquals(Optional.of(MOVE_DAY), MoveReminderWindow.dueMoveDay(tirane(11, 23, 59), SEND_FROM));
	}

	@Test
	void afterMidnightTheMoveDayIsTodayAndNoLongerDue() {
		assertEquals(Optional.empty(), MoveReminderWindow.dueMoveDay(tirane(12, 0, 5), SEND_FROM));
		assertEquals(Optional.empty(), MoveReminderWindow.dueMoveDay(tirane(12, 9, 0), SEND_FROM));
		assertEquals(Optional.of(MOVE_DAY.plusDays(1)), MoveReminderWindow.dueMoveDay(tirane(12, 18, 0), SEND_FROM),
				"the next evening names the next move day");
	}

	@Test
	void theReadingIsJudgedInTiraneNotUtc() {
		ZonedDateTime utcEvening = ZonedDateTime.of(2026, 8, 11, 16, 30, 0, 0, ZoneId.of("UTC"));
		assertEquals(Optional.of(MOVE_DAY),
				MoveReminderWindow.dueMoveDay(utcEvening.withZoneSameInstant(TIRANE), SEND_FROM),
				"16:30Z is 18:30 in Albania in August");
	}
}
