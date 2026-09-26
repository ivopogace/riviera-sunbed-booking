package ai.riviera.platform.notification.adapter.in;

/**
 * Whether a request body's value could be an email address at all — the shape check both
 * address-taking admin surfaces share (suppression reinstatement, mail-delivery lookup).
 *
 * <p>Both halves around the {@code @} must be non-empty: a shapeless value matches nothing
 * downstream ({@code Emails.normalize} does not validate), so it would hide an admin's typo behind
 * a {@code 200} "nothing found". Only a shape check; full validity is the mail provider's verdict.
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
