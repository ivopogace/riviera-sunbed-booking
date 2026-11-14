package ai.riviera.platform.venue.vocabulary;

/**
 * A tourist-visible venue as a shared link previews it: its name, beach, the operator's description and
 * the cover's baseline banner serving URL (path only; the caller makes it absolute). Nullable:
 * {@code description}, {@code coverUrl}.
 */
public record VenueLinkPreview(String name, Beach beach, String description, String coverUrl) {
}
