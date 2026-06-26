package ai.riviera.platform;

import org.junit.jupiter.api.extension.ConditionEvaluationResult;
import org.junit.jupiter.api.extension.ExecutionCondition;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.testcontainers.DockerClientFactory;

/**
 * JUnit 5 condition behind {@link EnabledIfDockerAvailable}. Evaluated before the
 * Spring context is created, so a missing Docker daemon skips the test cleanly
 * instead of failing it on container startup.
 */
class DockerAvailableCondition implements ExecutionCondition {

	@Override
	public ConditionEvaluationResult evaluateExecutionCondition(ExtensionContext context) {
		try {
			if (DockerClientFactory.instance().isDockerAvailable()) {
				return ConditionEvaluationResult.enabled("Docker is available");
			}
		}
		catch (Throwable ex) {
			// treat any probe failure as "no Docker"
		}
		return ConditionEvaluationResult.disabled(
				"Docker not available — skipping Testcontainers integration test");
	}
}
