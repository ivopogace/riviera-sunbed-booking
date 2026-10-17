/**
 * Fixtures for {@code TestContextDriftArchitectureTests}: one class restating a {@code SharedTestProperties}
 * value, one opting out of it, so the rule is proven to fire and to stay quiet without touching a real
 * test class. Test scope only; never run as tests (no test methods) and never imported by production code.
 */
package ai.riviera.driftfixture;
