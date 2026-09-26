package ai.riviera.platform.shared;

import java.time.Duration;

/**
 * What a press of an admin outbox-resubmit lever did, shared by every lever over the Event
 * Publication Registry: all three answers are properties of {@link ResubmissionThrottle}'s guard,
 * and one vocabulary keeps the levers' wire {@code outcome} tokens from drifting. A value, not an
 * exception: a refusal tells the caller why nothing was resubmitted and when to retry, instead of a
 * success that re-drove nothing. Admission: RESPONSIBILITIES.md §shared.
 */
public sealed interface ResubmissionOutcome {

	/**
	 * The stable token for this outcome — <strong>one definition</strong> serving both the log value
	 * and the wire {@code outcome} field, so the two cannot drift ({@code riviera-java-conventions}
	 * §6a).
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
	 * @param count how many; {@code 0} is a perfectly ordinary answer meaning nothing is owed
	 * @param cooldown how long the next attempt is refused for, so the caller need not know the config
	 */
	record Resubmitted(int count, Duration cooldown) implements ResubmissionOutcome {
	}

	/**
	 * Another resubmission holds the single-flight lock right now, so this one did nothing.
	 *
	 * <p>Distinct from {@link CoolingDown} deliberately: this is the genuinely concurrent case (two
	 * admins, or one double-click landing on two request threads), and it resolves in milliseconds
	 * rather than at the end of a cooldown.
	 */
	record AlreadyRunning(Duration cooldown) implements ResubmissionOutcome {
	}

	/**
	 * A resubmission ran recently enough that its re-driven work may still be in flight, so this
	 * one did nothing.
	 *
	 * <p>The work is safe either way (the registry's per-publication claim and the refund gateway
	 * both refuse duplicates); the window bounds the <em>sweep</em>: in an outage every re-driven
	 * attempt fails fast and is eligible again, so a held-down button would become a retry storm.
	 */
	record CoolingDown(Duration remaining) implements ResubmissionOutcome {
	}
}
