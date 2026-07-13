package ai.riviera.platform;

import java.nio.charset.StandardCharsets;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.customer.api.CustomerAccountProvisioning;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Session login + registration + current-principal endpoints (issues #109, #111; design D-1/D-2/D-8).
 * A principal signs in ONCE here and rides the resulting {@code SESSION} cookie; logout is the framework
 * {@code LogoutFilter} configured in {@link SecurityConfig} (not a handler here). Platform-edge login
 * machinery — the {@code operator}/{@code customer} modules only supply credentials/identity via their
 * {@code api/} ports (RV-BE-11, pinned by {@code OperatorAuthPlacementTests} / {@code CustomerAuthPlacementTests}).
 *
 * <p><strong>Controller-based on purpose</strong> (grill-gate re-decision on #109): driving the
 * framework {@link AuthenticationManager} from a controller keeps D-1's "no custom token filters"
 * intact <em>and</em> routes a failed login through the single {@link ApiErrorHandler} advice —
 * so the 401 lands on the RFC-7807 contract (#97) instead of a filter's bare status.
 *
 * <p><strong>Two principal types, two managers</strong> (D-2). The paths are principal-typed
 * ({@code /api/auth/operator/login}, {@code /api/auth/customer/login|register}); each login drives its
 * OWN {@link AuthenticationManager} (operator: S1's auto-configured bean; customer: the explicit
 * {@code customerAuthenticationManager}) so a credential in one namespace can never authenticate as the
 * other (AC-5). {@code /me} and {@code /logout} are principal-agnostic — {@code /me} derives the
 * {@code principalType} from the authenticated authorities.
 *
 * <p>Session fixation (D-1): a login arriving with a live session rotates its id before the
 * authenticated context is saved, so a pre-login id an attacker may have planted never becomes an
 * authenticated session. Pinned by {@code AuthSessionIT.sessionIdRotatesOnLogin}.
 */
@RestController
class AuthController {

	private static final String OPERATOR_PRINCIPAL_TYPE = "OPERATOR";
	private static final String CUSTOMER_PRINCIPAL_TYPE = "CUSTOMER";
	/** The authority a customer principal carries ({@code ROLE_} + type), used to label {@code /me}. */
	private static final String CUSTOMER_ROLE_AUTHORITY = "ROLE_" + CUSTOMER_PRINCIPAL_TYPE;

	/** Password policy (design D-8): a server-side minimum, capped at bcrypt's 72-byte input limit. */
	private static final int MIN_PASSWORD_LENGTH = 8;
	private static final int MAX_PASSWORD_BYTES = 72;

	private final AuthenticationManager operatorManager;
	private final AuthenticationManager customerManager;
	private final SecurityContextRepository securityContextRepository;
	private final PasswordEncoder passwordEncoder;
	private final CustomerAccountProvisioning customerAccounts;
	private final SecurityContextHolderStrategy contextHolderStrategy =
			SecurityContextHolder.getContextHolderStrategy();

	AuthController(@Qualifier("authenticationManager") AuthenticationManager operatorManager,
			@Qualifier("customerAuthenticationManager") AuthenticationManager customerManager,
			SecurityContextRepository securityContextRepository,
			PasswordEncoder passwordEncoder,
			CustomerAccountProvisioning customerAccounts) {
		this.operatorManager = operatorManager;
		this.customerManager = customerManager;
		this.securityContextRepository = securityContextRepository;
		this.passwordEncoder = passwordEncoder;
		this.customerAccounts = customerAccounts;
	}

	/**
	 * Wire DTO for an operator JSON login. Presence checks live in the compact constructor (§6b
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

	/** Wire DTO for a customer login/register (email + password). Same presence discipline. */
	record CustomerCredentials(String email, String password) {
		CustomerCredentials {
			if (email == null || email.isBlank() || password == null || password.isEmpty()) {
				throw new IllegalArgumentException("email and password are required");
			}
		}
	}

	/** The signed-in principal as the FE sees it (login/register responses and {@code /me} share it). */
	record PrincipalResponse(String username, String principalType) {
	}

	@PostMapping("/api/auth/operator/login")
	PrincipalResponse operatorLogin(@RequestBody LoginRequest login, HttpServletRequest request,
			HttpServletResponse response) {
		// A failed authenticate() throws AuthenticationException → ApiErrorHandler → the one generic
		// 401 INVALID_CREDENTIALS (no wrong-password/unknown-user/suspended distinction, D-8).
		Authentication authentication =
				establishSession(operatorManager, login.username(), login.password(), request, response);
		return new PrincipalResponse(authentication.getName(), OPERATOR_PRINCIPAL_TYPE);
	}

	@PostMapping("/api/auth/customer/login")
	PrincipalResponse customerLogin(@RequestBody CustomerCredentials login, HttpServletRequest request,
			HttpServletResponse response) {
		Authentication authentication =
				establishSession(customerManager, login.email(), login.password(), request, response);
		return new PrincipalResponse(authentication.getName(), CUSTOMER_PRINCIPAL_TYPE);
	}

	/**
	 * Register a customer account (S2, #111). Fresh email → the account is created and the caller is
	 * auto-signed-in (a session is established, AC-3). An already-registered email → the response is
	 * <strong>byte-identical</strong> but NO session is established (non-enumeration, design D-8; the
	 * only residual signal is the presence of the {@code SESSION} cookie — an accepted trade-off).
	 * Password policy is enforced BEFORE any write; a violation is {@code 400 INVALID_REQUEST}.
	 */
	@PostMapping("/api/auth/customer/register")
	ResponseEntity<PrincipalResponse> register(@RequestBody CustomerCredentials registration,
			HttpServletRequest request, HttpServletResponse response) {
		validatePassword(registration.password());
		// The module owns email normalization + storage; the edge only encodes the password (the module
		// receives an opaque, already-encoded hash — never a Spring Security type crosses in, RV-BE-11).
		RegistrationOutcome outcome =
				customerAccounts.register(registration.email(), passwordEncoder.encode(registration.password()));
		if (outcome instanceof RegistrationOutcome.Registered) {
			establishSession(customerManager, registration.email(), registration.password(), request, response);
		}
		// Fresh and duplicate return the identical status + body; only the fresh branch set a cookie.
		return ResponseEntity.status(HttpStatus.CREATED)
				.body(new PrincipalResponse(registration.email(), CUSTOMER_PRINCIPAL_TYPE));
	}

	/**
	 * The FE's reload-restore read: who does this session belong to? Anonymous requests never get
	 * here — the entry point answers {@code 401 UNAUTHENTICATED} (the signed-out signal the FE
	 * treats as state, not error). The {@code principalType} is derived from the authorities so the
	 * one endpoint serves both principal types.
	 */
	@GetMapping("/api/auth/me")
	PrincipalResponse me(Authentication authentication) {
		return new PrincipalResponse(authentication.getName(), principalTypeOf(authentication));
	}

	/**
	 * Authenticate against {@code manager}, rotate the session id if one already exists (fixation, D-1),
	 * and persist the authenticated context so subsequent requests ride the {@code SESSION} cookie.
	 * Shared by the operator + customer logins and the register auto-sign-in.
	 */
	private Authentication establishSession(AuthenticationManager manager, String username, String password,
			HttpServletRequest request, HttpServletResponse response) {
		Authentication authentication = manager.authenticate(
				UsernamePasswordAuthenticationToken.unauthenticated(username, password));
		if (request.getSession(false) != null) {
			request.changeSessionId();
		}
		SecurityContext context = contextHolderStrategy.createEmptyContext();
		context.setAuthentication(authentication);
		contextHolderStrategy.setContext(context);
		securityContextRepository.saveContext(context, request, response);
		return authentication;
	}

	private static String principalTypeOf(Authentication authentication) {
		boolean customer = authentication.getAuthorities().stream()
				.anyMatch(authority -> CUSTOMER_ROLE_AUTHORITY.equals(authority.getAuthority()));
		return customer ? CUSTOMER_PRINCIPAL_TYPE : OPERATOR_PRINCIPAL_TYPE;
	}

	private static void validatePassword(String password) {
		int bytes = password.getBytes(StandardCharsets.UTF_8).length;
		if (password.length() < MIN_PASSWORD_LENGTH || bytes > MAX_PASSWORD_BYTES) {
			throw new IllegalArgumentException("password outside the permitted length");
		}
	}
}
