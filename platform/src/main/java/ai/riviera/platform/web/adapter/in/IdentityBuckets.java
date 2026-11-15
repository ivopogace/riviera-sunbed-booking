package ai.riviera.platform.web.adapter.in;

import ai.riviera.platform.customer.vocabulary.Emails;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;

/**
 * One per-account budget ({@code riviera.ratelimit.username}) shared by the logins' per-identity throttle
 * ({@link RateLimitFilter}) and the credential changes' ({@link PrincipalRateLimitFilter}), so an account's failures
 * count once whichever endpoint they hit (NIST SP 800-63B-4 §3.2.2). Keys are scoped and SHA-256 under a
 * per-process random salt, so the map holds no plaintext identity and cannot be dictionary-confirmed (D-8).
 */
final class IdentityBuckets {

	private static final String OPERATOR_SCOPE = "op:";
	private static final String CUSTOMER_SCOPE = "cust:";

	private final BucketMap buckets;
	private final RateLimitProperties.Limit limit;

	/** Regenerated each restart; the buckets are in-memory, so no key stability is needed across them. */
	private final byte[] salt = new byte[16];

	IdentityBuckets(RateLimitProperties props) {
		this.buckets = new BucketMap(props.maxTrackedKeys());
		this.limit = props.username();
		new SecureRandom().nextBytes(salt);
	}

	/** An operator's key: the username raw, as {@code operator.username} compares it (exact, case-sensitive). */
	String operatorKey(String username) {
		return OPERATOR_SCOPE + saltedSha256Hex(username);
	}

	/** A customer's key: the email in its canonical form, so every spelling of one account shares a bucket. */
	String customerKey(String email) {
		return CUSTOMER_SCOPE + saltedSha256Hex(Emails.normalize(email));
	}

	TokenBucket bucketFor(String key, Instant now) {
		return buckets.bucketFor(key, limit, now);
	}

	private String saltedSha256Hex(String value) {
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			digest.update(salt);
			return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException impossible) {
			throw new IllegalStateException("SHA-256 is a required JDK algorithm", impossible);
		}
	}
}
