package ai.riviera.platform.payment.adapter.in;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Enables {@code payment}'s own scheduling, so its sweep does not lean on another module's configuration. */
@Configuration
@Profile("collecting-gateway")
@EnableScheduling
class PaymentSchedulingConfig {
}
