package ai.riviera.platform.challenge.adapter.in;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

import ai.riviera.platform.challenge.application.AltchaProperties;

/**
 * Binds {@link AltchaProperties} at the module's own edge (the {@code CustomerRetentionConfig}
 * pattern). Rationale: {@code RESPONSIBILITIES.md} § {@code challenge}.
 *
 * <p>{@code @EnableScheduling} is declared here so the module's sweep is self-sufficient rather than
 * relying on another module's config being loaded; the annotation is idempotent across configurations.
 */
@Configuration
@EnableScheduling
@EnableConfigurationProperties(AltchaProperties.class)
class ChallengeConfig {
}
