package ai.riviera.platform;

import java.util.function.Supplier;

import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.csrf.CsrfTokenRequestHandler;
import org.springframework.security.web.csrf.XorCsrfTokenRequestAttributeHandler;
import org.springframework.util.StringUtils;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * The Spring Security reference SPA CSRF handler (issue #109, from the framework's documented
 * single-page-application recipe): BREACH protection ({@link XorCsrfTokenRequestAttributeHandler})
 * for anything that renders the token, while the {@code X-XSRF-TOKEN} header the SPA copies from
 * the {@code XSRF-TOKEN} cookie is resolved <em>plain</em> — the cookie value is the raw token, so
 * XOR-decoding a header echoed from it would always fail. {@link #handle} also renders the
 * deferred token on every dispatch, which makes {@code CookieCsrfTokenRepository} (re)write the
 * cookie without a dedicated rendering filter.
 */
final class SpaCsrfTokenRequestHandler implements CsrfTokenRequestHandler {

	private final CsrfTokenRequestHandler plain = new CsrfTokenRequestAttributeHandler();
	private final CsrfTokenRequestHandler xor = new XorCsrfTokenRequestAttributeHandler();

	@Override
	public void handle(HttpServletRequest request, HttpServletResponse response,
			Supplier<CsrfToken> csrfToken) {
		this.xor.handle(request, response, csrfToken);
		// Render the token every request: the cookie repository then issues/refreshes XSRF-TOKEN
		// so the SPA can bootstrap from any response (pinned by CsrfProtectionIT).
		csrfToken.get();
	}

	@Override
	public String resolveCsrfTokenValue(HttpServletRequest request, CsrfToken csrfToken) {
		String headerValue = request.getHeader(csrfToken.getHeaderName());
		return (StringUtils.hasText(headerValue) ? this.plain : this.xor)
				.resolveCsrfTokenValue(request, csrfToken);
	}
}
