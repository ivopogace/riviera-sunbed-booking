/**
 * Published <strong>ports</strong> surface of the {@code customer} module (invariant #11) — "call-me"
 * interfaces only: the guest-contact {@link CustomerDirectory} / {@link CustomerLookup}, the account
 * ports {@link CustomerAccounts} (credential read for the edge's customer
 * {@code UserDetailsService}) + {@link CustomerAccountProvisioning} (registration) +
 * {@link SsoAccountProvisioning} (resolve-or-create the account behind an external SSO identity),
 * {@link CustomerAccountRecovery} (email-verification + password-recovery token lifecycle +
 * authenticated set-password), and {@link AccountErasure} (right-to-erasure: scrub-in-place of
 * account + guest-contact PII and, through {@code customer.spi.ReviewErasure}, the subject's review PII,
 * retaining the statutory-retention financial rows). The value types these
 * ports speak ({@code GuestContact}, {@code CustomerId},
 * {@code CustomerAccountCredential}, {@code RegistrationOutcome}, {@code CustomerAccountId},
 * {@code SsoProvider}, {@code VerifyEmailOutcome}, {@code ResetPasswordOutcome}) live in the sibling
 * {@code vocabulary} named interface. Login and all credential-material transformation
 * (password encoding/verifying, token hashing, the OIDC redirect/token exchange) stay at the platform
 * edge; this module only stores the account identity, the opaque credential hash, and the opaque token
 * digests.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.customer.api;
