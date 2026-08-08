/**
 * Published <strong>vocabulary</strong> of the {@code customer} module (invariant #11) — the
 * {@link CustomerId} typed id and {@link GuestContact} value the guest-contact port speaks, plus
 * the account types {@link CustomerAccountId}, {@link CustomerAccountCredential}, the sealed
 * {@link RegistrationOutcome}, and the {@link SsoProvider} enum the SSO provisioning port speaks,
 * plus the sealed {@link VerifyEmailOutcome} / {@link ResetPasswordOutcome} the recovery port
 * returns, plus the {@link EraseOutcome} enum the erasure port returns. Value types only —
 * the ports live in the sibling {@code api} named interface. Granted as {@code customer::vocabulary} to
 * consumers per least privilege.
 */
@org.springframework.modulith.NamedInterface("vocabulary")
package ai.riviera.platform.customer.vocabulary;
