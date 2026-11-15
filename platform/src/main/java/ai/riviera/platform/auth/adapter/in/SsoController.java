package ai.riviera.platform.auth.adapter.in;

import java.net.URI;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.auth.api.SessionCredentials;
import ai.riviera.platform.auth.application.CredentialStamp;
import ai.riviera.platform.auth.application.ExternalIdentity;
import ai.riviera.platform.auth.application.SessionPrincipal;
import ai.riviera.platform.auth.application.SsoAuthorization;
import ai.riviera.platform.auth.application.SsoGateway;
import ai.riviera.platform.auth.application.SsoProviders;
import ai.riviera.platform.auth.vocabulary.AuthRoles;
import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.customer.api.SsoAccountProvisioning;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.Emails;
import ai.riviera.platform.customer.vocabulary.LiveAccountCredential;
import ai.riviera.platform.operator.api.OperatorSsoLinks;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * The customer SSO authorize and the one callback per provider both audiences return to (design D-3): OIDC
 * Authorization Code + PKCE completed server-side, so tokens never reach browser JS and the callback sets the same
 * {@code SESSION} as form login. Anonymous and per-IP rate limited. The callback dispatches on the session-held
 * {@link SsoAuthorization} alone: a customer record resolves via {@link SsoAccountProvisioning} and 302s to its locale's /, an
 * operator one goes to {@link OperatorSsoCallback} (#276).
 */
@RestController
class SsoController {

	private static final String CUSTOMER_ROLE = AuthRoles.authority(AuthRoles.CUSTOMER);
	/** Where a completed sign-in lands: the SPA root, which re-reads {@code /api/auth/me} and shows signed-in. */
	private static final String POST_LOGIN_REDIRECT = "/";

	private final SsoFlow flow;
	private final OperatorSsoCallback operatorCallback;
	private final SsoAccountProvisioning ssoAccounts;
	private final CustomerAccounts customerAccounts;
	private final SecurityContextRepository securityContextRepository;

	SsoController(SsoGateway ssoGateway, SsoAccountProvisioning ssoAccounts, CustomerAccounts customerAccounts,
			OperatorSsoLinks operatorLinks, SessionCredentials sessionCredentials,
			SecurityContextRepository securityContextRepository) {
		this.flow = new SsoFlow(ssoGateway);
		this.operatorCallback = new OperatorSsoCallback(flow, operatorLinks, sessionCredentials,
				securityContextRepository);
		this.ssoAccounts = ssoAccounts;
		this.customerAccounts = customerAccounts;
		this.securityContextRepository = securityContextRepository;
	}

	@GetMapping("/api/auth/sso/{provider}/authorize")
	ResponseEntity<Void> authorize(@PathVariable String provider,
			@RequestParam(name = "locale", required = false) String locale, HttpServletRequest request) {
		return redirectTo(flow.begin(request, SsoProviders.parse(provider), SsoAuthorization.Audience.CUSTOMER,
				SsoAuthorization.Intent.SIGN_IN, null, locale));
	}

	/** Validate and consume {@code state} before any exchange, write or session: a bad one is a 400 with nothing done. */
	@GetMapping("/api/auth/sso/{provider}/callback")
	ResponseEntity<Void> callback(@PathVariable String provider,
			@RequestParam("code") String code, @RequestParam("state") String state,
			HttpServletRequest request, HttpServletResponse response) {
		SsoAuthorization authorization = flow.consume(request, SsoProviders.parse(provider), state);
		return switch (authorization.audience()) {
			case CUSTOMER -> customerSignIn(authorization, code, request, response);
			case OPERATOR -> operatorCallback.complete(authorization, code, request, response);
		};
	}

	/**
	 * Resolve-or-create the account by verified email and key the session by the account's canonical email, exactly
	 * like password login, so {@code /me} never flips between two spellings of one address.
	 */
	private ResponseEntity<Void> customerSignIn(SsoAuthorization authorization, String code,
			HttpServletRequest request, HttpServletResponse response) {
		ExternalIdentity identity = flow.exchange(request, authorization, code);
		String email = Emails.normalize(identity.email());
		CustomerAccountId resolved = ssoAccounts.resolveOrCreate(identity.provider(), identity.subject(), email);
		LiveAccountCredential account = customerAccounts.liveCredential(resolved)
				.orElseThrow(() -> new IllegalStateException("the SSO account was erased during its sign-in"));
		List<SimpleGrantedAuthority> authorities = List.of(new SimpleGrantedAuthority(CUSTOMER_ROLE));
		Authentication authentication = UsernamePasswordAuthenticationToken.authenticated(
				SessionPrincipal.erased(account.email(), authorities,
						CredentialStamp.customer(resolved, account.passwordHash())), null, authorities);
		SessionAuthentication.establish(securityContextRepository, authentication, request, response);
		return redirectTo(authorization.landing(POST_LOGIN_REDIRECT));
	}

	private static ResponseEntity<Void> redirectTo(URI location) {
		return ResponseEntity.status(HttpStatus.FOUND).location(location).build();
	}
}
