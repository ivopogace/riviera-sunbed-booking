// Composite maths for every ink/fill in H's bar and sheet over the worst gradient stop per theme.
const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = ([r, g, b]) => {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const cr = (a, b) => {
  const l1 = lum(a),
    l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
const comp = (fg, a, bg) => fg.map((c, i) => Math.round(a * c + (1 - a) * bg[i]));
const W = hex('ffffff');
const THEMES = {
  porcelain: {
    stops: ['ffffff', 'eef6f8', 'cfeaf2', 'dfeef2'].map(hex),
    glass: [W, 0.6],
    ink: hex('0a2a33'),
    inkSoft: [hex('0c2a33'), 0.7],
    chipBg: [hex('0c2a33'), 0.05],
    chipBorder: [hex('0c2a33'), 0.14],
    swatch: [hex('ffffff'), hex('2bb8d4')],
    pop: [W, 0.92],
    popInk: hex('0a2a33'),
    popInkSoft: [hex('0c2a33'), 0.7],
    popAccent: hex('0a6e85'),
    popHover: [hex('0c2a33'), 0.06],
    accentFill: [hex('2bb8d4'), 0.12],
    accentChipFill: [hex('2bb8d4'), 0.18],
    accentInk: hex('085a6e'),
    ctaStops: ['0c7288', '0a5f74'].map(hex),
  },
  riviera: {
    stops: ['93e6f2', 'ffe2b0', '38b6d2', '0a4f6e'].map(hex),
    glass: [hex('0a2c3f'), 0.72],
    ink: W,
    inkSoft: [W, 0.86],
    chipBg: [W, 0.16],
    chipBorder: [W, 0.3],
    swatch: [hex('38b6d2'), hex('0a4f6e')],
    pop: [W, 0.92],
    popInk: hex('0a2a33'),
    popInkSoft: [hex('0c2a33'), 0.7],
    popAccent: hex('0a6e85'),
    popHover: [hex('0c2a33'), 0.06],
    accentFill: [hex('2bb8d4'), 0.12],
    accentChipFill: [hex('2bb8d4'), 0.18],
    accentInk: hex('085a6e'),
    ctaStops: ['0c7288', '0a5f74'].map(hex),
  },
  dark: {
    stops: ['3b4a5f', '2a3648', '33415a', '0b1120'].map(hex),
    glass: [hex('0f172a'), 0.72],
    ink: W,
    inkSoft: [W, 0.86],
    chipBg: [W, 0.16],
    chipBorder: [W, 0.3],
    swatch: [hex('3b4a5f'), hex('0f172a')],
    pop: [hex('101a2e'), 0.96],
    popInk: hex('f2f7fa'),
    popInkSoft: [hex('f2f7fa'), 0.75],
    popAccent: hex('7cd7e8'),
    popHover: [W, 0.08],
    accentFill: [hex('2bb8d4'), 0.12],
    accentChipFill: [hex('2bb8d4'), 0.18],
    accentInk: hex('7cd7e8'),
    ctaStops: ['0c7288', '0a5f74'].map(hex),
  },
};
const f = (x) => x.toFixed(2);
for (const [name, t] of Object.entries(THEMES)) {
  const rows = [];
  let worst = {};
  for (const stop of t.stops) {
    const bar = comp(t.glass[0], t.glass[1], stop);
    const add = (k, v) => {
      worst[k] = Math.min(worst[k] ?? 99, v);
    };
    add('brand ink on bar', cr(t.ink, bar));
    add('tab label ink-soft on bar (text)', cr(comp(t.inkSoft[0], t.inkSoft[1], bar), bar));
    add(
      'selected vs idle label (ink vs ink-soft)',
      cr(t.ink, comp(t.inkSoft[0], t.inkSoft[1], bar)),
    );
    add(
      'selected pill accent-fill vs bar (non-text 3:1)',
      cr(comp(t.accentFill[0], t.accentFill[1], bar), bar),
    );
    add(
      'selected pill accent-chip-fill vs bar',
      cr(comp(t.accentChipFill[0], t.accentChipFill[1], bar), bar),
    );
    add('solid ink pill vs bar (non-text)', cr(t.ink, bar));
    add('accent-ink pill vs bar (non-text)', cr(t.accentInk, bar));
    add('cta-grad pill (darkest stop) vs bar (non-text)', cr(t.ctaStops[1], bar));
    add('swatch light end vs bar (non-text)', cr(t.swatch[0], bar));
    add('swatch dark end vs bar (non-text)', cr(t.swatch[1], bar));
    add(
      'menu-btn chip-border vs bar (non-text)',
      cr(comp(t.chipBorder[0], t.chipBorder[1], bar), bar),
    );
    const chip = comp(t.chipBg[0], t.chipBg[1], bar);
    add('account chip ink on chip-bg', cr(t.ink, chip));
    const pop = comp(t.pop[0], t.pop[1], stop);
    add('sheet pop-ink on pop-surface', cr(t.popInk, pop));
    add(
      'sheet pop-ink-soft (email) on pop-surface',
      cr(comp(t.popInkSoft[0], t.popInkSoft[1], pop), pop),
    );
    add('sheet pop-accent (Sign in row) on pop-surface', cr(t.popAccent, pop));
    add(
      'sheet pop-accent on pop-hover (current row)',
      cr(t.popAccent, comp(t.popHover[0], t.popHover[1], pop)),
    );
    add('avatar white on cta-grad darkest', cr(W, t.ctaStops[1]));
    add('avatar white on cta-grad lightest', cr(W, t.ctaStops[0]));
  }
  console.log(`\n== ${name} (worst stop)`);
  for (const [k, v] of Object.entries(worst))
    console.log(
      `${v < (k.includes('non-text') || k.includes('vs bar') || k.includes('vs idle') ? 3 : 4.5) ? 'FAIL' : ' ok '} ${f(v)}  ${k}`,
    );
}
