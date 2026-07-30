package ai.riviera.platform.notification.adapter.in;

/**
 * Whether a request body's value could be an email address at all — the request-validation check this
 * module's two address-taking admin surfaces share (#391's suppression reinstatement and #380's
 * mail-delivery lookup).
 *
 * <p>Extracted rather than copied when the second caller arrived: the reasoning below is subtle enough
 * that two copies would drift, and #398 already had to fix a half-check once.
 *
 * <p><strong>Both halves are checked, not just the {@code @}</strong> (the #398 review). A shapeless
 * value can never match anything downstream, so letting it through returns a technically-true empty or
 * not-found answer that reads to an admin as "nothing to do here" — hiding their typo behind a
 * {@code 200}. Nothing further down would catch it either, by design: {@code Emails.normalize}
 * deliberately normalizes without validating.
 *
 * <p>Still only a <strong>shape</strong> check. Full address validity is the mail provider's verdict,
 * not a regex's.
 */
final class AddressShape {

	private AddressShape() {
	}

	/** A non-empty local part, an {@code @}, and a non-empty domain part. */
	static boolean isAddressShaped(String email) {
		if (email == null || email.isBlank()) {
			return false;
		}
		String trimmed = email.trim();
		int at = trimmed.lastIndexOf('@');
		return at > 0 && at < trimmed.length() - 1;
	}
}
