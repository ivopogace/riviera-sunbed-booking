import { Service, signal } from '@angular/core';

import { readStorage, writeStorage } from '../shared/safe-storage';

/**
 * The three Liquid Glass themes — porcelain (light, the default), riviera (branded dark teal),
 * and dark (neutral slate, the OS-dark default). Palettes themselves are CSS custom properties
 * under `[data-riv-theme="…"]` in `tailwind.css` — this registry only carries what the switcher UI
 * needs; a palette change is a tailwind.css block plus one row here.
 */
export type ThemeId = 'riviera' | 'porcelain' | 'dark';

export interface ThemeOption {
  readonly id: ThemeId;
  readonly name: string;
  /** CSS background for the switcher swatch dot. */
  readonly swatch: string;
  /** Light themes use the dark ink token set; dark themes use white ink. */
  readonly light: boolean;
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    id: 'porcelain',
    name: 'Porcelain',
    swatch: 'linear-gradient(135deg, #ffffff, #2bb8d4)',
    light: true,
  },
  {
    id: 'riviera',
    name: 'Riviera',
    swatch: 'linear-gradient(135deg, #38b6d2, #0a4f6e)',
    light: false,
  },
  {
    id: 'dark',
    name: 'Dark',
    swatch: 'linear-gradient(135deg, #3b4a5f, #0f172a)',
    light: false,
  },
];

const STORAGE_KEY = 'riviera-theme';
const DEFAULT_THEME: ThemeId = 'porcelain';
/** What an OS dark preference resolves to; riviera is reachable only via the switcher. */
const OS_DARK_THEME: ThemeId = 'dark';

function isThemeId(value: string | null): value is ThemeId {
  return THEME_OPTIONS.some((option) => option.id === value);
}

/**
 * The runtime single writer of the document's `data-riv-theme` attribute (the `index.html`
 * pre-paint seed writes the same value once, before Angular boots — drift-pinned by
 * `theme-boot.spec.ts`). Resolution order on boot: stored choice → OS
 * `prefers-color-scheme: dark` (→ dark) → porcelain. `select` persists, so the choice
 * survives reloads; storage access is guarded — a blocked storage (private mode) degrades to
 * session-only theming, never an error. With no stored choice, a mid-session OS scheme flip is
 * followed live; a stored choice always wins.
 */
@Service()
export class ThemeService {
  readonly options = THEME_OPTIONS;

  private readonly current = signal<ThemeId>(initialTheme());

  /** With storage blocked, writeStorage no-ops — the OS-flip listener honors this marker instead. */
  private chosenThisSession = false;

  /** The active theme id, as a read-only signal. */
  readonly theme = this.current.asReadonly();

  constructor() {
    applyToDocument(this.current());
    this.followOsScheme();
  }

  select(id: ThemeId): void {
    this.chosenThisSession = true;
    this.current.set(id);
    applyToDocument(id);
    writeStorage(STORAGE_KEY, id);
  }

  // Guarded: jsdom has no matchMedia (and test fakes may lack addEventListener) — then no listener.
  private followOsScheme(): void {
    if (typeof globalThis.matchMedia !== 'function') {
      return;
    }
    const query = globalThis.matchMedia('(prefers-color-scheme: dark)');
    if (typeof query.addEventListener !== 'function') {
      return;
    }
    query.addEventListener('change', (event) => {
      if (this.chosenThisSession || isThemeId(readStorage(STORAGE_KEY))) {
        return;
      }
      const next = osTheme(event.matches);
      this.current.set(next);
      applyToDocument(next);
    });
  }
}

function initialTheme(): ThemeId {
  const stored = readStorage(STORAGE_KEY);
  if (isThemeId(stored)) {
    return stored;
  }
  const prefersDark =
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
  return osTheme(prefersDark);
}

function osTheme(prefersDark: boolean): ThemeId {
  return prefersDark ? OS_DARK_THEME : DEFAULT_THEME;
}

function applyToDocument(id: ThemeId): void {
  // dataset, not setAttribute (S7761); the camelCase key maps to the data-riv-theme attribute.
  document.documentElement.dataset['rivTheme'] = id;
}
