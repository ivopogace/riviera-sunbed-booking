package ai.riviera.platform.customer.vocabulary;

import java.util.Locale;
import java.util.Objects;

/**
 * The platform's <strong>one canonical email form</strong>: trimmed, lower-cased in {@link Locale#ROOT}
 * (load-bearing — under {@code tr-TR}, {@code "I"} lower-cases to a dotless {@code "ı"}). It is the input
 * contract of {@code notification}'s hashed suppression key (ADR-0012), so a divergent copy silently defeats
 * suppression — never re-implement it. It does not repair interior whitespace, strip NBSP, validate shape
 * or fold provider aliases (Gmail dots, {@code +tags}). Home and placement: RESPONSIBILITIES.md §customer.
 */
public final class Emails {

	private Emails() {
	}

	/**
	 * The canonical form of {@code email}: trimmed and lower-cased in {@link Locale#ROOT}.
	 *
	 * @throws NullPointerException if {@code email} is {@code null} — an absent address is the
	 *     caller's bug to handle, never a silently-normalized empty string
	 */
	public static String normalize(String email) {
		return Objects.requireNonNull(email, "email").trim().toLowerCase(Locale.ROOT);
	}
}
