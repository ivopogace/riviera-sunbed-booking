package ai.riviera.platform;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;

import jakarta.servlet.ServletException;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;

/**
 * Makes <em>"every {@code /api/admin/**} endpoint is gated to {@code ROLE_ADMIN}"</em> a build failure
 * rather than a review read.
 *
 * <p><strong>The hole this closes had a live instance.</strong> {@code /api/admin/payout-batches} was
 * gated {@code hasRole(OPERATOR)} until a later PR tightened it — correct when written
 * ({@code is_admin} did not exist yet), and a cross-tenant hole the moment the marketplace became
 * genuinely multi-tenant: any approved operator could read every venue's gross/commission/net and mark
 * any venue's batch settled. Nothing failed. The namespace keeps growing, so the audit that caught it
 * runs here now, on every build.
 *
 * <p><strong>Why {@link EndpointRoleGateCoverageTest} does not already cover this.</strong> That guard
 * is deliberately <em>role-agnostic</em>: it probes with a principal holding a role the application
 * grants to nobody, so it pins <em>that</em> a gate exists and never <em>which role</em> it names. A
 * matcher downgraded from {@code ADMIN} to {@code OPERATOR} keeps refusing that principal, so it stays
 * green — exactly the blindness that let the payout-batch gate sit wrong for as long as it did. This
 * class owns the other half; neither grows the other's job.
 *
 * <p><strong>The two failure modes, and why both are covered.</strong> The API chain ends in
 * {@code .anyRequest().authenticated()}, so the dangerous case is not only a matcher being
 * <em>downgraded</em> — it is a new admin endpoint shipping with <em>no matcher at all</em>, which is
 * then reachable by any authenticated principal, a plain operator and a signed-in tourist included.
 * That arrives by omission rather than by an edit anyone reviews, which is why the endpoint list here
 * is <strong>discovered</strong> from {@code RequestMappingHandlerMapping} and never hand-maintained:
 * a hand-written list cannot contain the endpoint nobody remembered to gate.
 *
 * <p><strong>The probe principals are the production ones.</strong> Their authorities come from the
 * constants the real {@code UserDetailsService}s grant — {@link OperatorUserDetailsService} hands a
 * {@code credential.admin() == false} account exactly {@code OPERATOR}, an admin {@code OPERATOR} plus
 * {@code ADMIN}, and {@link CustomerUserDetailsService} hands every customer {@code CUSTOMER} — so
 * these are authority-identical to real sessions rather than hand-guessed twins, and a change to
 * either grant changes this guard in the same commit. Covering the customer as well as the operator is
 * design D-2's requirement: the two principal types authenticate through separate managers, so
 * operator-only coverage would not be the whole property.
 *
 * <p><strong>A web slice, not an integration test</strong> — deliberately. The property under test is
 * a {@code SecurityConfig} matcher property and the slice drives the real filter chain against it,
 * whereas an IT would carry {@code @EnabledIfDockerAvailable} and <em>silently skip</em> wherever no
 * daemon is present; a tripwire that skips is not a tripwire. It also sidesteps the trap that has
 * already cost time here: the bootstrap {@code operator} account IS the platform admin ({@code
 * is_admin}, V29), so no test riding its session can demonstrate a {@code 403} at all.
 *
 * <p>Lives in the root test package because the web slice imports the package-private {@code
 * SecurityConfig} / {@code WebCorsConfig} / {@link WebSliceStubs} and the two role constants above.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class AdminSurfaceRoleGateTest {

	/**
	 * The audited namespace, kept in lockstep with {@code SecurityConfig}'s {@code ADMIN_AUDIT_NAMESPACE}
	 * and {@code AdminAuditFilter}'s prefix. The trailing slash is load-bearing: it is what stops a
	 * hypothetical sibling path like {@code /api/admin-tools} from being swept in as if it were gated.
	 */
	private static final String ADMIN_NAMESPACE = "/api/admin/";

	/**
	 * Anchors proving the discovery reached every module that owns admin endpoints — the application
	 * root plus {@code venue}, {@code review}, {@code notification}, {@code payout} and {@code booking}.
	 *
	 * <p>This is the guard's own vacuity check, and the reason it is not simply a full hand-written
	 * list: a sweep that discovers <em>nothing</em> passes every assertion below trivially, so if
	 * {@code @WebMvcTest} ever stopped registering the module {@code adapter/in} controllers this class
	 * would go quietly green while verifying nothing at all. Six entries across six owners catch that
	 * without becoming a list somebody has to remember to extend — a new admin endpoint in a module
	 * already anchored needs no edit here; only a module's <em>first</em> admin surface adds one.
	 */
	private static final Set<String> CROSS_MODULE_ANCHORS = Set.of(
			"GET /api/admin/audit",
			"GET /api/admin/venues/{venueId}/photos",
			"GET /api/admin/venues/{venueId}/reviews",
			"GET /api/admin/mail-outbox",
			"GET /api/admin/payout-batches",
			"GET /api/admin/refund-outbox");

	private static final String OPERATOR_USER = "plain-operator";
	private static final String CUSTOMER_USER = "tourist@example.com";
	private static final String ADMIN_USER = "platform-admin";

	@Autowired
	MockMvc mvc;

	@Autowired
	RequestMappingHandlerMapping handlerMapping;

	/**
	 * An approved operator with no {@code is_admin} flag — the attacker from that gap, and the principal that a
	 * matcher downgraded to {@code hasRole(OPERATOR)} would silently admit.
	 */
	@Test
	void plainOperatorReachesNoAdminEndpoint() throws Exception {
		assertNoAdminEndpointIsReachableBy(
				user(OPERATOR_USER).roles(OperatorUserDetailsService.OPERATOR_ROLE),
				"a plain operator");
	}

	/** The D-2 second principal type: a signed-in tourist must not reach a platform-admin surface. */
	@Test
	void customerReachesNoAdminEndpoint() throws Exception {
		assertNoAdminEndpointIsReachableBy(
				user(CUSTOMER_USER).roles(CustomerUserDetailsService.CUSTOMER_ROLE),
				"a signed-in customer");
	}

	/**
	 * The positive control: the same sweep under a platform admin <em>is</em> dispatched everywhere.
	 *
	 * <p>Without it the two tests above could pass for the wrong reason — most importantly against a
	 * mis-typed role name ({@code hasRole("ADMINN")}), which denies admins and non-admins alike and so
	 * reads as green from either negative probe while the surface is in fact bricked. It also proves
	 * that "not dispatched" above means the gate rather than a mis-synthesized path that never reached
	 * authorization at all.
	 *
	 * <p>Asserts <strong>admission</strong>, never status: handler selection precedes body binding,
	 * validation and every stub interaction, so a probed write answering {@code 400} on its empty body
	 * still proves exactly what this control claims. A probe whose handler <em>throws</em> counts as
	 * admitted for the same reason, and the reasoning is one-directional: Spring Security refuses a
	 * request by <em>writing</em> {@code 401}/{@code 403} and short-circuiting the chain — it never
	 * throws out of {@code perform}. So an exception escaping the dispatcher is by construction proof
	 * that the gate admitted the request and execution began. {@code PATCH /api/admin/payout-batches/*}
	 * is the live instance: {@code BatchStatus.valueOf} rejects the probe's empty body.
	 */
	@Test
	void adminPrincipalReachesEveryAdminEndpoint() throws Exception {
		RequestPostProcessor admin = user(ADMIN_USER).roles(
				OperatorUserDetailsService.OPERATOR_ROLE, OperatorUserDetailsService.ADMIN_ROLE);
		List<String> unreachable = new ArrayList<>();

		for (String endpoint : mappedAdminEndpoints()) {
			admissionFailure(endpoint, admin).ifPresent(unreachable::add);
		}

		assertThat(unreachable)
				.as("a platform admin must reach every /api/admin/** endpoint — otherwise the denial "
						+ "assertions in this class hold vacuously, for the wrong reason")
				.isEmpty();
	}

	/** Why the admin probe was refused before dispatch, or empty when the gate admitted it. */
	private Optional<String> admissionFailure(String endpoint, RequestPostProcessor admin) throws Exception {
		MvcResult result;
		try {
			result = mvc.perform(EndpointProbes.probe(endpoint, admin)).andReturn();
		}
		catch (ServletException thrownPastTheGate) {
			return Optional.empty();
		}
		return result.getHandler() != null
				? Optional.empty()
				: Optional.of(endpoint + " answered " + result.getResponse().getStatus() + " to a platform "
						+ "admin without dispatching — its gate names a role no admin holds, so the surface "
						+ "is denied to everyone");
	}

	/**
	 * Drives every discovered admin endpoint under one principal and requires the filter chain to refuse
	 * it before {@code DispatcherServlet} dispatches.
	 *
	 * <p>Both halves of the verdict are needed. A non-{@code null} handler means the request reached the
	 * application, so no {@code ADMIN} rule gated it — the omission or the downgrade. But "not
	 * dispatched" alone proves nothing either: a mis-synthesized path ({@code 404}), an unmapped verb
	 * ({@code 405}) or an exhausted rate-limit bucket ({@code 429} — {@code RateLimitFilter} runs ahead
	 * of authorization) all look identical to it, so the status must be exactly the {@code 403} that an
	 * authenticated-but-forbidden principal earns.
	 */
	private void assertNoAdminEndpointIsReachableBy(RequestPostProcessor principal, String description)
			throws Exception {
		List<String> violations = new ArrayList<>();

		for (String endpoint : mappedAdminEndpoints()) {
			MvcResult result = mvc.perform(EndpointProbes.probe(endpoint, principal)).andReturn();
			int status = result.getResponse().getStatus();
			if (result.getHandler() != null) {
				violations.add(endpoint + " reached " + result.getHandler() + " — it is not gated to "
						+ "ROLE_ADMIN, so " + description + " passes the filter chain");
			}
			else if (status != HttpStatus.FORBIDDEN.value()) {
				violations.add(endpoint + " was not dispatched but answered " + status + " instead of 403 "
						+ "— the probe never reached authorization, so this endpoint is UNVERIFIED");
			}
		}

		assertThat(violations)
				.as("every mapped /api/admin/** endpoint must be gated to ROLE_ADMIN and refuse %s; "
						+ "gate a new one with an explicit requestMatchers(...).hasRole(ADMIN_ROLE) rule "
						+ "in SecurityConfig", description)
				.isEmpty();
	}

	/** Every mapped admin {@code VERB pattern}, sorted so a failure list reads the same on every run. */
	private Set<String> mappedAdminEndpoints() {
		Set<String> endpoints = new TreeSet<>();
		handlerMapping.getHandlerMethods().forEach((info, handler) -> {
			List<String> adminPatterns = info.getPatternValues().stream()
					.filter(pattern -> pattern.startsWith(ADMIN_NAMESPACE))
					.toList();
			if (adminPatterns.isEmpty()) {
				return;
			}
			Set<RequestMethod> methods = info.getMethodsCondition().getMethods();
			assertThat(methods)
					.as("%s maps an /api/admin/** pattern with no HTTP method, so this guard cannot probe "
							+ "it — give it an explicit verb", handler)
					.isNotEmpty();
			methods.forEach(method -> adminPatterns.forEach(
					pattern -> endpoints.add(method + " " + pattern)));
		});

		assertThat(endpoints)
				.as("the admin-endpoint discovery must reach every module that owns one — a sweep that "
						+ "discovers nothing passes every assertion in this class trivially")
				.containsAll(CROSS_MODULE_ANCHORS);
		return endpoints;
	}
}
