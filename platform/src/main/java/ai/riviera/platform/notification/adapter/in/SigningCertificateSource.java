package ai.riviera.platform.notification.adapter.in;

import java.io.IOException;
import java.net.URI;

/** Fetches the bytes of an SNS signing certificate from a URL {@link SnsEndpointPolicy} already allowed. */
@FunctionalInterface
public interface SigningCertificateSource {

	byte[] fetch(URI certificateUrl) throws IOException;
}
