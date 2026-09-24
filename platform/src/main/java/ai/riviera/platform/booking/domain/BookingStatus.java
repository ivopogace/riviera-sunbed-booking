package ai.riviera.platform.booking.domain;

/**
 * The lifecycle states of a {@code Booking}. Mirrors the {@code booking.status} CHECK
 * constraint (V5, widened by V19) one-to-one — keep the Java enum and the SQL token set in
 * lockstep (pinned by {@code BookingMigrationIT.everyEnumStatusAccepted}).
 *
 * <p>Instant Book starts at {@link #AWAITING_PAYMENT} → {@link #CONFIRMED}. Request-to-Book starts
 * at {@link #PENDING_REQUEST} and has <strong>three</strong> terminal legs, one per party that can
 * end it: venue decline → {@link #DECLINED}; nobody answered before the request deadline → {@link
 * #EXPIRED}; the guest retracted their own request → {@link #WITHDRAWN}. Venue accept → {@link
 * #AWAITING_PAYMENT} (then the identical payment spine). An accepted-but-unpaid request is swept to
 * {@link #CANCELLED} like any abandoned payment. {@link #COMPLETED} and {@link #NO_SHOW} are the
 * <em>stay outcomes</em>, written once when the stay's last service day resolves: {@code COMPLETED}
 * when staff checked the guest in on at least one service day ({@code booking_day}), {@code
 * NO_SHOW} when no service day was attended once every service day had passed. Both are terminal
 * for the guest: neither is cancellable or check-in-able. Only the admin weather refund reaches a
 * {@link #NO_SHOW}, deliberately ({@link BookingTransition#WEATHER_REFUND}, which holds that rule).
 *
 * <p>{@link #WITHDRAWN} is deliberately NOT {@link #CANCELLED}: no money was ever collected (a
 * pending request has no PaymentIntent on record — payment-request-on-accept), so
 * {@code CANCELLED} keeps meaning "a confirmed booking was cancelled", with a refund decision
 * behind it.
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
	 * Whether a guest may still turn up on this booking. Deliberately narrow and narrowly named:
	 * it answers the layout-edit guard's question — would moving this set strand someone? — and
	 * <strong>not</strong> "is this settled?" or "is this refundable?". {@code NO_SHOW} and
	 * {@code COMPLETED} answer {@code false} here while remaining reachable by the admin weather
	 * refund and counted in arrivals/takings, so a general-sounding predicate would be a trap.
	 * Exhaustive, so a new state must be classified rather than defaulting.
	 */
	public boolean canStillBeHonoured() {
		return switch (this) {
			case PENDING_REQUEST, AWAITING_PAYMENT, CONFIRMED -> true;
			case CANCELLED, COMPLETED, NO_SHOW, DECLINED, EXPIRED, WITHDRAWN -> false;
		};
	}
}
