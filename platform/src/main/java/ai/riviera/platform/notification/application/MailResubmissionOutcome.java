package ai.riviera.platform.notification.application;

import java.time.Duration;

/**
 * What an admin's press of the resubmit lever did (#405) — a typed outcome, not an exception, because
 * all three are expected flows an operator acts on rather than errors
 * ({@code riviera-java-conventions} §6). The two refusals are the once-only guarantee of AC-3 made
 * visible: the caller is told <em>why</em> nothing was resubmitted and when to try again, instead of
 * receiving a success that quietly sent nothing — or, worse, a second delivery.
 */
public sealed interface MailResubmissionOutcome {

	/**
	 * The stable token for this outcome — <strong>one definition</strong> serving both the log value
	 * and the wire {@code outcome} field, so the two cannot drift ({@code riviera-java-conventions}
	 * §6a). Mirrors {@code ReinstateOutcome#code()}.
	 */
	default String code() {
		return switch (this) {
			case Resubmitted ignored -> "RESUBMITTED";
			case AlreadyRunning ignored -> "ALREADY_RUNNING";
			case CoolingDown ignored -> "COOLING_DOWN";
		};
	}

	/** How long until another attempt would be accepted — zero when this one was. */
	default Duration retryAfter() {
		return switch (this) {
			case Resubmitted resubmitted -> resubmitted.cooldown();
			case AlreadyRunning running -> running.cooldown();
			case CoolingDown cooling -> cooling.remaining();
		};
	}

	/** How many publications this attempt handed back to the registry — zero for both refusals. */
	default int resubmitted() {
		return this instanceof Resubmitted done ? done.count() : 0;
	}

	/**
	 * The scope's outstanding publications were handed back to the registry for delivery.
	 *
	 * @param count how many; {@code 0} is a perfectly ordinary answer meaning the outbox was empty
	 * @param cooldown how long the next attempt is refused for, so the caller need not know the config
	 */
	record Resubmitted(int count, Duration cooldown) implements MailResubmissionOutcome {
	}

	/**
	 * Another resubmission holds the single-flight lock right now, so this one did nothing.
	 *
	 * <p>Distinct from {@link CoolingDown} deliberately: this is the genuinely concurrent case (two
	 * admins, or one double-click landing on two request threads), and it resolves in milliseconds
	 * rather than at the end of a cooldown.
	 */
	record AlreadyRunning(Duration cooldown) implements MailResubmissionOutcome {
	}

	/**
	 * A resubmission ran recently enough that its sends may still be in flight, so this one did
	 * nothing.
	 *
	 * <p>The registry would refuse those publications individually — its claim skips one whose previous
	 * resubmission is still draining on {@code registryMailExecutor} (#383) — so this refusal is about
	 * the sweep, not the mail. It keeps a press during a relay outage, where every send fails fast and
	 * is immediately eligible again, from turning a button into a retry storm, and it tells the admin
	 * so instead of reporting a success that moved nothing.
	 */
	record CoolingDown(Duration remaining) implements MailResubmissionOutcome {
	}
}
