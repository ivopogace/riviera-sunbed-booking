/**
 * <strong>Driven (service-provider) surface</strong> of the {@code review} module (invariant #11):
 * interfaces review <em>needs another module to implement</em>; ports others call live in api.
 *
 * <p>Holds {@link CompletedStays}, implemented by {@code booking} so review can ask "was this stay
 * checked in, and when?" without depending on booking, which would close a module cycle
 * (ADR-0015). Grant {@code review::spi} only to the implementing module; plain callers take
 * {@code review::api}.
 */
@org.springframework.modulith.NamedInterface("spi")
package ai.riviera.platform.review.spi;
