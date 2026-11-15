package ai.riviera.platform.auth.adapter.in;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;

import ai.riviera.platform.auth.api.SessionCredentials;
import ai.riviera.platform.auth.application.CredentialStamp;
import ai.riviera.platform.auth.application.ExternalIdentity;
import ai.riviera.platform.auth.application.SessionPrincipal;
import ai.riviera.platform.auth.application.SsoAuthorization;
import ai.riviera.platform.auth.vocabulary.AuthRoles;
import ai.riviera.platform.operator.api.OperatorSsoLinks;
import ai.riviera.platform.operator.vocabulary.OperatorCredential;
import ai.riviera.platform.operator.vocabulary.OperatorId;
import ai.riviera.platform.operator.vocabulary.SsoLinkOutcome;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Completes an operator-audience SSO round trip (#276), reached only through the session-held record. A sign-in
 * resolves a linked identity and opens the same username-principal, credential-stamped session as a password sign-in;
 * unknown, unlinked and non-authenticating accounts, and an admin on the mock IdP, all get one redirect and no
 * session (D-8). A link first re-checks that the session still holds the linking operator with a current stamp.
 * Rationale: RESPONSIBILITIES.md §auth.
 */
final class OperatorSsoCallback {

	static final String SIGNED_IN = "/operator";
	static final String SIGN_IN_FAILED = "/account/sign-in?audience=operator&sso=failed";
	static final String LINKED = "/account/operator-password?sso=linked";
	static final String LINK_FAILED = "/account/operator-password?sso=link-failed";

	private static final String OPERATOR_ROLE = AuthRoles.authority(AuthRoles.OPERATOR);
	private static final String ADMIN_ROLE = AuthRoles.authority(AuthRoles.ADMIN);

	private final SsoFlow flow;
	private final OperatorSsoLinks links;
	private final SessionCredentials sessionCredentials;
	private final SecurityContextRepository securityContextRepository;

	OperatorSsoCallback(SsoFlow flow, OperatorSsoLinks links, SessionCredentials sessionCredentials,
			SecurityContextRepository securityContextRepository) {
		this.flow = flow;
		this.links = links;
		this.sessionCredentials = sessionCredentials;
		this.securityContextRepository = securityContextRepository;
	}

	ResponseEntity<Void> complete(SsoAuthorization authorization, String code, HttpServletRequest request,
			HttpServletResponse response) {
		return switch (authorization.intent()) {
			case SIGN_IN -> signIn(authorization, code, request, response);
			case LINK -> link(authorization, code, request);
		};
	}

	private ResponseEntity<Void> signIn(SsoAuthorization authorization, String code, HttpServletRequest request,
			HttpServletResponse response) {
		ExternalIdentity identity = flow.exchange(request, authorization, code);
		Optional<OperatorCredential> credential = links.resolve(identity.issuer(), identity.subject())
				.filter(account -> AuthRoles.OPERATOR_MAY_AUTHENTICATE.contains(account.status()))
				.filter(account -> !(flow.cooperative() && account.admin()));
		if (credential.isEmpty()) {
			return redirectTo(SIGN_IN_FAILED);
		}
		OperatorCredential account = credential.get();
		List<SimpleGrantedAuthority> authorities = new ArrayList<>(List.of(new SimpleGrantedAuthority(OPERATOR_ROLE)));
		if (account.admin()) {
			authorities.add(new SimpleGrantedAuthority(ADMIN_ROLE));
		}
		Authentication authentication = UsernamePasswordAuthenticationToken.authenticated(
				SessionPrincipal.erased(account.username(), authorities,
						CredentialStamp.operator(account.username(), account.passwordHash())), null, authorities);
		SessionAuthentication.establish(securityContextRepository, authentication, request, response);
		return redirectTo(SIGNED_IN);
	}

	private ResponseEntity<Void> link(SsoAuthorization authorization, String code, HttpServletRequest request) {
		SsoAuthorization.Linking linking = authorization.linking();
		if (!stillHeldBy(linking.username())) {
			return redirectTo(LINK_FAILED);
		}
		ExternalIdentity identity = flow.exchange(request, authorization, code);
		return switch (links.link(new OperatorId(linking.operatorId()), identity.issuer(), identity.subject())) {
			case SsoLinkOutcome.Linked ignored -> redirectTo(LINKED);
			case SsoLinkOutcome.Conflict ignored -> redirectTo(LINK_FAILED);
			case SsoLinkOutcome.NotOperable ignored -> redirectTo(LINK_FAILED);
		};
	}

	/** The session's principal is still the operator that started the link, with a current credential stamp. */
	private boolean stillHeldBy(String linkingUsername) {
		Authentication current = SecurityContextHolder.getContext().getAuthentication();
		return current != null && current.getPrincipal() instanceof SessionPrincipal
				&& current.getAuthorities().stream().anyMatch(granted -> OPERATOR_ROLE.equals(granted.getAuthority()))
				&& linkingUsername.equals(current.getName())
				&& sessionCredentials.isCurrent(current);
	}

	private static ResponseEntity<Void> redirectTo(String location) {
		return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(location)).build();
	}
}
