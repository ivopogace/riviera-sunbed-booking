import { inject, Injector, Service } from '@angular/core';
import { Router } from '@angular/router';

import { buildLocale, isLocaleId, LocaleId } from '../shared/display-locale';
import { writeSessionStorage, writeStorage } from '../shared/safe-storage';
import { PageNavigation } from './page-navigation';

export type { LocaleId } from '../shared/display-locale';

export interface LocaleOption {
  readonly id: LocaleId;
  /** The language's own name (an endonym), never translated: a guest finds their language by it. */
  readonly name: string;
  /** The URL segment the build is served under; empty for English at the root. */
  readonly subPath: string;
}

export const LOCALE_OPTIONS: readonly LocaleOption[] = [
  { id: 'en', name: 'English', subPath: '' },
  { id: 'sq', name: 'Shqip', subPath: 'sq' },
  { id: 'it', name: 'Italiano', subPath: 'it' },
  { id: 'de', name: 'Deutsch', subPath: 'de' },
];

const STORAGE_KEY = 'riviera-locale';
/** The per-tab note of the build an SSO sign-in left from; the server's fixed `302 /` lands on the seed. */
const SSO_RETURN_KEY = 'riviera-sso-locale';
const SOURCE_LOCALE: LocaleId = 'en';

/**
 * Where a load of `/` belongs: an SSO round trip's note, else the stored choice, else the first
 * supported entry of the browser's language list (what it sends as `Accept-Language`), else English.
 * `index.html`'s inline seed applies the same order before boot (drift pin: `locale-boot.spec.ts`).
 */
export function firstVisitLocale(
  stored: string | null,
  languages: readonly string[],
  ssoReturn: string | null = null,
): LocaleId {
  if (isLocaleId(ssoReturn)) {
    return ssoReturn;
  }
  if (isLocaleId(stored)) {
    return stored;
  }
  return (
    languages
      .map((tag) => tag.split('-')[0].toLowerCase())
      .find((primary) => isLocaleId(primary)) ?? SOURCE_LOCALE
  );
}

/**
 * Leave the note an SSO sign-in's return reads: the callback redirects to `/` alone, so the seed sends
 * the guest back to the build they left (ADR-0030). A note, not the stored choice: signing in from a
 * deep link is not picking a language. Blocked storage degrades to landing by the usual order.
 */
export function rememberSsoReturn(): void {
  writeSessionStorage(SSO_RETURN_KEY, buildLocale());
}

/**
 * The guest's language: which build is running, and the switch to another one. A switch stores the
 * choice device-locally (blocked storage degrades to this visit only) and loads the same route under
 * the new locale's subpath, a full page load since each locale is its own build.
 */
@Service()
export class LocaleService {
  readonly options = LOCALE_OPTIONS;
  readonly current: LocaleOption =
    LOCALE_OPTIONS.find((option) => option.id === buildLocale()) ?? LOCALE_OPTIONS[0];

  private readonly router = inject(Router);
  // Resolved on a switch only: the shell renders the row wherever `app.config.ts`'s seam is absent.
  private readonly injector = inject(Injector);

  select(id: LocaleId): void {
    writeStorage(STORAGE_KEY, id);
    const target = LOCALE_OPTIONS.find((option) => option.id === id);
    if (!target || target.id === this.current.id) {
      return;
    }
    const prefix = target.subPath ? `/${target.subPath}` : '';
    this.injector.get(PageNavigation).leaveTo(`${prefix}${this.router.url}`);
  }
}
