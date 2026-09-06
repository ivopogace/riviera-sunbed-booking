import { computed, Signal } from '@angular/core';
import { Router, UrlTree } from '@angular/router';

/**
 * The current URL as a signal: the serialised `finalUrl` of the router's last successful
 * navigation, `/` before any has completed. Moves only when a navigation completes — a skipped
 * same-URL navigation, a cancel or an error leaves it where it was — and once it has, it equals
 * `router.url`. Pure: reads `Router.lastSuccessfulNavigation()` and nothing else, so it needs no
 * injection context and no `NavigationEnd` pipe of the caller's own.
 */
export function currentUrl(router: Router): Signal<string> {
  return computed(() =>
    router.serializeUrl(router.lastSuccessfulNavigation()?.finalUrl ?? new UrlTree()),
  );
}
