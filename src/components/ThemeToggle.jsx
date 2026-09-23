/* Light / Dark / System.
 *
 * Three states rather than two on purpose: "System" is the honest default —
 * a night-shift nurse whose phone is already in dark mode should not have to
 * ask this app separately. Explicit Light or Dark overrides the OS and is
 * remembered, because someone who chose dark at 03:00 usually means it.
 *
 * The choice is written to <html data-theme> BEFORE React paints (see the
 * inline script in index.html), so the page never flashes light and then
 * repaints dark. Stored in localStorage, which is a per-viewer convenience:
 * every read and write is wrapped, because a private window or blocked site
 * data makes it throw, and a theme picker must never take the page down.
 */
import { useEffect, useState } from 'react';
import Icon from './Icon';

const KEY = 'hf-theme';
// "Auto" rather than "System": sitting between Home and Sign out, the word
// System reads as a settings PAGE, not an appearance control. The visible
// label carries the "Theme:" prefix for the same reason — one word alone in a
// list of destinations looks like another destination.
const MODES = [
  { id: 'light',  label: 'Light', icon: 'sun' },
  { id: 'dark',   label: 'Dark',  icon: 'moon' },
  { id: 'system', label: 'Auto',  icon: 'settings' },
];

export function readTheme() {
  try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; }
}

export function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  try { localStorage.setItem(KEY, mode); } catch { /* private window: honour it for this session only */ }
}

export default function ThemeToggle({ collapsed }) {
  const [mode, setMode] = useState(readTheme);

  useEffect(() => { applyTheme(mode); }, [mode]);

  const next = () => {
    const i = MODES.findIndex((m) => m.id === mode);
    setMode(MODES[(i + 1) % MODES.length].id);
  };

  const current = MODES.find((m) => m.id === mode) || MODES[2];

  return (
    <button
      type="button"
      className="sidebar-footer-btn"
      onClick={next}
      // The control cycles, so the name has to say what it WILL do, not only
      // what is selected — otherwise a screen-reader user cannot predict it.
      aria-label={`Theme: ${current.label}. Activate to change.`}
      title={`Theme: ${current.label} — click to change`}
      style={collapsed ? { justifyContent: 'center' } : undefined}
    >
      <Icon name={current.icon} size={14} />
      {!collapsed && <span>Theme: {current.label}</span>}
    </button>
  );
}
