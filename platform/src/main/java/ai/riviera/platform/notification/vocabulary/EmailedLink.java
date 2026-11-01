package ai.riviera.platform.notification.vocabulary;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.web.util.UriComponentsBuilder;
import org.springframework.web.util.UriUtils;

/**
 * Builds an emailed link on an origin {@link EmailedLinkOrigin} accepted, taken as already encoded: only the appended
 * path segments and query are encoded, so an escape in the origin's path is kept, never doubled. Immutable: each step
 * returns a new link. A booking code or token it carries is a bearer credential: never log the
 * link (invariant #7). Placement: RESPONSIBILITIES.md §notification.
 */
public final class EmailedLink {

	private final String origin;
	private final List<String> paths;
	private final List<QueryParam> query;

	private EmailedLink(String origin, List<String> paths, List<QueryParam> query) {
		this.origin = origin;
		this.paths = paths;
		this.query = query;
	}

	/** A link on {@code origin} as {@link EmailedLinkOrigin#require} returned it. */
	public static EmailedLink on(String origin) {
		return new EmailedLink(URI.create(origin).toASCIIString(), List.of(), List.of());
	}

	/** Appends {@code /seg1/seg2…}, each segment encoded whole ({@code /} included); none appends {@code /}. */
	public EmailedLink path(String... segments) {
		String encoded = Arrays.stream(segments)
				.map(segment -> UriUtils.encodePathSegment(segment, StandardCharsets.UTF_8))
				.collect(Collectors.joining("/", "/", ""));
		return new EmailedLink(origin, plus(paths, encoded), query);
	}

	/** Appends {@code name=value}, both encoded as a query parameter ({@code &} and {@code =} included). */
	public EmailedLink query(String name, Object value) {
		QueryParam param = new QueryParam(UriUtils.encodeQueryParam(name, StandardCharsets.UTF_8),
				UriUtils.encodeQueryParam(String.valueOf(value), StandardCharsets.UTF_8));
		return new EmailedLink(origin, paths, plus(query, param));
	}

	public URI toUri() {
		UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(origin);
		paths.forEach(builder::path);
		query.forEach(param -> builder.queryParam(param.name(), param.value()));
		return builder.build(true).toUri();
	}

	private static <T> List<T> plus(List<T> list, T item) {
		return Stream.concat(list.stream(), Stream.of(item)).toList();
	}

	private record QueryParam(String name, String value) {
	}
}
