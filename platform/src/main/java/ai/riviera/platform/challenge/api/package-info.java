/**
 * Published <strong>ports</strong> surface of the {@code challenge} module (invariant #11) —
 * "call-me" interfaces only. It holds exactly one:
 * {@link ai.riviera.platform.challenge.api.ProofOfWorkChallenges}, the whole conversation the
 * platform edge has with the mechanism (is the fence on, mint me a challenge, judge this solution).
 * The verdict it answers in lives in the sibling {@code vocabulary} named interface. Granted as
 * {@code challenge::api} to the composition root and to nothing else.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.challenge.api;
