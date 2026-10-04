/** The consumer stand-in: grants itself every {@code beta} surface, uses all but {@code events}. */
@org.springframework.modulith.ApplicationModule(
	allowedDependencies = { "beta::api", "beta::vocabulary", "beta::spi", "beta::events" }
)
package ai.riviera.grantfixture.alpha;
