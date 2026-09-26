import { Component, computed, input } from '@angular/core';

/**
 * A loading surface's one live region. **Mount it outside the `@if`**: a region inserted already
 * holding its text reads as silence, and jsdom won't tell you — specs assert element identity
 * across the transition. `ready` is true only in the loaded branch, so an unbound exit stays silent
 * rather than saying "…loaded." over an error; the failure is the call site's `role="alert"`.
 * `loading` wins over `ready`; the first "Loading…" at mount is not spoken. Rules: RV-FE-10.
 */
@Component({
  selector: 'app-load-announcer',
  host: { class: 'contents' },
  template: `<output class="sr-only" aria-live="polite" data-testid="load-announcer">
    {{ message() }}
  </output>`,
})
export class LoadAnnouncer {
  /** True while the surface's content is in flight. */
  readonly loading = input.required<boolean>();

  /**
   * True only in the surface's **loaded** branch. Anything else — a failure, a 404, a signed-out
   * visitor — leaves it false and this region silent. See the class note on why it is not `failed`.
   */
  readonly ready = input(false);

  /** Spoken while loading, and on every re-load once the region is mounted. */
  readonly loadingLabel = input.required<string>();

  /** Spoken when the content lands. Empty where another persistent region already says it. */
  readonly readyLabel = input('');

  protected readonly message = computed(() => {
    if (this.loading()) {
      return this.loadingLabel();
    }
    return this.ready() ? this.readyLabel() : '';
  });
}
