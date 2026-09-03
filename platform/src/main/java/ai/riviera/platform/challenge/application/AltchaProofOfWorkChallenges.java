package ai.riviera.platform.challenge.application;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;

import org.altcha.altcha.v2.Altcha;
import org.json.JSONException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import ai.riviera.platform.challenge.api.ProofOfWorkChallenges;
import ai.riviera.platform.challenge.vocabulary.ChallengeVerdict;

/**
 * {@link ProofOfWorkChallenges} on the official ALTCHA v2 library: a challenge is a signed parameter
 * block the widget brute-forces in the browser; a solution is accepted when its signature is ours,
 * its answer is right, it has not expired, and the {@link ChallengeRegistry} claim for its nonce
 * wins — so each solution counts exactly once, across restarts and instances.
 *
 * <p>Expiry is minted from the injected {@link Clock} and checked by the library against the wall
 * clock — both the server's, so the client's clock never enters. The signing secret is
 * {@code riviera.altcha.hmac-secret}; blank means a random key for this process alone, which is
 * fine for a single dev instance and is logged at WARN. Rationale: {@code RESPONSIBILITIES.md}
 * § {@code challenge}.
 */
@Service
class AltchaProofOfWorkChallenges implements ProofOfWorkChallenges {

	private static final Logger log = LoggerFactory.getLogger(AltchaProofOfWorkChallenges.class);

	/** The one algorithm the platform issues; a payload naming another is invalid before any crypto runs. */
	static final String ALGORITHM = "PBKDF2/SHA-256";
	private static final int RANDOM_SECRET_BYTES = 32;
	private static final SecureRandom RANDOM = new SecureRandom();

	private final AltchaProperties props;
	private final Clock clock;
	private final ChallengeRegistry registry;
	private final String secret;
	private final Altcha.KeyDerivationFunction kdf = Altcha.kdf(ALGORITHM);

	AltchaProofOfWorkChallenges(AltchaProperties props, Clock clock, ChallengeRegistry registry) {
		this.props = props;
		this.clock = clock;
		this.registry = registry;
		this.secret = resolveSecret(props.hmacSecret());
	}

	private static String resolveSecret(String configured) {
		if (!configured.isBlank()) {
			return configured;
		}
		byte[] random = new byte[RANDOM_SECRET_BYTES];
		RANDOM.nextBytes(random);
		log.warn("RIVIERA_ALTCHA_HMAC_SECRET is not set — signing challenges with a random boot-time key: "
				+ "a restart invalidates challenges in flight and a second instance can verify none of them. "
				+ "Set the variable on every instance.");
		return HexFormat.of().formatHex(random);
	}

	@Override
	public boolean enabled() {
		return props.enabled();
	}

	@Override
	public String issue() {
		long expiresAt = clock.instant().plus(props.expiry()).getEpochSecond();
		try {
			return Altcha.createChallenge(new Altcha.CreateChallengeOptions()
					.algorithm(ALGORITHM)
					.cost(props.cost())
					.hmacSignatureSecret(secret)
					.expiresAt(expiresAt))
					.toJson();
		}
		catch (Exception e) {
			throw new IllegalStateException("could not create a proof-of-work challenge", e);
		}
	}

	@Override
	public ChallengeVerdict verify(String payload) {
		Altcha.Payload parsed;
		Altcha.VerifySolutionResult result;
		try {
			parsed = Altcha.parsePayload(payload);
			Altcha.ChallengeParameters parameters = parsed.challenge().parameters();
			if (!ALGORITHM.equals(parameters.algorithm()) || parameters.expiresAt() == null) {
				return ChallengeVerdict.INVALID;
			}
			result = Altcha.verifySolution(parsed.challenge(), parsed.solution(), secret, kdf);
		}
		catch (JSONException | IllegalArgumentException malformed) {
			return ChallengeVerdict.INVALID;
		}
		catch (Exception e) {
			// The library declares a checked Exception; anything past malformed input is a platform fault.
			throw new IllegalStateException("proof-of-work verification failed", e);
		}
		if (result.expired()) {
			return ChallengeVerdict.EXPIRED;
		}
		if (!result.verified()) {
			return ChallengeVerdict.INVALID;
		}
		Altcha.ChallengeParameters parameters = parsed.challenge().parameters();
		Instant expiresAt = Instant.ofEpochSecond(parameters.expiresAt());
		return registry.claim(parameters.nonce(), expiresAt) ? ChallengeVerdict.VERIFIED : ChallengeVerdict.REPLAYED;
	}
}
