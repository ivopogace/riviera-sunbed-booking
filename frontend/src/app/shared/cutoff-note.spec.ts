import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CutoffNote } from './cutoff-note';

/** The sentence, re-typed on purpose: this is the one place a copy edit has to come through. */
const SENTENCE =
  'Book any day, today included — each day’s online sales close at the venue’s chosen time that day (4 PM at most venues).';

@Component({
  imports: [CutoffNote],
  template: `<p appCutoffNote></p>`,
})
class BareHost {}

@Component({
  imports: [CutoffNote],
  template: `<p appCutoffNote class="mt-2 text-[11.5px] [&_svg]:size-[15px]"></p>`,
})
class SkinnedHost {}

describe('CutoffNote', () => {
  function noteOf(host: typeof BareHost | typeof SkinnedHost): HTMLElement {
    const fixture = TestBed.createComponent(host);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('p')!;
  }

  it('states the cutoff rule in one voice, for every surface that mounts it', () => {
    const text = noteOf(BareHost).textContent?.replace(/\s+/g, ' ').trim();

    expect(text).toBe(SENTENCE);
  });

  it('keeps the no-break space in "4 PM" that the normalized compare cannot see', () => {
    // Without it the note may wrap between the digit and the meridiem (#734 F-7).
    expect(noteOf(BareHost).textContent).toContain('4 PM');
  });

  it('binds to the caller’s native <p>, so paragraph semantics survive the move', () => {
    expect(noteOf(BareHost).tagName).toBe('P');
  });

  it('carries the cutoff-note test id, the only one in the source after #735', () => {
    expect(noteOf(BareHost).getAttribute('data-testid')).toBe('cutoff-note');
  });

  it('leads with the shared clock glyph, hidden from assistive tech and mute in the text', () => {
    const note = noteOf(BareHost);

    expect(note.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(note.textContent).not.toContain('⏰');
  });

  it('merges its host layout classes with the skin the call site writes', () => {
    const note = noteOf(SkinnedHost);

    expect(note.classList.contains('inline-flex')).toBe(true);
    expect(note.classList.contains('gap-1')).toBe(true);
    expect(note.classList.contains('text-[11.5px]')).toBe(true);
    expect(note.classList.contains('[&_svg]:size-[15px]')).toBe(true);
  });

  it('sets no border-radius of its own, leaving each surface its own shape', () => {
    // riviera-tailwind rule 3: two competing radius utilities resolve by stylesheet order.
    expect(noteOf(BareHost).getAttribute('class')).not.toMatch(/rounded/);
  });
});
