package ai.riviera.platform.venue.application;

/**
 * One set a bulk beach-map save may not remove: where it sits, so the refusal can name it, and
 * the {@link SetLock live claim} that pins it — the same fact the owner's beach-map read shows
 * for that set before the click. Internal to the {@code venue} module (REST-only consumer), so it
 * lives in {@code application}, like {@link SetLock}.
 */
public record BlockedSet(PlacedSet set, SetLock lock) {
}
