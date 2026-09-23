import { TestBed } from '@angular/core/testing';

import { iconContract } from '../../testing/icon-contract';
import { DotIcon } from './dot-icon';

describe('DotIcon', () => {
  iconContract(DotIcon, 13);

  it('is a solid disc in the call site’s ink, so it reads beside a stroked check', () => {
    const fixture = TestBed.createComponent(DotIcon);
    fixture.detectChanges();
    const disc = (fixture.nativeElement as HTMLElement).querySelector('circle')!;

    expect(disc.getAttribute('fill')).toBe('currentColor');
  });
});
