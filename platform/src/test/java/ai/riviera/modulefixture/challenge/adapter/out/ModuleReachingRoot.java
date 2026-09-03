package ai.riviera.modulefixture.challenge.adapter.out;

import ai.riviera.modulefixture.RootShapedType;

/** The violation: a module-internal class injecting a composition-root type. */
public class ModuleReachingRoot {

	private final RootShapedType queryTimeout;

	public ModuleReachingRoot(RootShapedType queryTimeout) {
		this.queryTimeout = queryTimeout;
	}

	public int bound() {
		return queryTimeout.seconds();
	}
}
