package ai.riviera.platform.booking.application.refund;

import java.time.Duration;

/**
 * What an admin's press of the refund-resubmit lever did (#454) — a typed outcome, not an exception,
 * because all three are expected flows an operator acts on rather than errors
 * ({@code riviera-java-conventions} §6). The two refusals make the once-only guarantee visible: the
 * caller is told <em>why</em> nothing was resubmitted and when to try again, instead of receiving a
 * success that quietly re-drove nothing.
 */
public sealed interface RefundResubmissionOutcome {

	/**
	 * The stable token for this outcome — <strong>one definition</strong> serving both the log value
	 * and the wire {@code outcome} field, so the two cannot drift ({@code riviera-java-conventions}
	 * §6a). Mirrors {@code MailResubmissionOutcome#code()}.
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
	record Resubmitted(int count, Duration cooldown) implements RefundResubmissionOutcome {
	}

	/**
	 * Another resubmission holds the single-flight lock right now, so this one did nothing.
	 *
	 * <p>Distinct from {@link CoolingDown} deliberately: this is the genuinely concurrent case (two
	 * admins, or one double-click landing on two request threads), and it resolves in milliseconds
	 * rather than at the end of a cooldown.
	 */
	record AlreadyRunning(Duration cooldown) implements RefundResubmissionOutcome {
	}

	/**
	 * A resubmission ran recently enough that its re-driven refunds may still be in flight, so this one
	 * did nothing.
	 *
	 * <p>The money is safe either way — the gateway's idempotency key and the registry's
	 * per-publication claim both hold — so this refusal is about the sweep: during a gateway outage
	 * every re-driven refund fails fast and is immediately eligible again, and without the window a
	 * held-down button would drive a retry storm at the gateway that is already struggling, each press
	 * reporting success while settling nothing.
	 */
	record CoolingDown(Duration remaining) implements RefundResubmissionOutcome {
	}
}
