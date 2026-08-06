export const PROBE = 'RV-STYLE-1 merge-block probe (#534)';

// This inline comment is deliberately two lines long, which RV-STYLE-1 forbids,
// so the guard flags it and the required check goes red. Temporary; PR is closed unmerged.
export function probe() {
  return PROBE;
}
