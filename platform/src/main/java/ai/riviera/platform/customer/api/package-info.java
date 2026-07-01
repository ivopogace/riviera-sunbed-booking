/**
 * Published surface of the {@code customer} module (invariant #11) — the
 * {@link ai.riviera.platform.customer.api.CustomerDirectory} port plus its
 * {@link ai.riviera.platform.customer.api.GuestContact} value object and
 * {@link ai.riviera.platform.customer.api.CustomerId}. Exposed as a Spring Modulith named
 * interface so the {@code booking} module can resolve a guest into a {@code CustomerId}
 * without reaching into customer's {@code adapter.out} package.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.customer.api;
