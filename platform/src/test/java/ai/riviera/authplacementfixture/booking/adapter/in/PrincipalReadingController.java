package ai.riviera.authplacementfixture.booking.adapter.in;

import org.springframework.security.core.Authentication;

/** The {@code adapter.in} exemption: a controller reading the signed-in principal stays clean. */
public class PrincipalReadingController {

	Authentication principal;
}
