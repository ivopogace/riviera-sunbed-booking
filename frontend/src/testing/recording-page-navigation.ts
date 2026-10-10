import { PageNavigation } from '../app/core/page-navigation';

/** Records the URLs each full page load was asked for, instead of navigating (jsdom has no real one). */
export class RecordingPageNavigation extends PageNavigation {
  readonly left: string[] = [];
  readonly reloaded: string[] = [];

  leaveTo(url: string): void {
    this.left.push(url);
  }

  reload(url: string): void {
    this.reloaded.push(url);
  }
}
