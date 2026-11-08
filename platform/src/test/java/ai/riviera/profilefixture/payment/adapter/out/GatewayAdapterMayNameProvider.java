package ai.riviera.profilefixture.payment.adapter.out;

import org.springframework.context.annotation.Profile;

@Profile("!stripe")
class GatewayAdapterMayNameProvider {
}
