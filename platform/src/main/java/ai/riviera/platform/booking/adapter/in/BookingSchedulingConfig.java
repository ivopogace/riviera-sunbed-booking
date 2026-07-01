package ai.riviera.platform.booking.adapter.in;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Enables the {@code booking} module's scheduling — the abandoned-payment TTL sweep (issue #51) —
 * and binds its {@link AbandonedPaymentProperties}. Gated to the {@code stripe} profile: only there
 * do bookings linger in {@code AWAITING_PAYMENT} (under the default stub profile collection succeeds
 * synchronously, so there is nothing to sweep). Keeping {@code @EnableScheduling} profile-scoped also
 * keeps the scheduler out of default-profile tests. Package-private config inside the module
 * (invariant #11).
 */
@Configuration
@Profile("stripe")
@EnableScheduling
@EnableConfigurationProperties(AbandonedPaymentProperties.class)
class BookingSchedulingConfig {
}
