package ai.riviera.platform.web.adapter.in;

import java.util.List;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.ErrorResponse;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Clears {@code instance} on every {@code ProblemDetail} MVC writes, after Spring auto-fills it with the request
 * URI (on {@code /api/bookings/{code}} the bearer credential, invariant #7). Null is omitted on the wire, so no
 * problem body carries an {@code instance}.
 */
@Configuration
class ProblemInstanceConfig implements WebMvcConfigurer {

	@Override
	public void addErrorResponseInterceptors(List<ErrorResponse.Interceptor> interceptors) {
		interceptors.add((problem, errorResponse) -> problem.setInstance(null));
	}
}
