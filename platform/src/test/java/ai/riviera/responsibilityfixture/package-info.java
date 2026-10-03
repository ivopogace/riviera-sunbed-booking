/**
 * Fixtures for {@code ResponsibilitiesArchitectureTests}' negative proofs, so each rule's
 * violation collector is shown to fire without breaking production code. Test-scope only; never
 * imported by production classes. Same mechanism as {@code ai.riviera.placementfixture}.
 * <ul>
 * <li>Violations: classes under {@code rogue} and the aggregate-carrying event under
 * {@code provider}, each breaking one machine-checkable clause of {@code RESPONSIBILITIES.md}.</li>
 * <li>Controls: classes under a real module's name, plus the typed id under {@code provider},
 * that the same rules must NOT flag; without them a rule rejecting every reference would look
 * green.</li>
 * </ul>
 */
package ai.riviera.responsibilityfixture;
