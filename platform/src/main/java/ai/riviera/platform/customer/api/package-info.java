/**
 * Published <strong>ports</strong> surface of the {@code customer} module (invariant #11) — "call-me"
 * interfaces only: the guest-contact {@link CustomerDirectory} / {@link CustomerLookup}, and (S2, epic
 * #108) the account ports {@link CustomerAccounts} (credential read for the edge's customer
 * {@code UserDetailsService}) + {@link CustomerAccountProvisioning} (registration). The value types
 * these ports speak ({@code GuestContact}, {@code CustomerId}, {@code CustomerAccountCredential},
 * {@code RegistrationOutcome}, {@code CustomerAccountId}) live in the sibling {@code vocabulary} named
 * interface (issue #95). Login itself (encoding/verifying) stays at the platform edge; this module
 * only stores the opaque credential hash.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.customer.api;
