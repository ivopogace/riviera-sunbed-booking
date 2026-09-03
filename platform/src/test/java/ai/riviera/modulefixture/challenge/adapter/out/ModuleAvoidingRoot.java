package ai.riviera.modulefixture.challenge.adapter.out;

/** The control: a module-internal class that reads the same knob without naming a root type. */
public class ModuleAvoidingRoot {

	private final int queryTimeoutSeconds;

	public ModuleAvoidingRoot(int queryTimeoutSeconds) {
		this.queryTimeoutSeconds = queryTimeoutSeconds;
	}

	public int bound() {
		return queryTimeoutSeconds;
	}
}
