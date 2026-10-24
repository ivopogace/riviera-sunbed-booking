package ai.riviera.platform.notification.vocabulary;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.stream.Collectors;

import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.web.util.UriUtils;

/**
 * Builds an emailed link on an origin {@link EmailedLinkOrigin} accepted, taken as already encoded: only the appended
 * path segments and query are encoded, so an escape in the origin's path is kept, never doubled. Mutable: start
 * each link with {@link #on}. A booking code or token it carries is a bearer credential: never log the
 * link (invariant #7). Placement: RESPONSIBILITIES.md §notification.
 */
public final class EmailedLink {

	private final UriComponentsBuilder builder;

	private EmailedLink(String origin) {
		this.builder = UriComponentsBuilder.fromUriString(URI.create(origin).toASCIIString());
	}

	/** A link on {@code origin} as {@link EmailedLinkOrigin#require} returned it. */
	public static EmailedLink on(String origin) {
		return new EmailedLink(origin);
	}

	/** Appends {@code /seg1/seg2…}, each segment encoded whole ({@code /} included); none appends {@code /}. */
	public EmailedLink path(String... segments) {
		builder.path(Arrays.stream(segments)
				.map(segment -> UriUtils.encodePathSegment(segment, StandardCharsets.UTF_8))
				.collect(Collectors.joining("/", "/", "")));
		return this;
	}

	/** Appends {@code name=value}, both encoded as a query parameter ({@code &} and {@code =} included). */
	public EmailedLink query(String name, Object value) {
		builder.queryParam(UriUtils.encodeQueryParam(name, StandardCharsets.UTF_8),
				UriUtils.encodeQueryParam(String.valueOf(value), StandardCharsets.UTF_8));
		return this;
	}

	public URI toUri() {
		return builder.build(true).toUri();
	}
}
