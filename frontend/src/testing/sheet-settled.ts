import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { expect } from 'vitest';

import { DiscoverSheet } from '../app/pages/home/discover-sheet';

/** The sheet's own quiet window is 160 ms; this is that, with slack for a loaded worker. */
const TIMEOUT_MS = 1_000;
const POLL_MS = 20;

/**
 * Waits until the discover sheet in `fixture` counts the scroll as its own again, before a spec
 * asserts where a re-measure re-rested it.
 *
 * <p>The sheet refuses to re-rest while a pointer is on it or a scroll is still running, because
 * on a phone the browser fires `resize` in the middle of both; the rest a re-measure asks for is
 * therefore taken once `settled()` turns true, not when `resize` is dispatched. Only `Date` is
 * faked in unit tests (`src/testing/freeze-clock.ts`), so the window passes in real time and this
 * polls for it rather than advancing a clock the sheet's timer does not read.
 */
export async function whenSheetSettled(fixture: ComponentFixture<unknown>): Promise<void> {
  const found = fixture.debugElement.query(By.directive(DiscoverSheet));
  if (found === null) {
    throw new Error('whenSheetSettled: this fixture renders no DiscoverSheet (yet)');
  }
  const sheet = found.componentInstance as DiscoverSheet;

  for (let waited = 0; waited < TIMEOUT_MS && !sheet.settled(); waited += POLL_MS) {
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_MS));
  }
  expect(sheet.settled(), `the sheet never settled within ${TIMEOUT_MS} ms`).toBe(true);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}
