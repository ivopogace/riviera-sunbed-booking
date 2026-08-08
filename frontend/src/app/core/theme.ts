import { Service, signal } from '@angular/core';

import { readStorage, writeStorage } from '../shared/safe-storage';

/**
 * The two Liquid Glass themes — one dark, one light, the full set by deliberate decision —
 * not planned to grow. Palettes themselves are CSS custom properties under
 * `[data-riv-theme="…"]` in `styles.scss` — this registry only carries what the switcher UI
 * needs; a palette change is a styles.scss block plus one row here.
 */
export type ThemeId = 'riviera' | 'porcelain';

export interface ThemeOption {
  readonly id: ThemeId;
  readonly name: string;
  /** CSS background for the switcher swatch dot. */
  readonly swatch: string;
  /** Light themes use the dark ink token set; dark themes use white ink. */
  readonly light: boolean;
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  { id: 'riviera', name: 'Riviera', swatch: 'linear-gradient(135deg, #38b6d2, #0a4f6e)', light: false },
  { id: 'porcelain', name: 'Porcelain', swatch: 'linear-gradient(135deg, #ffffff, #2bb8d4)', light: true },
];

const STORAGE_KEY = 'riviera-theme';
const DEFAULT_THEME: ThemeId = 'riviera';

function isThemeId(value: string | null): value is ThemeId {
  return THEME_OPTIONS.some((option) => option.id === value);
}

/**
 * The single writer of the document's `data-riv-theme` attribute. Resolution order on boot:
 * stored choice → OS `prefers-color-scheme: light` (→ porcelain) → riviera. `select` persists,
 * so the choice survives reloads; storage access is guarded — a blocked storage
 * (private mode) degrades to session-only theming, never an error.
 */
@Service()
export class ThemeService {
  readonly options = THEME_OPTIONS;

  private readonly current = signal<ThemeId>(initialTheme());

  /** The active theme id, as a read-only signal. */
  readonly theme = this.current.asReadonly();

  constructor() {
    applyToDocument(this.current());
  }

  select(id: ThemeId): void {
    this.current.set(id);
    applyToDocument(id);
    writeStorage(STORAGE_KEY, id);
  }
}

function initialTheme(): ThemeId {
  const stored = readStorage(STORAGE_KEY);
  if (isThemeId(stored)) {
    return stored;
  }
  const prefersLight =
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-color-scheme: light)').matches;
  // Derived from the registry, not hardcoded, so the light default follows the data.
  const lightDefault = THEME_OPTIONS.find((option) => option.light)?.id ?? DEFAULT_THEME;
  return prefersLight ? lightDefault : DEFAULT_THEME;
}

function applyToDocument(id: ThemeId): void {
  // dataset, not setAttribute (S7761); the camelCase key maps to the data-riv-theme attribute.
  document.documentElement.dataset['rivTheme'] = id;
}
