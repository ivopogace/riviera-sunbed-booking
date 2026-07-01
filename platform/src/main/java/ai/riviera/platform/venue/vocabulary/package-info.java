/**
 * Published <strong>vocabulary</strong> of the {@code venue} module (invariant #11, issue
 * #95) — the typed ids ({@link VenueId}, {@link SetId}) and value records the module's
 * ports speak in. Value types only, never ports ("call-me" interfaces live in the sibling
 * {@code api} named interface; the cross-module driven port in {@code spi}). Granted as
 * {@code venue::vocabulary} to consumers per least privilege.
 */
@org.springframework.modulith.NamedInterface("vocabulary")
package ai.riviera.platform.venue.vocabulary;
