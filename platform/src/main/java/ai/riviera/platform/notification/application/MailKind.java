package ai.riviera.platform.notification.application;

import ai.riviera.platform.shared.ObservabilityMetrics;

/**
 * Which transactional-mail flow a send on the bounded in-memory vehicle belongs to — the {@code kind}
 * dimension both of that vehicle's loss counters are read through
 * ({@link ObservabilityMetrics#MAIL_RECOVERY_FAILED}, {@link ObservabilityMetrics#MAIL_RECOVERY_DROPPED}).
 *
 * <p><strong>One type rather than a set of string constants, deliberately</strong> (#442). The two
 * counters are raised from two classes, on two threads, at two moments — {@code TransactionalMailService}
 * from inside a send it is running, {@code AsyncMailDispatcher} from outside one it never ran. Before this
 * enum the vocabulary existed only on the first of them, and the second could not name a flow at all; the
 * failure mode a shared vocabulary now forecloses is the subtler successor to that gap, where a kind is
 * spelled {@code password_reset} on one series and {@code password-reset} on the other and the query that
 * joins them simply returns nothing.
 *
 * <p><strong>"Recovery" in the metric names is the vehicle, not the flow.</strong> They were coined when
 * this dispatcher carried only {@link #VERIFICATION} and {@link #PASSWORD_RESET}; #375 added
 * {@link #OPERATOR_APPROVED}, which is no recovery flow at all. The names stay because renaming a shipped
 * metric breaks whatever reads it — and this enum is what tells the flows apart instead.
 *
 * <p>Module-internal (RV-BE-11): no kind ever crosses the module edge, because {@code notification.api}'s
 * {@code MailSender} publishes one method per kind rather than a kind parameter.
 */
enum MailKind {

	/** Confirm a newly registered address. Soft/non-blocking (D-8); the user can ask again. */
	VERIFICATION("verification"),

	/** A password-reset link: a single-use bearer credential (invariant #7). The user can ask again. */
	PASSWORD_RESET("password-reset"),

	/**
	 * An admin approved an operator's registration (#375) — the one kind here whose loss does not
	 * self-heal. Nothing re-sends it, and the operator learns its account is live only by retrying
	 * sign-in, which is the experience #375 removed (ADR-0011 decision 5, amended #439). It is why the
	 * drop path needed this dimension and not merely the failed path.
	 */
	OPERATOR_APPROVED("operator-approved");

	/** The metric tag key. Shared by both loss counters, so a reader can pivot between them. */
	static final String TAG = "kind";

	private final String tagValue;

	MailKind(String tagValue) {
		this.tagValue = tagValue;
	}

	/**
	 * This kind's tag value, as shipped. The observability runbook tells an on-call reader to filter on
	 * these by name, so they are a public vocabulary: changing one is breaking a dashboard, not renaming
	 * a constant.
	 */
	String tagValue() {
		return tagValue;
	}
}
