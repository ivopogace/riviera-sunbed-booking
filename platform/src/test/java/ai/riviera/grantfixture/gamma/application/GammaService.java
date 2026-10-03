package ai.riviera.grantfixture.gamma.application;

import ai.riviera.grantfixture.beta.api.BetaChecks;

/** Names {@code beta::spi} only in {@code BetaChecks.commit}'s descriptor: a {@code null}, no lambda. */
public class GammaService {

	private final BetaChecks checks;

	public GammaService(BetaChecks checks) {
		this.checks = checks;
	}

	public void skip() {
		checks.commit(null);
	}
}
