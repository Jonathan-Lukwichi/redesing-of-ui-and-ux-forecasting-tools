/* Trust-state colours. Each state also carries a GLYPH, so the state is never
 * signalled by colour alone — red/green alone fails WCAG 1.4.1 and is invisible
 * to the ~8% of men with a colour vision deficiency. */
export const TOKENS = {
  strong:  { fg: 'var(--success)', glyph: '✓' },
  good:    { fg: 'var(--success)', glyph: '✓' },
  caution: { fg: 'var(--warning)', glyph: '!' },
  weak:    { fg: 'var(--warning)', glyph: '!' },
  unknown: { fg: 'var(--text-3)',   glyph: '?' },
};
