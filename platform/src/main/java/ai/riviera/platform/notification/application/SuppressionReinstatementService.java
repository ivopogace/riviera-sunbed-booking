package ai.riviera.platform.notification.application;

import java.time.Clock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * The reinstatement use case behind the {@link ReinstateSuppression} driving port, owning what must
 * not live in a driving adapter: the lift instant from the injected {@link Clock} (invariant #6)
 * and the audit record. No {@code @Transactional}: the adapter lifts in one statement. The audit
 * line carries two closed-set tokens (outcome, reason) only, never the address or the
 * {@code domain}: V34's CHECK bans only edge whitespace, so a junk domain can carry a newline, a
 * log-forging vector ({@code riviera-java-conventions} §10).
 */
@Service
class SuppressionReinstatementService implements ReinstateSuppression {

	private static final Logger log = LoggerFactory.getLogger(SuppressionReinstatementService.class);

	/** Reported where a reason would go for an address that was never on the list. */
	private static final String NO_REASON = "NONE";

	private final EmailSuppressions suppressions;
	private final Clock clock;

	SuppressionReinstatementService(EmailSuppressions suppressions, Clock clock) {
		this.suppressions = suppressions;
		this.clock = clock;
	}

	@Override
	public ReinstateOutcome reinstate(String email) {
		ReinstateOutcome outcome = suppressions.reinstate(email, clock.instant());
		log.info("email-suppression reinstatement by admin outcome={} reason={}", outcome.code(),
				reasonToken(outcome));
		return outcome;
	}

	private static String reasonToken(ReinstateOutcome outcome) {
		return switch (outcome) {
			case ReinstateOutcome.Reinstated lifted -> lifted.reason().name();
			case ReinstateOutcome.AlreadyReinstated repeat -> repeat.reason().name();
			case ReinstateOutcome.NotSuppressed ignored -> NO_REASON;
		};
	}
}
