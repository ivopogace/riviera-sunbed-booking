package ai.riviera.platform.operator.application;

/**
 * What a suspend decides on, read under {@link Operators#lockForSuspend}: whether the actor and the target are
 * {@code ACTIVE} admins, and how many other {@code ACTIVE} admins there are besides the target.
 */
public record SuspendFacts(boolean actorActiveAdmin, boolean targetActiveAdmin, long otherActiveAdmins) {

	/** Suspending the target would leave the platform without an {@code ACTIVE} admin. */
	boolean leavesNoActiveAdmin() {
		return targetActiveAdmin && otherActiveAdmins == 0;
	}
}
