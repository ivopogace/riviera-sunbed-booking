package ai.riviera.platform.booking.adapter.in;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import ai.riviera.platform.booking.application.remodel.RemodelWindows;

/**
 * Binds {@link RemodelProperties} and exposes it to the application layer as the plain
 * {@link RemodelWindows} value, the way {@code BookingRequestConfig} binds the request windows.
 * Package-private config inside the module (invariant #11).
 */
@Configuration
@EnableConfigurationProperties(RemodelProperties.class)
class RemodelConfig {

	@Bean
	RemodelWindows remodelWindows(RemodelProperties properties) {
		return new RemodelWindows(properties.freezeWindow(), properties.refundNoticeFloor());
	}
}
