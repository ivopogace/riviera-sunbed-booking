package ai.riviera.domainpurityfixture.reaching.domain;

import ai.riviera.domainpurityfixture.reaching.adapter.out.FixtureRepository;

/** Impure: a domain rule reaching outward into its own module's adapter. */
public final class AdapterReachingRule {

	private AdapterReachingRule() {
	}

	public static boolean any(FixtureRepository repository) {
		return repository.count() > 0;
	}
}
