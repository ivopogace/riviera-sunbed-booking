package ai.riviera.rootfixture;

import java.time.Clock;

/**
 * The control: a composition-root stand-in that configures the application from the JDK and reaches no
 * module, as {@code TimeConfig} does.
 */
public class RootReachingNoModule {

	public Clock clock() {
		return Clock.systemUTC();
	}
}
