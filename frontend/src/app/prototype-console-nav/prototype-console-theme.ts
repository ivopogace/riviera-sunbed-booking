import { computed, inject, Service, signal } from '@angular/core';

import { readStorage, writeStorage } from '../shared/safe-storage';
import { PrototypeConsoleNavVariant } from './prototype-console-nav-variant';

/** PROTOTYPE — the two console themes the maintainer asked for: porcelain (light) and dark. */
export type ConsoleThemeId = 'porcelain' | 'dark';

export interface ConsoleThemeOption {
  readonly id: ConsoleThemeId;
  readonly name: string;
  readonly swatch: string;
}

export const CONSOLE_THEMES: readonly ConsoleThemeOption[] = [
  { id: 'porcelain', name: 'Porcelain', swatch: 'linear-gradient(135deg, #ffffff, #2bb8d4)' },
  { id: 'dark', name: 'Dark', swatch: 'linear-gradient(135deg, #3b4a5f, #0f172a)' },
];

const STORAGE_KEY = 'riviera-console-theme';

function isTheme(value: string | null): value is ConsoleThemeId {
  return value === 'porcelain' || value === 'dark';
}

/**
 * PROTOTYPE — the console's own theme choice, separate from the tourist `ThemeService` (which
 * writes the document attribute; this never does). The three pinned hosts (`app.ts`,
 * `operator-console.ts`, `admin-console.ts`, `operator-home.ts`) bind `pinned()` instead of the
 * literal `porcelain`, so every variant but G still renders porcelain exactly as shipped.
 */
@Service()
export class PrototypeConsoleTheme {
  private readonly variant = inject(PrototypeConsoleNavVariant).variant;
  private readonly current = signal<ConsoleThemeId>(stored());

  readonly options = CONSOLE_THEMES;
  readonly theme = this.current.asReadonly();
  /** What the console hosts pin: the chosen theme under G, porcelain everywhere else. */
  readonly pinned = computed((): ConsoleThemeId =>
    this.variant() === 'g' ? this.current() : 'porcelain',
  );

  select(id: ConsoleThemeId): void {
    this.current.set(id);
    writeStorage(STORAGE_KEY, id);
  }
}

function stored(): ConsoleThemeId {
  const value = readStorage(STORAGE_KEY);
  return isTheme(value) ? value : 'porcelain';
}
