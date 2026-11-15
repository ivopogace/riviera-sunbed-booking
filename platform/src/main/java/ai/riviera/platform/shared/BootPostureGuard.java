package ai.riviera.platform.shared;

import java.util.Optional;

import org.springframework.core.env.Environment;

/**
 * A module's fence on the mock or dev default it ships (ADR-0031): a bean under the profile expression meaning
 * "this boot would run it unmarked", answering what a deployable boot still lacks. {@code BootPostureCheck}
 * aborts once with every gap before any other bean is created, so an implementation is built with no
 * dependency injection: a no-argument constructor, reading configuration from the {@code environment} it is given.
 */
public interface BootPostureGuard {

	/** What this boot lacks and how to supply it, or empty when it has it. */
	Optional<String> gap(Environment environment);
}
