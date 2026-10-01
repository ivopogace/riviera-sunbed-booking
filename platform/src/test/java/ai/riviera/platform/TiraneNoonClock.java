package ai.riviera.platform;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * Publishes the context's {@code @Primary} {@link MovableClock} at the next noon {@code Europe/Tirane},
 * so a sales-close verdict for "today" (invariant #4) never depends on the hour a run reaches the test.
 * Never behind the wall: the challenge library checks expiry on the system clock. Read "today" from
 * {@link #today}, never the wall.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TiraneNoonClock {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Bean
	@Primary
	MovableClock tiraneNoonClock() {
		return new MovableClock(nextNoon(ZonedDateTime.now(TIRANE)));
	}

	/** The Tirane civil date the clock reads. */
	public static LocalDate today(MovableClock clock) {
		return LocalDate.ofInstant(clock.instant(), TIRANE);
	}

	private static Instant nextNoon(ZonedDateTime wall) {
		ZonedDateTime noon = wall.toLocalDate().atTime(LocalTime.NOON).atZone(TIRANE);
		return (wall.isBefore(noon) ? noon : noon.plusDays(1)).toInstant();
	}
}
