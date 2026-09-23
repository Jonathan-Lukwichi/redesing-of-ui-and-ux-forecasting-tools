/* The one place a page reads a colour from.
 *
 * Nine files used to declare their own `const C = { ink: '#0f172a', ... }` with
 * the same literals — 360 usages across the app, and nothing keeping them in
 * step. Change the brand blue and you had to find nine copies; miss one and the
 * app quietly drifted out of alignment with itself.
 *
 * Every value here is a CSS custom property, not a hex string. That is what
 * makes theming possible at all: a JS constant is fixed at build time, whereas
 * `var(--text)` is resolved by the browser on every paint, so a theme can
 * redefine it and the whole app follows without a single component re-render.
 *
 * The mapping is EXACT — each token holds the same value the literal did, so
 * adopting this changes no pixels. The one that needed care is `green`: the
 * page palettes used #15803d while `--success` is #16a34a, so it maps to
 * `--success-strong` rather than being rounded off to something close.
 *
 * Safe in SVG too: CSS custom properties resolve in presentation attributes
 * (`fill="var(--brand)"`) as well as in style objects — verified in the browser
 * rather than assumed. Style objects remain the preferred form.
 */
export const C = {
  ink:   'var(--text)',            // #0f172a
  muted: 'var(--text-3)',          // #64748b
  teal:  'var(--accent)',          // #0d9488
  navy:  'var(--brand)',           // #1e6091
  red:   'var(--danger)',          // #dc2626
  amber: 'var(--warning)',         // #d97706
  green: 'var(--success-strong)',  // #15803d
  line:  'var(--divider)',         // #eef0f3
};

export default C;
