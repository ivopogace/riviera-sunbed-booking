/**
 * Published <strong>vocabulary</strong> of the {@code customer} module (#11), value types only (the
 * ports live in the sibling {@code api} named interface): the guest-contact {@link CustomerId} and
 * {@link GuestContact}; account types {@link CustomerAccountId}, {@link CustomerAccountCredential},
 * {@link SsoProvider} and the sealed {@link RegistrationOutcome}; the recovery port's sealed
 * {@link VerifyEmailOutcome} / {@link ResetPasswordOutcome}; the erasure port's
 * {@link EraseOutcome}. Granted as {@code customer::vocabulary} to consumers per least privilege.
 */
@org.springframework.modulith.NamedInterface("vocabulary")
package ai.riviera.platform.customer.vocabulary;
