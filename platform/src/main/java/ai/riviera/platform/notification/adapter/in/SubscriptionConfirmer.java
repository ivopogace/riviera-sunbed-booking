package ai.riviera.platform.notification.adapter.in;

import java.io.IOException;
import java.net.URI;

/** Confirms a Topics &amp; Events subscription by a GET on its verified, allowlisted {@code SubscribeURL}. */
@FunctionalInterface
public interface SubscriptionConfirmer {

	void confirm(URI subscribeUrl) throws IOException;
}
