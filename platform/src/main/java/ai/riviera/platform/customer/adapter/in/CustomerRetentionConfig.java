package ai.riviera.platform.customer.adapter.in;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

import ai.riviera.platform.customer.application.RetentionWindow;

/**
 * Binds {@link CustomerRetentionProperties} and maps it to the application-layer {@link RetentionWindow}
 * value, keeping the configuration type at the adapter edge.
 *
 * <p>Must stay <strong>unconditional</strong>: the sweep {@code @Service} always needs its window;
 * only the scheduler is gated on {@code customer.retention.enabled} (off by default).
 * {@code @EnableScheduling} is here so {@code customer} never relies on {@code booking}'s config.
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
