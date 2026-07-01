/**
 * Published <strong>ports</strong> surface of the {@code customer} module (invariant #11) —
 * the {@link CustomerDirectory} "call-me" port only; the {@code GuestContact} value object
 * and {@code CustomerId} typed id live in the sibling {@code vocabulary} named interface
 * (issue #95). Exposed as a Spring Modulith named interface so the {@code booking} module
 * can resolve a guest into a {@code CustomerId} without reaching into customer's
 * {@code adapter.out} package.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.customer.api;
