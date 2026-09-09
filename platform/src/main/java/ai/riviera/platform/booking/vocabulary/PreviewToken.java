package ai.riviera.platform.booking.vocabulary;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * What the operator confirmed on the remodel preview, as the commit re-checks it: one SHA-256 digest
 * per previewed claim over {@code bookingId:KIND} — the booking and the <em>kind</em> of outcome,
 * never the candidate set, so a move re-ranked by a racing claim still matches — sorted and joined
 * behind a version prefix. {@link #covers} is the match rule: every re-derived pair must have its
 * digest in the token; a previewed pair with no fresh twin (a guest cancelled in between) is fine, a
 * fresh pair with no digest (a new claim, or a changed kind) is stale. Opaque on the wire; carrying
 * no secret, it needs no signature — a forged token can only ever confirm what the commit would
 * decide anyway.
 */
public record PreviewToken(String value) {

	private static final String VERSION = "v1";
	private static final String SEPARATOR = ".";
	private static final int DIGEST_BYTES = 12;

	public PreviewToken {
		if (value == null || !value.startsWith(VERSION)) {
			throw new IllegalArgumentException("not a preview token");
		}
	}

	/** The token of a classification as the preview answered it. */
	public static PreviewToken of(List<RemodelClaim> claims) {
		String digests = claims.stream()
				.map(PreviewToken::digestOf)
				.sorted()
				.collect(Collectors.joining(SEPARATOR));
		return new PreviewToken(digests.isEmpty() ? VERSION : VERSION + SEPARATOR + digests);
	}

	/** Whether every fresh claim's {@code (booking, kind)} pair was previewed under this token. */
	public boolean covers(List<RemodelClaim> fresh) {
		Set<String> previewed = Set.of(value.split("\\" + SEPARATOR));
		return fresh.stream().map(PreviewToken::digestOf).allMatch(previewed::contains);
	}

	private static String digestOf(RemodelClaim claim) {
		String pair = claim.bookingId().value() + ":" + kindOf(claim.outcome());
		byte[] hash = sha256().digest(pair.getBytes(StandardCharsets.UTF_8));
		return Base64.getUrlEncoder().withoutPadding().encodeToString(Arrays.copyOf(hash, DIGEST_BYTES));
	}

	private static String kindOf(RemodelOutcome outcome) {
		return switch (outcome) {
			case RemodelOutcome.Move ignored -> "MOVE";
			case RemodelOutcome.Refund ignored -> "REFUND";
			case RemodelOutcome.Release ignored -> "RELEASE";
			case RemodelOutcome.Decline ignored -> "DECLINE";
			case RemodelOutcome.Blocked ignored -> "BLOCKED";
		};
	}

	private static MessageDigest sha256() {
		try {
			return MessageDigest.getInstance("SHA-256");
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException("SHA-256 is mandatory in every JDK", e);
		}
	}
}
