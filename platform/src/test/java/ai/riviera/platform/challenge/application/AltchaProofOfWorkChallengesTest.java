package ai.riviera.platform.challenge.application;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.json.JSONObject;
import org.junit.jupiter.api.Test;

import ai.riviera.platform.challenge.ChallengeSolving;
import ai.riviera.platform.challenge.vocabulary.ChallengeVerdict;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The ALTCHA mechanism's own contract, behind the module's port and over an in-memory registry: what
 * a freshly issued challenge carries, and every way a submitted solution can land. The four verdicts
 * and the single-use claim are proven here rather than at the HTTP edge — the fence's job is mapping
 * a verdict to a problem body, which is {@code ChallengeVerificationFilterTest}'s.
 *
 * <p>Expiry is minted from the injected {@link Clock} but checked by the library against the wall
 * clock, so the issue cases use a fixed clock and the verify cases mint their own challenges in real
 * time — the same split the shipped code makes.
 */
class AltchaProofOfWorkChallengesTest {

	private static final String SECRET = "unit-test-only-not-a-secret";
	private static final int COST = 10;
	private static final Duration EXPIRY = Duration.ofMinutes(10);
	private static final Instant NOW = Instant.parse("2026-06-30T12:00:00Z");

	private final InMemoryChallengeRegistry registry = new InMemoryChallengeRegistry();
	private final AltchaProofOfWorkChallenges challenges = challengesWith(true);

	@Test
	void issuesASignedChallengeAtTheConfiguredCostAndExpiry() {
		JSONObject issued = new JSONObject(challenges.issue());
		JSONObject parameters = issued.getJSONObject("parameters");

		assertEquals(ChallengeSolving.ALGORITHM, parameters.getString("algorithm"));
		assertEquals(COST, parameters.getInt("cost"));
		assertEquals(NOW.plus(EXPIRY).getEpochSecond(), parameters.getLong("expiresAt"),
				"the expiry is minted from the injected clock, never the caller's");
		assertFalse(parameters.getString("nonce").isBlank());
		assertFalse(issued.getString("signature").isBlank());
	}

	@Test
	void everyIssuedChallengeCarriesAFreshNonce() {
		assertNotEquals(new JSONObject(challenges.issue()).getJSONObject("parameters").getString("nonce"),
				new JSONObject(challenges.issue()).getJSONObject("parameters").getString("nonce"));
	}

	@Test
	void theKillSwitchIsTheConfiguredFlag() {
		assertTrue(challenges.enabled());
		assertFalse(challengesWith(false).enabled());
	}

	@Test
	void aSolvedChallengeIsVerifiedOnceAndReplayedAfterwards() throws Exception {
		String payload = solvedPayload(SECRET, inTenMinutes());

		assertEquals(ChallengeVerdict.VERIFIED, challenges.verify(payload));
		assertEquals(ChallengeVerdict.REPLAYED, challenges.verify(payload),
				"the registry claim is what makes a solution count exactly once");
	}

	@Test
	void aSignatureFromAnotherSecretIsInvalid() throws Exception {
		assertEquals(ChallengeVerdict.INVALID, challenges.verify(solvedPayload("somebody-elses-secret",
				inTenMinutes())));
	}

	@Test
	void aTamperedSignatureIsInvalid() throws Exception {
		assertEquals(ChallengeVerdict.INVALID,
				challenges.verify(ChallengeSolving.tamperSignature(solvedPayload(SECRET, inTenMinutes()))));
	}

	@Test
	void aWrongAnswerIsInvalid() throws Exception {
		assertEquals(ChallengeVerdict.INVALID,
				challenges.verify(ChallengeSolving.wrongAnswer(solvedPayload(SECRET, inTenMinutes()))));
	}

	@Test
	void anUnparseablePayloadIsInvalid() {
		assertEquals(ChallengeVerdict.INVALID, challenges.verify("not-even-base64!"));
		assertEquals(ChallengeVerdict.INVALID, challenges.verify(base64("{\"challenge\":{}}")));
	}

	@Test
	void anExpiredChallengeIsExpired() throws Exception {
		assertEquals(ChallengeVerdict.EXPIRED,
				challenges.verify(solvedPayload(SECRET, Instant.now().minusSeconds(60).getEpochSecond())));
	}

	@Test
	void aRefusedSolutionClaimsNothing() throws Exception {
		challenges.verify(ChallengeSolving.wrongAnswer(solvedPayload(SECRET, inTenMinutes())));

		assertEquals(0, registry.size(), "only a verified solution may spend its nonce");
	}

	private AltchaProofOfWorkChallenges challengesWith(boolean enabled) {
		return new AltchaProofOfWorkChallenges(
				new AltchaProperties(enabled, COST, EXPIRY, Duration.ofSeconds(30), SECRET),
				Clock.fixed(NOW, ZoneOffset.UTC), registry);
	}

	private static String solvedPayload(String secret, long expiresAt) throws Exception {
		return ChallengeSolving.solve(ChallengeSolving.mint(secret, COST, expiresAt));
	}

	private static long inTenMinutes() {
		return Instant.now().plus(EXPIRY).getEpochSecond();
	}

	private static String base64(String json) {
		return Base64.getEncoder().encodeToString(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));
	}

	/** The claim-once contract without a database — the same shape the Postgres adapter implements. */
	private static final class InMemoryChallengeRegistry implements ChallengeRegistry {

		private final ConcurrentMap<String, Instant> claimed = new ConcurrentHashMap<>();

		@Override
		public boolean claim(String challengeId, Instant expiresAt) {
			return claimed.putIfAbsent(challengeId, expiresAt) == null;
		}

		@Override
		public int deleteExpiredBefore(Instant cutoff) {
			int before = claimed.size();
			claimed.values().removeIf(expiresAt -> expiresAt.isBefore(cutoff));
			return before - claimed.size();
		}

		int size() {
			return claimed.size();
		}
	}
}
