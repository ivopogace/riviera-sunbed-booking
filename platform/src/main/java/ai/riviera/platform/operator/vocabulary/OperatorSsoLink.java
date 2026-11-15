package ai.riviera.platform.operator.vocabulary;

import java.time.Instant;

/** One linked sign-in of an operator (#276): the OIDC issuer it came from and when it was linked. */
public record OperatorSsoLink(String issuer, Instant linkedAt) {
}
