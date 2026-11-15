package ai.riviera.platform.auth.api;

import java.util.Optional;

import org.springframework.security.core.Authentication;

/**
 * The metrics scraper's bearer token (ADR-0032): a presented token that matches a configured hash yields an
 * authentication holding {@code ROLE_METRICS} alone; anything else, including every token while no hash is
 * configured, yields empty. No session is ever created from it.
 */
public interface ScrapeCredentials {

	Optional<Authentication> authenticate(String presentedToken);
}
