package ai.riviera.platform.booking.domain;

import java.util.Collections;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * The booking lifecycle as one table: each transition, the statuses it admits, the status it writes;
 * {@link #successorsOf} answers "what may follow?". Transitions, not bare successors: both
 * {@link #CANCEL_BY_GUEST} ({@code CONFIRMED} only) and {@link #WEATHER_REFUND} (also {@code NO_SHOW})
 * write {@code CANCELLED}, and the guest path must never gain {@code NO_SHOW}. Generates no SQL: the
 * guarded {@code UPDATE … WHERE status = …} in {@code JdbcBookings} enforce it, the cancel statement
 * binds those two rows' statuses, and {@code JdbcBookingTransitionTableIT} holds every other row.
 */
public enum BookingTransition {

	/** The venue accepts a request: the guest's pay window opens. */
	ACCEPT_REQUEST(BookingStatus.PENDING_REQUEST, BookingStatus.AWAITING_PAYMENT),

	/** The venue declines a request. */
	DECLINE_REQUEST(BookingStatus.PENDING_REQUEST, BookingStatus.DECLINED),

	/** The guest retracts their own still-open request. */
	WITHDRAW_REQUEST(BookingStatus.PENDING_REQUEST, BookingStatus.WITHDRAWN),

	/** Nobody answered before the response deadline; the request-expiry sweep ends it. */
	EXPIRE_REQUEST(BookingStatus.PENDING_REQUEST, BookingStatus.EXPIRED),

	/** Compensation for a failed payment-request issuance — the one edge that runs backwards. */
	REVERT_ACCEPT(BookingStatus.AWAITING_PAYMENT, BookingStatus.PENDING_REQUEST),

	/** Payment succeeded: the webhook confirm, and the stub path's strict confirm on the same guard. */
	CONFIRM_PAYMENT(BookingStatus.AWAITING_PAYMENT, BookingStatus.CONFIRMED),

	/** The payment was cancelled or abandoned; the canceled webhook and the TTL sweep share this one. */
	RELEASE_UNPAID(BookingStatus.AWAITING_PAYMENT, BookingStatus.CANCELLED),

	/** The guest cancels under the policy (invariant #10) — {@code CONFIRMED} only. */
	CANCEL_BY_GUEST(BookingStatus.CONFIRMED, BookingStatus.CANCELLED),

	/**
	 * The check-in that resolves a stay: the one on its last service day. On an earlier day, check-in
	 * stamps only that {@code booking_day} attended, and the booking stays {@code CONFIRMED}.
	 */
	CHECK_IN(BookingStatus.CONFIRMED, BookingStatus.COMPLETED),

	/** Every service day passed and none was attended; the no-show sweep resolves it. */
	SWEEP_NO_SHOW(BookingStatus.CONFIRMED, BookingStatus.NO_SHOW),

	/** The admin weather refund — the only transition that acts on a {@code NO_SHOW}. */
	WEATHER_REFUND(EnumSet.of(BookingStatus.CONFIRMED, BookingStatus.NO_SHOW), BookingStatus.CANCELLED);

	private static final Map<BookingStatus, Set<BookingStatus>> SUCCESSORS = successorMap();

	private final Set<BookingStatus> admittedFrom;
	private final BookingStatus target;

	BookingTransition(BookingStatus from, BookingStatus to) {
		this(EnumSet.of(from), to);
	}

	BookingTransition(Set<BookingStatus> from, BookingStatus to) {
		this.admittedFrom = Collections.unmodifiableSet(EnumSet.copyOf(from));
		this.target = to;
	}

	/** The statuses this transition may act on; acting on any other must leave the booking untouched. */
	public Set<BookingStatus> admittedFrom() {
		return admittedFrom;
	}

	/** The status this transition writes. */
	public BookingStatus target() {
		return target;
	}

	public boolean admits(BookingStatus status) {
		return admittedFrom.contains(status);
	}

	/**
	 * Every status a booking in {@code status} may next hold, across all actors. Empty for the five
	 * statuses nothing leaves; {@code NO_SHOW} is not among them, because the weather refund
	 * reaches it.
	 */
	public static Set<BookingStatus> successorsOf(BookingStatus status) {
		return SUCCESSORS.get(status);
	}

	private static Map<BookingStatus, Set<BookingStatus>> successorMap() {
		Map<BookingStatus, Set<BookingStatus>> successors = new EnumMap<>(BookingStatus.class);
		for (BookingStatus status : BookingStatus.values()) {
			successors.put(status, EnumSet.noneOf(BookingStatus.class));
		}
		for (BookingTransition transition : values()) {
			transition.admittedFrom.forEach(from -> successors.get(from).add(transition.target));
		}
		successors.replaceAll((status, targets) -> Collections.unmodifiableSet(targets));
		return Collections.unmodifiableMap(successors);
	}
}
