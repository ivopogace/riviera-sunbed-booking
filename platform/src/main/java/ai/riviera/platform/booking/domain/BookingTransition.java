package ai.riviera.platform.booking.domain;

import java.util.Collections;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * The booking lifecycle as one table: every transition, the statuses it may act on, and the status
 * it writes. Nine states, eleven transitions — {@link #successorsOf} answers "what may follow
 * {@code AWAITING_PAYMENT}?" in one place, where the answer otherwise has to be assembled from the
 * guarded {@code UPDATE}s spread through {@code JdbcBookings}.
 *
 * <p>A table of <em>transitions</em> rather than of successors alone, because two of them write the
 * same status from different sources: {@link #CANCEL_BY_GUEST} reaches {@code CANCELLED} from
 * {@code CONFIRMED} only, while the admin's {@link #WEATHER_REFUND} also reaches it from
 * {@code NO_SHOW}. A plain successor map would flatten that difference away, and it is the one the
 * guest path must never lose.
 *
 * <p>This states the lifecycle; it does not enforce it. The guarded {@code UPDATE … WHERE status =
 * …} statements stay the enforcing statement, and no SQL is generated from here —
 * {@code JdbcBookingTransitionTableIT} binds the two by driving every transition against every
 * status, as {@code BookingMigrationIT.everyEnumStatusAccepted} binds {@link BookingStatus} to
 * {@code booking_status_check}.
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

	/** Staff scan the code at the venue on the service date. */
	CHECK_IN(BookingStatus.CONFIRMED, BookingStatus.COMPLETED),

	/** The service day passed with no check-in; the no-show sweep marks it. */
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
	 * statuses nothing leaves; {@code NO_SHOW} is not among them, because the weather refund reaches
	 * it.
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
