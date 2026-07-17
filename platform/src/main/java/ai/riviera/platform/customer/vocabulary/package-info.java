/**
 * Published <strong>vocabulary</strong> of the {@code customer} module (invariant #11, issue
 * #95) — the {@link CustomerId} typed id and {@link GuestContact} value the guest-contact port
 * speaks, plus (S2, epic #108) the account types {@link CustomerAccountId},
 * {@link CustomerAccountCredential}, the sealed {@link RegistrationOutcome}, and (S4, #112) the
 * {@link SsoProvider} enum the SSO provisioning port speaks. Value types only — the ports live in the
 * sibling {@code api} named interface. Granted as {@code customer::vocabulary} to consumers per least
 * privilege.
 */
@org.springframework.modulith.NamedInterface("vocabulary")
package ai.riviera.platform.customer.vocabulary;
