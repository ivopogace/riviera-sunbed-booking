package ai.riviera.profilefixture.booking.adapter.in;

import org.springframework.context.annotation.Profile;

@Profile("prod & (!stripe | dev)")
class NegatesProviderInAnExpression {
}
