package ai.riviera.platform;

/**
 * What became of a verification mail the signed-in customer asked for (#400) — the edge's typed answer
 * to the one question its resend surface can otherwise only guess at.
 *
 * <p>It says nothing about <em>transport</em> success: the send is fire-and-forget and off this thread
 * by design (#369), so {@link #SENT} means "handed to the mail module, and not withheld", never
 * "delivered". The only alternative it distinguishes is the one the UI was previously lying about — the
 * address being on the do-not-mail list, where no mail will leave at all.
 */
enum VerificationMailOutcome {

	/** Dispatched, and the address is not suppressed — the page may say a mail is on its way. */
	SENT,

	/** Dispatched, but the do-not-mail list will withhold it — the page must not claim it was sent. */
	WITHHELD
}
