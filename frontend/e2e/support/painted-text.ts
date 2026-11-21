import type { Locator } from '@playwright/test';

/**
 * The text a sighted visitor reads in `element`: its bare text and its parts with a box. A visually
 * hidden (`sr-only`) part keeps a 1px box and a `display: none` part none, so neither counts, where
 * `innerText` still counts the first.
 */
export function paintedText(element: Locator): Promise<string> {
  return element.evaluate((root) =>
    [...root.childNodes]
      .filter((part) => {
        if (part instanceof Element) {
          const box = part.getBoundingClientRect();
          return box.width > 1 && box.height > 1;
        }
        return part instanceof Text;
      })
      .map((part) => part.textContent)
      .join('')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}
