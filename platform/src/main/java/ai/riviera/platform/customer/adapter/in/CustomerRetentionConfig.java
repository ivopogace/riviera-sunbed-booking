package ai.riviera.platform.customer.adapter.in;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

import ai.riviera.platform.customer.application.RetentionWindow;

/**
 * Binds {@link CustomerRetentionProperties} and maps it to the application-layer {@link RetentionWindow}
 * value, keeping the configuration type at the adapter edge and the inner hexagon framework-light (the
 * {@code RequestProperties → RequestWindows} pattern).
 *
 * <p>Deliberately <strong>unconditional</strong>, unlike the scheduler it accompanies: the retention sweep
 * service is an ordinary {@code @Service}, so its {@link RetentionWindow} must always be constructible.
 * Only the scheduler that <em>fires</em> the sweep is gated on {@code customer.retention.enabled}, which is
 * what makes the job inert by default.
 *
 * <p>{@code @EnableScheduling} is declared here so {@code customer}'s scheduling is self-sufficient rather
 * than relying on {@code booking}'s config being loaded; the annotation is idempotent across configurations.
 */
@Configuration
@EnableScheduling
@EnableConfigurationProperties(CustomerRetentionProperties.class)
class CustomerRetentionConfig {

	@Bean
	RetentionWindow retentionWindow(CustomerRetentionProperties properties) {
		return new RetentionWindow(properties.window(), properties.batchSize());
	}
}
