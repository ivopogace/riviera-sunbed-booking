package ai.riviera.platform;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.junit.jupiter.api.extension.ExtendWith;

/**
 * Enables the annotated test only when a Docker daemon is reachable. Lets
 * Testcontainers-backed integration tests run in CI (and any machine with Docker)
 * while being skipped — not failed — where no daemon is available.
 */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@ExtendWith(DockerAvailableCondition.class)
public @interface EnabledIfDockerAvailable {
}
