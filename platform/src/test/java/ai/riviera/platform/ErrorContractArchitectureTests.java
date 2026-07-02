package ai.riviera.platform;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.tngtech.archunit.core.domain.JavaClass;

import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import static ai.riviera.platform.ArchitectureTestSupport.PRODUCTION_CLASSES;
import static ai.riviera.platform.ArchitectureTestSupport.assertNoViolations;
import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Locks the one-error-contract decision (issue #97, {@code riviera-java-conventions} §6b): the
 * wire mapping for thrown failures lives in exactly one {@code @RestControllerAdvice} —
 * {@link ApiErrorHandler} — so a new endpoint (e.g. Request-to-Book, #98) cannot quietly
 * reintroduce a per-controller {@code @ExceptionHandler} with a bespoke error body. Controllers
 * keep mapping their own <em>typed outcomes</em>; what they may not do is intercept exceptions.
 *
 * <p>A fast, context-free guard in the {@link ModularityTests} family: no Spring context, no
 * database, fails the build on the first stray handler.
 */
class ErrorContractArchitectureTests {

	@Test
	void exceptionHandlersLiveOnlyInTheOneAdvice() {
		List<String> violations = PRODUCTION_CLASSES.stream()
				.filter(clazz -> !clazz.getName().equals(ApiErrorHandler.class.getName()))
				.flatMap(clazz -> clazz.getMethods().stream())
				.filter(method -> method.isAnnotatedWith(ExceptionHandler.class))
				.map(method -> method.getFullName() + " declares @ExceptionHandler outside ApiErrorHandler")
				.toList();
		assertNoViolations("Per-controller @ExceptionHandlers are forbidden (issue #97)", violations);
	}

	@Test
	void thereIsExactlyOneRestControllerAdvice() {
		List<String> advices = PRODUCTION_CLASSES.stream()
				.filter(clazz -> clazz.isAnnotatedWith(RestControllerAdvice.class))
				.map(JavaClass::getName)
				.toList();
		assertNoViolations("Expected only ApiErrorHandler to be a @RestControllerAdvice",
				advices.stream().filter(name -> !name.equals(ApiErrorHandler.class.getName())).toList());
		assertEquals(List.of(ApiErrorHandler.class.getName()), advices,
				"The one advice must exist — an empty result means the contract owner was deleted");
	}
}
