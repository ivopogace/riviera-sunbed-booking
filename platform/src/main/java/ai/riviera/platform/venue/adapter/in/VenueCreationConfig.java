package ai.riviera.platform.venue.adapter.in;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import ai.riviera.platform.venue.application.VenueCreationProperties;

/**
 * Registers {@link VenueCreationProperties} (the platform's venue-creation terms) as the module's
 * configuration, following the module-local config precedent ({@code BookingSchedulingConfig}).
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(VenueCreationProperties.class)
class VenueCreationConfig {
}
