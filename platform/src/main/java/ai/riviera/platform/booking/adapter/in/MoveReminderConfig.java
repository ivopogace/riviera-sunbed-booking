package ai.riviera.platform.booking.adapter.in;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Binds {@link MoveReminderProperties}; scheduling itself is enabled by {@code BookingRequestConfig} in
 * every profile. Bound unconditionally so a context that opts the sweep out still boots with the
 * shipped keys. Package-private config inside the module (invariant #11).
 */
@Configuration
@EnableConfigurationProperties(MoveReminderProperties.class)
class MoveReminderConfig {
}
