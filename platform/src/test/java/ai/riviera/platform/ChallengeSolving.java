package ai.riviera.platform;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import org.altcha.altcha.v2.Altcha;
import org.json.JSONObject;

/**
 * Solves, mints and forges ALTCHA v2 challenges for the tests, with the same library the edge
 * verifies with — so no test bypass exists and a payload here is byte-for-byte what the widget
 * sends: base64 of {@code {"challenge":{"parameters":…,"signature":…},"solution":{…}}}.
 */
final class ChallengeSolving {

	static final String ALGORITHM = "PBKDF2/SHA-256";

	private ChallengeSolving() {
	}

	/** Brute-force the counter for the challenge JSON the endpoint served and encode the widget payload. */
	static String solve(String challengeJson) throws Exception {
		return solve(parse(challengeJson));
	}

	static String solve(Altcha.Challenge challenge) throws Exception {
		Altcha.Solution solution = Altcha.solveChallenge(challenge, Altcha.kdf(challenge.parameters().algorithm()));
		return payload(challenge, solution);
	}

	/** A signed challenge minted the way the edge mints one, but with the caller's secret and expiry. */
	static Altcha.Challenge mint(String secret, int cost, long expiresAtEpochSeconds) throws Exception {
		return Altcha.createChallenge(new Altcha.CreateChallengeOptions()
				.algorithm(ALGORITHM)
				.cost(cost)
				.hmacSignatureSecret(secret)
				.expiresAt(expiresAtEpochSeconds));
	}

	/** The widget's payload for a solved challenge. */
	static String payload(Altcha.Challenge challenge, Altcha.Solution solution) {
		String json = "{\"challenge\":" + challenge.toJson() + ",\"solution\":{\"counter\":" + solution.counter()
				+ ",\"derivedKey\":\"" + solution.derivedKey() + "\",\"time\":" + solution.time() + "}}";
		return Base64.getEncoder().encodeToString(json.getBytes(StandardCharsets.UTF_8));
	}

	/** A payload whose challenge signature no longer matches its parameters. */
	static String tamperSignature(String payload) throws Exception {
		Altcha.Payload parsed = Altcha.parsePayload(payload);
		String signature = parsed.challenge().signature();
		char first = signature.charAt(0) == '0' ? '1' : '0';
		Altcha.Challenge forged = new Altcha.Challenge(parsed.challenge().parameters(),
				first + signature.substring(1));
		return payload(forged, parsed.solution());
	}

	/** A payload whose counter is off by one — a valid challenge with a wrong answer. */
	static String wrongAnswer(String payload) throws Exception {
		Altcha.Payload parsed = Altcha.parsePayload(payload);
		Altcha.Solution wrong = new Altcha.Solution(parsed.solution().counter() + 1,
				parsed.solution().derivedKey(), parsed.solution().time());
		return payload(parsed.challenge(), wrong);
	}

	static Altcha.Challenge parse(String challengeJson) {
		JSONObject root = new JSONObject(challengeJson);
		JSONObject p = root.getJSONObject("parameters");
		Altcha.ChallengeParameters parameters = new Altcha.ChallengeParameters(
				p.getString("algorithm"), p.getString("nonce"), p.getString("salt"), p.getInt("cost"),
				p.getInt("keyLength"), p.getString("keyPrefix"), null, null, null,
				p.has("expiresAt") ? p.getLong("expiresAt") : null, null);
		return new Altcha.Challenge(parameters, root.optString("signature", null));
	}
}
