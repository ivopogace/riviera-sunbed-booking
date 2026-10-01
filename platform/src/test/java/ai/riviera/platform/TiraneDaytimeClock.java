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
 * Publishes the context's {@code @Primary} {@link MovableClock}, frozen at context start inside
 * 00:05–23:55 {@code Europe/Tirane}, so a {@code 00:01} close has passed and a {@code 23:59} one has not
 * (invariant #4). Never behind the wall (the challenge library checks expiry on the system clock) and
 * at most ten minutes ahead, so a cached context's sweeps never reach another test's rows. Read
 * "today" from {@link #today}, never the wall.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TiraneDaytimeClock {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private static final LocalTime EARLIEST = LocalTime.of(0, 5);
	private static final LocalTime LATEST = LocalTime.of(23, 55);

	@Bean
	@Primary
	MovableClock tiraneDaytimeClock() {
		return new MovableClock(clearOfMidnight(ZonedDateTime.now(TIRANE)));
	}

	/** The Tirane civil date the clock reads. */
	public static LocalDate today(MovableClock clock) {
		return LocalDate.ofInstant(clock.instant(), TIRANE);
	}

	private static Instant clearOfMidnight(ZonedDateTime wall) {
		LocalTime time = wall.toLocalTime();
		if (time.isBefore(EARLIEST)) {
			return wall.toLocalDate().atTime(EARLIEST).atZone(TIRANE).toInstant();
		}
		if (time.isAfter(LATEST)) {
			return wall.toLocalDate().plusDays(1).atTime(EARLIEST).atZone(TIRANE).toInstant();
		}
		return wall.toInstant();
	}
}
