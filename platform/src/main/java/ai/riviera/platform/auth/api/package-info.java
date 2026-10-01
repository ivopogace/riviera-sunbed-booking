/**
 * Published <strong>ports</strong> surface of the {@code auth} module (invariant #11): "call-me" interfaces
 * only. {@link ai.riviera.platform.auth.api.SessionCredentials} is the per-request stamp check the security
 * chain's filter calls; {@link ai.riviera.platform.auth.api.SessionRevocation} ends a principal's sessions.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.auth.api;
