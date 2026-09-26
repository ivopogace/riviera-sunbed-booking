/**
 * Published "call-me" <strong>ports</strong> of the {@code customer} module (invariant #11): guest
 * contact ({@link CustomerDirectory}, {@link CustomerLookup}), account ({@link CustomerAccounts},
 * {@link CustomerAccountProvisioning}, {@link SsoAccountProvisioning}, {@link CustomerAccountRecovery})
 * and {@link AccountErasure} (scrub in place, financial rows retained; ADR-0010). Their value types
 * live in {@code vocabulary}. Login and all credential-material transformation (password encoding,
 * token hashing, the OIDC exchange) stay at the edge; this module stores only opaque hashes and digests.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.customer.api;
