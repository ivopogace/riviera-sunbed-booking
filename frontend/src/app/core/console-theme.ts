import { Service, signal } from '@angular/core';

import { readStorage, writeStorage } from '../shared/safe-storage';

/**
 * The two console themes — porcelain (light, the default) and dark. Two by decision: the console
 * never wears the tourist `riviera` theme (console-nav grill, answer 14). Their palettes are the
 * `[data-riv-theme="…"]` blocks in `tailwind.css` the tourist themes of the same name use; this
 * registry only carries what the account chip's rows need.
 */
export type ConsoleThemeId = 'porcelain' | 'dark';

export interface ConsoleThemeOption {
  readonly id: ConsoleThemeId;
  readonly name: string;
  /** CSS background for the row's swatch dot. */
  readonly swatch: string;
}

export const CONSOLE_THEME_OPTIONS: readonly ConsoleThemeOption[] = [
  { id: 'porcelain', name: 'Porcelain', swatch: 'linear-gradient(135deg, #ffffff, #2bb8d4)' },
  { id: 'dark', name: 'Dark', swatch: 'linear-gradient(135deg, #3b4a5f, #0f172a)' },
];

const STORAGE_KEY = 'riviera-console-theme';
const DEFAULT_THEME: ConsoleThemeId = 'porcelain';

function isConsoleThemeId(value: string | null): value is ConsoleThemeId {
  return CONSOLE_THEME_OPTIONS.some((option) => option.id === value);
}

/**
 * The console's own theme choice, separate from the tourist `ThemeService`: that one writes the
 * document's `data-riv-theme`; this one never does. The app shell reads {@link theme} into the
 * `data-riv-theme` it pins on its own host for every console route, which is what keeps the
 * choice inside the console and the tourist theme outside it. Porcelain until the operator
 * chooses — no OS-scheme resolution, and no seeding from the tourist choice. `select` persists
 * through the guarded storage, so a blocked store degrades to a session-only choice.
 */
@Service()
export class ConsoleTheme {
  readonly options = CONSOLE_THEME_OPTIONS;

  private readonly current = signal<ConsoleThemeId>(stored());

  /** The chosen console theme, as a read-only signal. */
  readonly theme = this.current.asReadonly();

  select(id: ConsoleThemeId): void {
    this.current.set(id);
    writeStorage(STORAGE_KEY, id);
  }
}

function stored(): ConsoleThemeId {
  const value = readStorage(STORAGE_KEY);
  return isConsoleThemeId(value) ? value : DEFAULT_THEME;
}
