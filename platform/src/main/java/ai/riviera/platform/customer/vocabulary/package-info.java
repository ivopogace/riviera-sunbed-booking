/**
 * Published <strong>vocabulary</strong> of the {@code customer} module (invariant #11, issue
 * #95) — the {@link CustomerId} typed id and the {@link GuestContact} value the directory
 * port speaks. Value types only — the port lives in the sibling {@code api} named interface.
 * Granted as {@code customer::vocabulary} to consumers per least privilege.
 */
@org.springframework.modulith.NamedInterface("vocabulary")
package ai.riviera.platform.customer.vocabulary;
