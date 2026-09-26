import { computed, Signal } from '@angular/core';
import { Router, UrlTree } from '@angular/router';

/**
 * The serialised `finalUrl` of the router's last successful navigation (`/` before any) as a
 * signal; a skipped, cancelled or failed navigation leaves it, and once set it equals `router.url`.
 * Pure (reads only `lastSuccessfulNavigation()`): no injection context or `NavigationEnd` pipe.
 */
export function currentUrl(router: Router): Signal<string> {
  return computed(() =>
    router.serializeUrl(router.lastSuccessfulNavigation()?.finalUrl ?? new UrlTree()),
  );
}
