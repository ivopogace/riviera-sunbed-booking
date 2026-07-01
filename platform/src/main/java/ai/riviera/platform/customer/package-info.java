/**
 * Customer bounded context — light tourist identity / guest-checkout contact.
 * Aggregate root: {@code Customer}.
 *
 * <p>Thin-module layout (ADR-0007): the module has no application service — its
 * {@code api} port is implemented directly by a JDBC adapter — so it takes the thin
 * template: {@code api} + {@code vocabulary} + {@code adapter.out}, with no {@code application} and no
 * {@code domain}.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Customer",
    allowedDependencies = {}
)
package ai.riviera.platform.customer;
