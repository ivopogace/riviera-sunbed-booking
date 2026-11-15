package ai.riviera.platform.operator.vocabulary;

/**
 * How removing an operator's linked sign-in ended (#276). {@link LastCredential} keeps the one way the operator still
 * has to sign in; {@link NotLinked} wrote nothing, so a repeated unlink answers like the first.
 */
public sealed interface SsoUnlinkOutcome
		permits SsoUnlinkOutcome.Unlinked, SsoUnlinkOutcome.NotLinked, SsoUnlinkOutcome.LastCredential {

	/** The link is gone; {@code username} names the principal whose other sessions the edge ends. */
	record Unlinked(String username) implements SsoUnlinkOutcome {
	}

	/** The operator had no link for this issuer. */
	record NotLinked() implements SsoUnlinkOutcome {
	}

	/** The link is the operator's only credential; nothing was removed. */
	record LastCredential() implements SsoUnlinkOutcome {
	}
}
