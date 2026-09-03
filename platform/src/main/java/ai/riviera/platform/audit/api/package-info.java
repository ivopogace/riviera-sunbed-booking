/**
 * Published <strong>ports</strong> surface of the {@code audit} module (invariant #11) —
 * "call-me" interfaces only. It holds exactly one:
 * {@link ai.riviera.platform.audit.api.AdminAuditLog}, the whole conversation about the trail
 * (record this action, hand me the latest ones). The entry it answers in lives in the sibling
 * {@code vocabulary} named interface. Granted as {@code audit::api} to the composition root, whose
 * fence records through it, and to nothing else.
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.audit.api;
