package ai.riviera.platform.web.adapter.in;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

import ai.riviera.platform.venue.api.VenueCatalog;

/**
 * Serves the SPA shell, with its {@link ShellHead} spliced in, for home, a venue page and the private routes,
 * in the locale the URL's first segment names; every other client route keeps {@link SpaWebConfig}'s plain
 * fallback. An unknown first segment answers the source locale, a backend one ({@code api}, {@code actuator})
 * {@code 404}. Rendered per request and never cached, so a renamed or hidden venue previews as it is now.
 */
@Controller
class SpaShellController {

	private static final MediaType HTML = new MediaType(MediaType.TEXT_HTML, StandardCharsets.UTF_8);
	private static final String LOCALE = "locale";

	private final LinkPreviews previews;
	private final Map<SpaLocale, String> shells = new ConcurrentHashMap<>();

	SpaShellController(VenueCatalog catalog, @Value("${" + PublicOrigin.PROPERTY + ":}") String publicOrigin) {
		this.previews = new LinkPreviews(catalog, new PublicOrigin(publicOrigin));
	}

	@GetMapping({"/", "/{locale}/"})
	ResponseEntity<String> home(@PathVariable(name = LOCALE, required = false) String segment) {
		return serve(segment, previews::home);
	}

	@GetMapping({"/venues/{id}", "/{locale}/venues/{id}"})
	ResponseEntity<String> venue(@PathVariable(name = LOCALE, required = false) String segment,
			@PathVariable String id) {
		return serve(segment, locale -> previews.venue(locale, id));
	}

	/** Booking codes and account tokens ride these URLs (#7): {@code noindex}, nothing from the path echoed. */
	@GetMapping({"/booking/**", "/account/**", "/operator/**", "/admin/**", "/my-bookings",
			"/{locale}/booking/**", "/{locale}/account/**", "/{locale}/operator/**", "/{locale}/admin/**",
			"/{locale}/my-bookings"})
	ResponseEntity<String> privatePage(@PathVariable(name = LOCALE, required = false) String segment) {
		return serve(segment, locale -> ShellHead.privatePage());
	}

	private ResponseEntity<String> serve(String segment, Function<SpaLocale, ShellHead> head) {
		if (segment != null && SpaWebConfig.isBackendPath(segment + "/")) {
			return ResponseEntity.notFound().build();
		}
		SpaLocale locale = segment == null ? SpaLocale.EN : SpaLocale.ofSubPath(segment).orElse(SpaLocale.EN);
		return shell(locale)
				.map(html -> ResponseEntity.ok().contentType(HTML).cacheControl(CacheControl.noCache())
						.body(head.apply(locale).applyTo(html)))
				.orElseGet(() -> ResponseEntity.notFound().build());
	}

	/** The locale's built {@code index.html}, read once; empty while there is no build (as the fallback 404s). */
	private Optional<String> shell(SpaLocale locale) {
		return Optional.ofNullable(shells.computeIfAbsent(locale, SpaShellController::read));
	}

	private static String read(SpaLocale locale) {
		Resource index = locale.index();
		if (!index.exists()) {
			return null;
		}
		try {
			return index.getContentAsString(StandardCharsets.UTF_8);
		}
		catch (IOException unreadable) {
			throw new UncheckedIOException(unreadable);
		}
	}
}
