/* A nurse shown by name (Jonathan, 2026-11-11: "to make it more
   understandable"), never by a bare code. The name comes from the staff list;
   a list without names falls back to the id, which then shows as is.

   Full name on wide screens, "T. Dlamini" where space is tight (≤640px, see
   .nurse-name in styles.css); the tooltip always holds the full name and id. */

// "Annelie van der Merwe" -> "A. van der Merwe"; an id or one word stays as is.
export function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length < 2) return parts[0] || '';
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

export default function NurseName({ name, id }) {
  const full = name || id || '';
  const short = shortName(full);
  const title = id && id !== full ? `${full} (${id})` : full;
  return (
    <span className="nurse-name" title={title}>
      <span className="nurse-name-full">{full}</span>
      {short !== full && <span className="nurse-name-short">{short}</span>}
    </span>
  );
}
