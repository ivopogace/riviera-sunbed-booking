package ai.riviera.platform;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Provides the application's {@link Clock} as a bean so time-dependent logic (e.g. the
 * booking cutoff, invariants #4/#6) injects it rather than calling {@code Instant.now()} /
 * {@code LocalDateTime.now()} directly. The clock is UTC — code that needs a civil day
 * reasons in {@code Europe/Tirane} explicitly. Tests override this bean with a fixed clock
 * to make cutoff arithmetic deterministic.
 */
@Configuration
class TimeConfig {

	@Bean
	Clock clock() {
		return Clock.systemUTC();
	}
}
