/**
 * Customer bounded context — light tourist identity / guest-checkout contact.
 * Aggregate root: {@code Customer}.
 *
 * <p>Hexagonal layout (invariant #11): {@code api}, {@code application.in/out},
 * {@code domain}, {@code infrastructure.in/out}.
 */
@org.springframework.modulith.ApplicationModule(displayName = "Customer")
package ai.riviera.platform.customer;
