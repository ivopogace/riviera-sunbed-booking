package ai.riviera.grantfixture.alpha.application;

import ai.riviera.grantfixture.beta.api.BetaChecks;

/** Uses {@code beta::api} by import, {@code beta::vocabulary} and {@code beta::spi} only in bytecode. */
public class AlphaService {

	private final BetaChecks checks;

	public AlphaService(BetaChecks checks) {
		this.checks = checks;
	}

	public boolean admit(String payload) {
		return switch (checks.verify(payload)) {
			case PASSED -> true;
			case FAILED -> false;
		};
	}

	public void save() {
		checks.commit(count -> count > 0);
	}
}
