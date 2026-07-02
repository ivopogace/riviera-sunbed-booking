package ai.riviera.platform;

import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Session login + current-principal endpoints (issue #109, design D-1/D-2): an operator signs in
 * ONCE here and rides the resulting {@code SESSION} cookie; logout is the framework
 * {@code LogoutFilter} configured in {@link SecurityConfig} (not a handler here). Platform-edge
 * login machinery — the {@code operator} module only supplies credentials/identity via its
 * {@code api/} ports (RV-BE-11, pinned by {@code OperatorAuthPlacementTests}).
 *
 * <p><strong>Controller-based on purpose</strong> (grill-gate re-decision on #109): driving the
 * framework {@link AuthenticationManager} from a controller keeps D-1's "no custom token filters"
 * intact <em>and</em> routes a failed login through the single {@link ApiErrorHandler} advice —
 * so the 401 lands on the RFC-7807 contract (#97) instead of a filter's bare status. The
 * {@code /login} path is principal-typed ({@code /api/auth/operator/login}) so S2's customer login
 * can sit beside it; {@code /me} and {@code /logout} are principal-agnostic.
 *
 * <p>Session fixation (D-1): a login arriving with a live session rotates its id before the
 * authenticated context is saved, so a pre-login id an attacker may have planted never becomes an
 * authenticated session. Pinned by {@code AuthSessionIT.sessionIdRotatesOnLogin}.
 */
@RestController
class AuthController {

	/** S1 has exactly one principal type; S2 (customer login) generalizes this (design D-2). */
	private static final String OPERATOR_PRINCIPAL_TYPE = "OPERATOR";

	private final AuthenticationManager authenticationManager;
	private final SecurityContextRepository securityContextRepository;
	private final SecurityContextHolderStrategy contextHolderStrategy =
			SecurityContextHolder.getContextHolderStrategy();

	AuthController(AuthenticationManager authenticationManager,
			SecurityContextRepository securityContextRepository) {
		this.authenticationManager = authenticationManager;
		this.securityContextRepository = securityContextRepository;
	}

	/**
	 * Wire DTO for the JSON login. Presence checks live in the compact constructor (§6b
	 * centralized-explicit style): a malformed body fails deserialization → the one advice →
	 * {@code 400 INVALID_REQUEST}, never a stack trace.
	 */
	record LoginRequest(String username, String password) {
		LoginRequest {
			if (username == null || username.isBlank() || password == null || password.isEmpty()) {
				throw new IllegalArgumentException("username and password are required");
			}
		}
	}

	/** The signed-in principal as the FE sees it (login response and {@code /me} share it). */
	record PrincipalResponse(String username, String principalType) {
	}

	@PostMapping("/api/auth/operator/login")
	PrincipalResponse login(@RequestBody LoginRequest login, HttpServletRequest request,
			HttpServletResponse response) {
		// A failed authenticate() throws AuthenticationException → ApiErrorHandler → the one
		// generic 401 INVALID_CREDENTIALS (no wrong-password/unknown-user/suspended distinction, D-8).
		Authentication authentication = authenticationManager.authenticate(
				UsernamePasswordAuthenticationToken.unauthenticated(login.username(), login.password()));

		if (request.getSession(false) != null) {
			request.changeSessionId();
		}
		SecurityContext context = contextHolderStrategy.createEmptyContext();
		context.setAuthentication(authentication);
		contextHolderStrategy.setContext(context);
		securityContextRepository.saveContext(context, request, response);

		return new PrincipalResponse(authentication.getName(), OPERATOR_PRINCIPAL_TYPE);
	}

	/**
	 * The FE's reload-restore read: who does this session belong to? Anonymous requests never get
	 * here — the entry point answers {@code 401 UNAUTHENTICATED} (the signed-out signal the FE
	 * treats as state, not error).
	 */
	@GetMapping("/api/auth/me")
	PrincipalResponse me(Authentication authentication) {
		return new PrincipalResponse(authentication.getName(), OPERATOR_PRINCIPAL_TYPE);
	}
}
