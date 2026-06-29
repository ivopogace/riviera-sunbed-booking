package ai.riviera.platform.booking.application;

/**
 * Thrown when the payment gateway declines collection mid-create, to abort and roll back the
 * whole transaction (including the availability claim) — a set is never left held for a
 * booking that wasn't paid. <strong>Unreachable in U3</strong> (the stub always succeeds); it
 * exists so the {@code PaymentOutcome.Failed} branch is handled exhaustively. U4 replaces this
 * synchronous path with webhook-driven confirmation and proper decline handling.
 */
class PaymentDeclinedException extends RuntimeException {

	PaymentDeclinedException(String reason) {
		super("payment declined: " + reason);
	}
}
