package ai.riviera.platform.customer.vocabulary;

import java.util.Locale;
import java.util.Objects;

/**
 * The platform's <strong>one canonical email normalization</strong>. An address is compared,
 * stored and keyed in exactly one form: surrounding whitespace trimmed, lower-cased in
 * {@link Locale#ROOT}.
 *
 * <p>It lives in {@code customer::vocabulary} because {@code customer} owns tourist identity, and
 * the canonical form of an address is identity vocabulary. It deliberately does <em>not</em> live in
 * the {@code shared} kernel, which would be the obvious home for a technical helper: {@code shared}
 * depends on {@code customer::api}/{@code ::vocabulary} while {@code customer} declares
 * {@code allowedDependencies = {}}, so a {@code customer} class calling into the kernel would close
 * the cycle {@code customer → shared → customer::api} — the same shape #371 removed. Every other
 * consumer ({@code notification}, the composition root) already holds {@code customer::vocabulary},
 * so this needed no new grant.
 *
 * <p><strong>Why one definition and not six agreeing copies.</strong> Since ADR-0012 the
 * {@code notification} suppression list stores {@code v1:} + peppered HMAC-SHA-256 of the
 * <em>normalized</em> address, on both the write and the read. Normalization is therefore the hash's
 * input contract: a one-character divergence between the copy that suppresses and the copy that
 * looks up yields a key that never matches, silently defeating the module's defining invariant
 * <em>no send to a suppressed address</em> — with no error anywhere. Byte-identical agreement has to
 * hold forever, so it is expressed by there being nothing to disagree with.
 *
 * <p><strong>Locale.ROOT is load-bearing</strong>, not decoration: under a {@code tr-TR} default
 * locale {@code "I".toLowerCase()} is a dotless {@code "ı"}, so a Turkish-defaulted host would
 * compute a different suppression key than CI for the same address.
 *
 * <p><strong>What it deliberately does not do:</strong> repair interior whitespace, strip
 * NBSP ({@code U+00A0}, which {@link String#trim()} leaves alone — it only strips code points
 * {@code <= U+0020}), validate shape, or resolve provider-specific aliasing (Gmail dots,
 * {@code +tags}). The first two are why {@code V34}'s {@code domain} CHECK rejects such values
 * outright rather than assuming normalization produced them; the last is a deliberate non-goal —
 * treating {@code a.b@gmail.com} and {@code ab@gmail.com} as one identity is a product decision,
 * not a string operation.
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
