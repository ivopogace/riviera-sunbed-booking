package ai.riviera.platform.auth.adapter.in;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.operator.api.OperatorLanguage;
import ai.riviera.platform.shared.SiteLocale;

/**
 * The signed-in operator's own language, which its account mail is written in: the console's language row
 * stores each pick here. Operator-only at the chain ({@code SecurityConfig}), as it writes the row the
 * principal names; {@code operator} stays the row's writer, through {@link OperatorLanguage}.
 */
@RestController
class OperatorLanguageController {

	private final OperatorLanguage language;

	OperatorLanguageController(OperatorLanguage language) {
		this.language = language;
	}

	/** Wire DTO: a served locale's code; anything else fails deserialization → {@code 400 INVALID_REQUEST}. */
	record LocaleRequest(String locale) {

		LocaleRequest {
			if (SiteLocale.ofCode(locale).isEmpty()) {
				throw new IllegalArgumentException("locale must be a served locale's code");
			}
		}

		SiteLocale siteLocale() {
			return SiteLocale.fromCode(locale);
		}
	}

	/** {@code 204} once stored; the session's name always has a row, as its credential stamp re-reads it. */
	@PutMapping("/api/auth/operator/locale")
	ResponseEntity<Void> setLocale(@RequestBody LocaleRequest request, Authentication authentication) {
		language.setLocale(authentication.getName(), request.siteLocale());
		return ResponseEntity.noContent().build();
	}
}
