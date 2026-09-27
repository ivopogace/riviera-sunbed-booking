package ai.riviera.platform.booking.adapter.in;

import java.time.LocalTime;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The move-reminder sweep's send hour, bound from {@code booking.move-reminder.send-from} as a
 * {@code Europe/Tirane} wall-clock time (invariant #6; e.g. {@code 18:00}). Defaulted in the compact
 * constructor: no Bean Validation is on the classpath.
 *
 * @param sendFrom the evening hour from which tomorrow's moves are announced; default {@link #DEFAULT_SEND_FROM}
 */
@ConfigurationProperties("booking.move-reminder")
public record MoveReminderProperties(LocalTime sendFrom) {

	/** The evening, as the free-cancellation cutoff's default reads it. */
	static final LocalTime DEFAULT_SEND_FROM = LocalTime.of(18, 0);

	public MoveReminderProperties {
		sendFrom = sendFrom == null ? DEFAULT_SEND_FROM : sendFrom;
	}
}
