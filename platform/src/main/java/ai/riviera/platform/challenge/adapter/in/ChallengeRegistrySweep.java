package ai.riviera.platform.challenge.adapter.in;

import java.time.Clock;
import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import ai.riviera.platform.challenge.application.AltchaProperties;
import ai.riviera.platform.challenge.application.ChallengeRegistry;

/**
 * Periodically deletes used-challenge rows the registry no longer needs: those whose expiry lies
 * further in the past than {@code riviera.altcha.clock-skew}, since past that point no instance can
 * still accept the challenge and the row guards nothing. Shaped like the module sweeps —
 * {@code fixedDelay} so runs never overlap on this instance, an initial delay that keeps it off the
 * startup hot path and off test windows, cadence via {@code riviera.altcha.sweep-interval} /
 * {@code sweep-initial-delay}. Idempotent, so a second instance running it too is merely redundant.
 */
@Component
class ChallengeRegistrySweep {

	private static final Logger log = LoggerFactory.getLogger(ChallengeRegistrySweep.class);

	private final ChallengeRegistry registry;
	private final AltchaProperties props;
	private final Clock clock;

	ChallengeRegistrySweep(ChallengeRegistry registry, AltchaProperties props, Clock clock) {
		this.registry = registry;
		this.props = props;
		this.clock = clock;
	}

	@Scheduled(fixedDelayString = "${riviera.altcha.sweep-interval:PT5M}",
			initialDelayString = "${riviera.altcha.sweep-initial-delay:PT1M}")
	void sweep() {
		Instant cutoff = clock.instant().minus(props.clockSkew());
		int deleted = registry.deleteExpiredBefore(cutoff);
		if (deleted > 0) {
			log.debug("Challenge registry sweep removed {} expired row(s)", deleted);
		}
	}
}
