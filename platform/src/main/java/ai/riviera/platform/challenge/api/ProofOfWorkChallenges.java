package ai.riviera.platform.challenge.api;

import ai.riviera.platform.challenge.vocabulary.ChallengeVerdict;

/**
 * The proof-of-work challenge mechanism as the platform edge sees it (ADR-0016, ADR-0017): the fence
 * asks whether it is armed, the endpoint asks for a challenge, and the filter submits what the widget
 * solved. Everything behind it — the ALTCHA library, the signing secret, the clock, and the
 * single-use registry that makes a solution count exactly once across restarts and instances — is the
 * module's own. No ALTCHA service is ever called.
 *
 * <p>Implementations never log a payload; a submitted solution is a bearer value.
 */
public interface ProofOfWorkChallenges {

	/** {@code false} means the fenced routes admit requests without a solution and none is issued. */
	boolean enabled();

	/** A fresh signed challenge as the JSON the widget consumes ({@code {parameters, signature}}). */
	String issue();

	/** Judge the widget's base64 payload and, if it is right, claim its nonce for this submission. */
	ChallengeVerdict verify(String payload);
}
