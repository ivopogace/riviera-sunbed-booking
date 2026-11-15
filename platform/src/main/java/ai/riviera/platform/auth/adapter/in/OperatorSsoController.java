package ai.riviera.platform.auth.adapter.in;

import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.auth.api.SessionRevocation;
import ai.riviera.platform.auth.application.PasswordPolicy;
import ai.riviera.platform.auth.application.SsoAuthorization;
import ai.riviera.platform.auth.application.SsoGateway;
import ai.riviera.platform.auth.application.SsoProviders;
import ai.riviera.platform.customer.vocabulary.SsoProvider;
import ai.riviera.platform.operator.api.OperatorAccounts;
import ai.riviera.platform.operator.api.OperatorDirectory;
import ai.riviera.platform.operator.api.OperatorSsoLinks;
import ai.riviera.platform.operator.vocabulary.OperatorCredential;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.SsoUnlinkOutcome;
import ai.riviera.platform.shared.ApiProblem;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Operator SSO, link-only (#276): the anonymous sign-in authorize, and the signed-in operator's own sign-in methods:
 * link (proving the current password, ASVS 7.5.1), list and unlink (ending every other session, ASVS 7.4.3). The
 * env-managed bootstrap admin may not link. The callback is {@link SsoController}'s, completed by
 * {@link OperatorSsoCallback}. Rationale: RESPONSIBILITIES.md §auth.
 */
@RestController
class OperatorSsoController {

	private static final String SSO_PATH = "/api/auth/operator/sso";

	private final SsoFlow flow;
	private final OperatorSsoLinks links;
	private final OperatorAccounts accounts;
	private final OperatorDirectory directory;
	private final PasswordEncoder passwordEncoder;
	private final SessionRevocation sessionRevoker;
	private final RivieraOperatorProperties bootstrapOperator;

	OperatorSsoController(SsoGateway ssoGateway, OperatorSsoLinks links, OperatorAccounts accounts,
			OperatorDirectory directory, PasswordEncoder passwordEncoder, SessionRevocation sessionRevoker,
			RivieraOperatorProperties bootstrapOperator) {
		this.flow = new SsoFlow(ssoGateway);
		this.links = links;
		this.accounts = accounts;
		this.directory = directory;
		this.passwordEncoder = passwordEncoder;
		this.sessionRevoker = sessionRevoker;
		this.bootstrapOperator = bootstrapOperator;
	}

	/** Wire DTO for starting a link: the current password, verified before any round trip starts, and the build's locale. */
	record LinkRequest(String currentPassword, String locale) {

		@Override
		public String toString() {
			return "LinkRequest[redacted]";
		}
	}

	/** Where the SPA sends the browser to complete a link. */
	record LinkStart(URI authorizeUrl) {
	}

	/** One linked sign-in, by provider slug. */
	record SignInMethod(String provider, Instant linkedAt) {
	}

	@GetMapping(SSO_PATH + "/{provider}/authorize")
	ResponseEntity<Void> authorize(@PathVariable String provider,
			@RequestParam(name = "locale", required = false) String locale, HttpServletRequest request) {
		URI authorizeUrl = flow.begin(request, SsoProviders.parse(provider), SsoAuthorization.Audience.OPERATOR,
				SsoAuthorization.Intent.SIGN_IN, null, locale);
		return ResponseEntity.status(HttpStatus.FOUND).location(authorizeUrl).build();
	}

	/**
	 * Codes: {@code BOOTSTRAP_CREDENTIAL_MANAGED} and, on the mock IdP, {@code ADMIN_LINK_REFUSED_ON_MOCK_IDP} 409;
	 * {@code MISSING_/INVALID_CURRENT_PASSWORD} 400.
	 */
	@PostMapping(SSO_PATH + "/{provider}/link")
	ResponseEntity<?> link(@PathVariable String provider, @RequestBody LinkRequest body,
			Authentication authentication, HttpServletRequest request) {
		SsoProvider parsed = SsoProviders.parse(provider);
		String username = authentication.getName();
		if (bootstrapOperator.username().equals(username)) {
			return ApiProblem.response(HttpStatus.CONFLICT, "BOOTSTRAP_CREDENTIAL_MANAGED",
					"This account's sign-in is managed by the deployment environment and cannot be linked.");
		}
		Optional<OperatorCredential> credential = accounts.findByUsername(username);
		if (flow.cooperative() && credential.filter(OperatorCredential::admin).isPresent()) {
			return ApiProblem.response(HttpStatus.CONFLICT, "ADMIN_LINK_REFUSED_ON_MOCK_IDP",
					"An admin account cannot link the demo sign-in, which anyone can use.");
		}
		if (!PasswordPolicy.isSupplied(body.currentPassword())) {
			return ApiProblem.response(HttpStatus.BAD_REQUEST, "MISSING_CURRENT_PASSWORD",
					"The request carries no current password.");
		}
		if (credential.isEmpty() || credential.get().passwordHash() == null
				|| !passwordEncoder.matches(body.currentPassword(), credential.get().passwordHash())) {
			return ApiProblem.response(HttpStatus.BAD_REQUEST, "INVALID_CURRENT_PASSWORD",
					"The current password is incorrect.");
		}
		OperatorId operator = directory.requireOperator(username);
		return ResponseEntity.ok(new LinkStart(flow.begin(request, parsed, SsoAuthorization.Audience.OPERATOR,
				SsoAuthorization.Intent.LINK, new SsoAuthorization.Linking(operator.value(), username),
				body.locale())));
	}

	@GetMapping(SSO_PATH)
	List<SignInMethod> signInMethods(Authentication authentication) {
		OperatorId operator = directory.requireOperator(authentication.getName());
		return links.links(operator).stream()
				.flatMap(link -> SsoProviders.forIssuer(link.issuer()).stream()
						.map(provider -> new SignInMethod(SsoProviders.slug(provider), link.linkedAt())))
				.toList();
	}

	/**
	 * Revoke every other session before and after the delete, as the password change does; {@code 409 LAST_CREDENTIAL}
	 * when it is the only way left to sign in, {@code 204} when nothing was linked.
	 */
	@DeleteMapping(SSO_PATH + "/{provider}")
	ResponseEntity<?> unlink(@PathVariable String provider, Authentication authentication,
			HttpServletRequest request) {
		String issuer = SsoProviders.issuer(SsoProviders.parse(provider));
		String username = authentication.getName();
		OperatorId operator = directory.requireOperator(username);
		String keepSessionId = SessionIdentity.currentId(request);
		if (links.links(operator).stream().anyMatch(link -> link.issuer().equals(issuer))) {
			sessionRevoker.revokeAllExcept(username, keepSessionId);
		}
		return switch (links.unlink(operator, issuer)) {
			case SsoUnlinkOutcome.Unlinked(var unlinked) -> {
				sessionRevoker.revokeAllExcept(unlinked, keepSessionId);
				yield ResponseEntity.noContent().build();
			}
			case SsoUnlinkOutcome.NotLinked ignored -> ResponseEntity.noContent().build();
			case SsoUnlinkOutcome.LastCredential ignored -> ApiProblem.response(HttpStatus.CONFLICT,
					"LAST_CREDENTIAL", "This is the only way left to sign in to this account.");
		};
	}
}
