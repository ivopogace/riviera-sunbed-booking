package ai.riviera.platform.itinerary.adapter.in;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import ai.riviera.platform.itinerary.application.MoveBudget;

/** Binds {@link ItineraryProperties} and exposes it to the application layer as the plain {@link MoveBudget}. */
@Configuration
@EnableConfigurationProperties(ItineraryProperties.class)
class ItineraryConfig {

	@Bean
	MoveBudget moveBudget(ItineraryProperties properties) {
		return new MoveBudget(properties.maxSwitches());
	}
}
