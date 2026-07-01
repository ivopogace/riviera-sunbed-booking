package ai.riviera.placementfixture.badapi.api;

/** A sealed outcome hierarchy misplaced in a ports {@code api} surface — must be rejected. */
public sealed interface SealedOutcomeInPorts permits SealedOutcomeInPorts.Ok {

	record Ok() implements SealedOutcomeInPorts {
	}
}
