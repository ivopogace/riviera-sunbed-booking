package ai.riviera.responsibilityfixture.provider.domain;

/**
 * A mutable domain aggregate — the kind of type an event payload must never carry
 * (Need-To-Know, invariant #11). Referenced by the fixture event record so
 * {@code ResponsibilitiesArchitectureTests}' id-based-events rule can be proven to fire.
 */
public final class FakeAggregate {

	private String mutableState;

	public String mutableState() {
		return mutableState;
	}

	public void changeState(String newState) {
		this.mutableState = newState;
	}
}
