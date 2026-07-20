import { categoryToken } from './Charts';

/**
 * OperationalCallout — the "What to do:" strip that closes every card on the
 * Explore page. Created in Pass 1 (Headlines) and reused without modification
 * across tabs 2–7.
 *
 * Voice rules (locked in Pass 1):
 *   • action verb first
 *   • two lines maximum
 *   • plain English, no statistical jargon
 *   • South African context (Rand, DD-MM-YYYY, full holiday names)
 *
 * Accepts text up to ~180 characters; longer text wraps naturally.
 */
export default function OperationalCallout({ text, accent = 'stable' }) {
  const tok = categoryToken(accent);
  return (
    <div style={{
      marginTop: 10,
      padding: '8px 12px',
      background: tok.bg,
      borderLeft: `3px solid ${tok.color}`,
      borderRadius: 4,
      fontSize: 12,
      fontStyle: 'italic',
      color: '#0f172a',
      lineHeight: 1.45,
    }}>
      <strong style={{ fontStyle: 'normal', fontWeight: 700, marginRight: 6 }}>
        What to do:
      </strong>
      {text}
    </div>
  );
}
