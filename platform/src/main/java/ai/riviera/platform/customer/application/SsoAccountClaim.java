package ai.riviera.platform.customer.application;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;

/** The account an SSO email resolved to, and whether this transaction created it. */
public record SsoAccountClaim(CustomerAccountId accountId, boolean created) {
}
