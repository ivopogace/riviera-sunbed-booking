/** The null-argument stand-in: grants {@code beta::spi} and only ever passes {@code null} for its gate. */
@org.springframework.modulith.ApplicationModule(allowedDependencies = { "beta::api", "beta::spi" })
package ai.riviera.grantfixture.gamma;
