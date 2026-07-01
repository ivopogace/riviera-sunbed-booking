package ai.riviera.responsibilityfixture.provider.events;

import ai.riviera.responsibilityfixture.provider.domain.FakeAggregate;
import ai.riviera.responsibilityfixture.provider.vocabulary.FixtureId;

/**
 * An event record smuggling a mutable domain aggregate into its payload — the violation of
 * invariant #11's Need-To-Know rule that {@code ResponsibilitiesArchitectureTests}' id-based
 * events rule must reject. The {@code id} and {@code amountMinor} components are legitimate
 * (vocabulary type / primitive) and must NOT be flagged, proving the allow path too.
 */
public record AggregateCarryingEvent(FixtureId id, FakeAggregate aggregate, long amountMinor) {
}
