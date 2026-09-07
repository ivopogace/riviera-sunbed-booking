import { Component, input } from '@angular/core';

/**
 * PROTOTYPE — one glyph per console destination, inline SVG in `currentColor` (the
 * `shared/clock-icon.ts` shape: presentation-attribute size, a call site resizes with
 * `[&_svg]:size-*`). The rebuild would split these into per-glyph components; a switch is enough
 * to judge whether icons earn their place on the phone rail.
 */
@Component({
  selector: 'app-proto-icon',
  host: { class: 'contents', 'aria-hidden': 'true' },
  template: `
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.9"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @switch (name()) {
        @case ('daily') {
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        }
        @case ('requests') {
          <path d="M3 13v6h18v-6" />
          <path d="M3 13l3-8h12l3 8" />
          <path d="M3 13h5l2 3h4l2-3h5" />
        }
        @case ('beach-map') {
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        }
        @case ('pricing') {
          <path d="M20 12l-8 8-9-9V3h8z" />
          <circle cx="7.5" cy="7.5" r="1.5" />
        }
        @case ('venue') {
          <path d="M3 11l9-7 9 7" />
          <path d="M5 10v10h14V10" />
          <path d="M10 20v-5h4v5" />
        }
        @case ('payouts') {
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="3" />
          <path d="M6 12h.01M18 12h.01" />
        }
        @case ('operators') {
          <circle cx="9" cy="8" r="4" />
          <path d="M2 21a7 7 0 0 1 14 0" />
          <path d="M16 4a4 4 0 0 1 0 8" />
          <path d="M18 14a6 6 0 0 1 4 7" />
        }
        @case ('commissions') {
          <path d="M19 5L5 19" />
          <circle cx="7" cy="7" r="2.5" />
          <circle cx="17" cy="17" r="2.5" />
        }
        @case ('email') {
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" />
        }
        @case ('refunds') {
          <path d="M9 14L4 9l5-5" />
          <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
        }
        @case ('photos') {
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10" r="1.5" />
          <path d="M21 16l-5-5-8 8" />
        }
        @case ('reviews') {
          <path d="M12 3l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.4 6.3 20.5l1.2-6.4L2.8 9.7l6.4-.8z" />
        }
        @case ('privacy') {
          <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
        }
        @case ('audit') {
          <path d="M8 6h13M8 12h13M8 18h13" />
          <path d="M4 6h.01M4 12h.01M4 18h.01" />
        }
        @case ('admin') {
          <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
          <path d="M9 12l2 2 4-4" />
        }
        @case ('search') {
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        }
        @case ('venues') {
          <path d="M3 21h18" />
          <path d="M5 21V8l7-4 7 4v13" />
          <path d="M9 21v-6h6v6" />
        }
        @default {
          <path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3" />
        }
      }
    </svg>
  `,
})
export class ProtoIcon {
  readonly name = input.required<string>();
}
