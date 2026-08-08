package ai.riviera.platform.notification.application;

import java.time.Clock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * The reinstatement use case, package-private behind the {@link ReinstateSuppression} driving
 * port (invariant #11) with constructor injection into {@code final} fields.
 *
 * <p>It exists for the two things that must not live in a driving adapter: the lift instant comes
 * from the injected {@link Clock} rather than {@code Instant.now()} (invariant #6, and it makes the
 * stamp assertable), and the action leaves an audit record. No {@code @Transactional} — the adapter
 * does the whole lift in one statement, so a surrounding transaction would only look meaningful.
 *
 * <p><strong>The audit line carries technical data only</strong> — the outcome token and the
 * suppression reason, both closed sets — following the shipped structured logger exactly as
 * {@code AccountErasureService} does. Never the address, and deliberately never the {@code domain}
 * either: ADR-0012 calls a bare domain non-PII, which makes logging it look free, but V34's CHECK
 * bans only <em>edge</em> whitespace, so a junk address yields a domain that may contain a newline —
 * a log-forging vector ({@code riviera-java-conventions} §10). Two closed-set tokens have neither
 * problem.
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
