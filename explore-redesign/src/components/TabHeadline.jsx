import { SERIF } from './Charts';

/**
 * TabHeadline — editorial header that opens every Explore tab. Created in
 * Pass 1 (Headlines) and reused at the top of every remaining tab.
 *
 *   kicker  short uppercase label ("Executive summary", "Data health", …)
 *   title   one sentence, SERIF, states the tab's thesis
 *   sub     optional one-line context strip
 */
export default function TabHeadline({ kicker, title, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      {kicker && (
        <div style={{
          fontSize: 11, fontWeight: 700, color: '#94a3b8',
          textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6,
        }}>{kicker}</div>
      )}
      <div style={{
        fontFamily: SERIF, fontSize: 22, fontWeight: 600,
        color: '#0f172a', lineHeight: 1.2,
      }}>{title}</div>
      {sub && (
        <div style={{
          fontSize: 14, color: '#475569', marginTop: 6, lineHeight: 1.4,
        }}>{sub}</div>
      )}
    </div>
  );
}
