package ai.riviera.grantfixture.beta.api;

import ai.riviera.grantfixture.beta.spi.BetaGate;
import ai.riviera.grantfixture.beta.vocabulary.BetaVerdict;

/** The port {@code alpha} and {@code gamma} import. */
public interface BetaChecks {

	BetaVerdict verify(String payload);

	void commit(BetaGate gate);
}
