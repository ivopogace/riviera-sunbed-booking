package ai.riviera.platform.web.adapter.in;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.server.ResponseStatusException;

import ai.riviera.platform.venue.api.VenueCatalog;

/**
 * Serves the SPA shell, with its {@link ShellHead} spliced in, for home, a venue page and the private routes,
 * in the locale a two-letter first segment names ({@link #LOCALE_SEGMENT}, so {@code /api} and {@code /actuator}
 * never match); every other client route keeps {@link SpaWebConfig}'s plain fallback. An unknown two-letter
 * segment answers the source locale. Rendered per request and never cached, so a hidden venue previews as hidden.
 */
@Controller
@EnableConfigurationProperties(PublicWebProperties.class)
class SpaShellController {

	/** A translated locale's subpath: two lowercase letters, as every {@link SpaLocale} has ({@code SpaLocaleTest}). */
	static final String LOCALE_SEGMENT = "/{locale:[a-z][a-z]}";

	private static final MediaType HTML = new MediaType(MediaType.TEXT_HTML, StandardCharsets.UTF_8);
	private static final String LOCALE = "locale";

	private final LinkPreviews previews;
	private final Map<SpaLocale, String> shells = new ConcurrentHashMap<>();

	SpaShellController(VenueCatalog catalog, PublicWebProperties properties) {
		this.previews = new LinkPreviews(catalog, properties);
	}

	@GetMapping({"/", LOCALE_SEGMENT + "/"})
	ResponseEntity<String> home(@PathVariable(name = LOCALE, required = false) String segment) {
		return serve(segment, previews::home);
	}

	@GetMapping({"/venues/{id}", LOCALE_SEGMENT + "/venues/{id}"})
	ResponseEntity<String> venue(@PathVariable(name = LOCALE, required = false) String segment,
			@PathVariable String id) {
		return serve(segment, locale -> previews.venue(locale, id));
	}

	/**
	 * Booking codes and account tokens ride these URLs (#7): {@code noindex}, nothing from the path echoed. The
	 * same routes as {@code RobotsTxt.PRIVATE_SPA_PATHS} ({@code SpaShellControllerTest} pins it).
	 */
	@GetMapping({"/account/**", "/admin/**", "/booking/**", "/my-bookings/**", "/operator/**", "/venue-admin/**",
			LOCALE_SEGMENT + "/account/**", LOCALE_SEGMENT + "/admin/**", LOCALE_SEGMENT + "/booking/**",
			LOCALE_SEGMENT + "/my-bookings/**", LOCALE_SEGMENT + "/operator/**", LOCALE_SEGMENT + "/venue-admin/**"})
	ResponseEntity<String> privatePage(@PathVariable(name = LOCALE, required = false) String segment) {
		return serve(segment, locale -> ShellHead.privatePage());
	}

	private ResponseEntity<String> serve(String segment, Function<SpaLocale, ShellHead> head) {
		SpaLocale locale = segment == null ? SpaLocale.EN : SpaLocale.ofSubPath(segment).orElse(SpaLocale.EN);
		String shell = shell(locale).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
		return ResponseEntity.ok().contentType(HTML).cacheControl(CacheControl.noCache())
				.body(head.apply(locale).applyTo(shell));
	}

	/** The locale's built {@code index.html}, read once; empty while there is no build (the {@code NOT_FOUND} problem). */
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
