package ai.riviera.platform.notification.application;

import ai.riviera.platform.shared.ObservabilityMetrics;

/**
 * The flow a send on the in-memory vehicle belongs to: the {@code kind} tag on both its loss
 * counters ({@link ObservabilityMetrics#MAIL_RECOVERY_FAILED}, {@code MAIL_RECOVERY_DROPPED}). One
 * enum, so the two classes raising them cannot spell a kind differently and break a joined query.
 * "Recovery" in the metric names is the vehicle, not the flow; never rename a shipped metric. No
 * kind crosses the module edge: {@code MailSender} publishes a method per kind. Rationale:
 * {@code docs/runbooks/observability.md}, {@code RESPONSIBILITIES.md} §notification.
 */
enum MailKind {

	/** Confirm a newly registered address. Soft/non-blocking (D-8); the user can ask again. */
	VERIFICATION("verification"),

	/** A password-reset link: a single-use bearer credential (invariant #7). The user can ask again. */
	PASSWORD_RESET("password-reset"),

	/**
	 * An admin approved an operator's registration: the one kind whose loss does not self-heal, since
	 * nothing re-sends it (ADR-0011 decision 5) — which is why the drop path carries this tag too.
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
