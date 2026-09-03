package ai.riviera.platform;

/**
 * How a submitted proof-of-work solution fared, as {@link ProofOfWorkChallenges#verify} answers it.
 * A value, not an exception: every outcome but {@link #VERIFIED} is the expected flow of a fence.
 */
enum ChallengeVerdict {
	/** Signed by this platform, solved correctly, and claimed for this one submission. */
	VERIFIED,
	/** Unparseable, not our algorithm, a signature that does not match, or a wrong answer. */
	INVALID,
	/** Past its {@code expiresAt}. */
	EXPIRED,
	/** Correct, but the registry already holds it — a second submission of one solution. */
	REPLAYED
}
