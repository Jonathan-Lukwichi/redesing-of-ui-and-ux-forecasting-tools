/* Paste into the browser console at any viewport width.
   Lists every element wider than the viewport, widest first, with a
   readable selector so the culprit is identified rather than guessed at. */
(() => {
  const vw = document.documentElement.clientWidth;
  const offenders = [];
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > vw + 1 || r.right > vw + 1 || r.left < -1) {
      offenders.push({ el, width: Math.round(r.width), right: Math.round(r.right) });
    }
  });
  offenders.sort((a, b) => b.width - a.width);
  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.classList.length) s += '.' + [...el.classList].slice(0, 3).join('.');
    return s;
  };
  console.log(`viewport ${vw}px, ${offenders.length} offender(s)`);
  offenders.slice(0, 25).forEach((o) =>
    console.log(`${o.width}px (right edge ${o.right})  ${sel(o.el)}`, o.el));
  return offenders.length === 0 ? 'CLEAN' : offenders.map((o) => o.el);
})();
