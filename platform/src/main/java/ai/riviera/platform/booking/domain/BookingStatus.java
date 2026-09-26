package ai.riviera.platform.booking.domain;

/**
 * The lifecycle states of a booking; {@link BookingTransition} is the table of moves between them.
 * Constant names are the stored {@code booking.status} tokens, one-to-one with
 * {@code booking_status_check}: change both in lockstep ({@code BookingMigrationIT} pins it).
 * {@link #COMPLETED} (a service day attended) and {@link #NO_SHOW} (none) are stay outcomes,
 * written once when the last service day resolves. {@link #WITHDRAWN} is deliberately not
 * {@link #CANCELLED}: a pending request never collected money.
 */
public enum BookingStatus {
	PENDING_REQUEST,
	AWAITING_PAYMENT,
	CONFIRMED,
	CANCELLED,
	COMPLETED,
	NO_SHOW,
	DECLINED,
	EXPIRED,
	WITHDRAWN;

	/**
	 * Whether a guest may still turn up. Deliberately narrow and narrowly named: the layout-edit
	 * guard's question, not "refundable?" or "counted in takings?" ({@code NO_SHOW} is both), so a
	 * general-sounding predicate would be a trap. Exhaustive: a new state must be classified.
	 */
	public boolean canStillBeHonoured() {
		return switch (this) {
			case PENDING_REQUEST, AWAITING_PAYMENT, CONFIRMED -> true;
			case CANCELLED, COMPLETED, NO_SHOW, DECLINED, EXPIRED, WITHDRAWN -> false;
		};
	}
}
