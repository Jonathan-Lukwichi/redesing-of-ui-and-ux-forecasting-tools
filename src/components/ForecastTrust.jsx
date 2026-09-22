/* The forecast's trust state, DERIVED — never asserted.
 *
 * This replaces a hardcoded "Validated & reliable" that rendered in confident
 * green on every forecast regardless of horizon, data coverage or whether any
 * backtest had ever run. In a clinical operations tool an unearned assurance
 * claim is worse than no claim: it invites a planner to trust a number they
 * cannot check. Every state below is computed from what the API actually
 * reports, and the honest "not checked yet" state is a first-class outcome
 * rather than something to paper over.
 *
 * Order of evidence, strongest first:
 *   1. is_backtest   — this exact window was forecast blind and compared to
 *                      what really happened. The strongest claim available.
 *   2. validated     — rolling-origin backtesting has run for this engine at
 *                      this horizon (POST /api/forecast/validate).
 *   3. low_volume    — counts too small for a percentage to mean anything.
 *   4. unvalidated   — the engine's own one-step self-report. Say so plainly.
 */
import { TOKENS as C } from './trustTokens';

function state(data) {
  if (!data) return null;
  const horizon = (data.forecast || []).length;

  if (data.is_backtest && data.backtest) {
    const bt = data.backtest;
    return {
      tone: 'strong',
      label: 'Checked against what happened',
      detail: `Over these ${bt.n_compared} day${bt.n_compared === 1 ? '' : 's'} the forecast was out by ${Math.round(bt.mae)} patients a day on average.`,
    };
  }

  if (data.validated && data.validation) {
    const v = data.validation;
    const beats = v.beats_seasonal_naive;
    return {
      tone: beats === false ? 'weak' : 'good',
      label: beats === false
        ? 'Backtested — not beating a simple rule'
        : `Backtested on ${v.n_folds} past weeks`,
      detail: beats === false
        ? `At this horizon the model does no better than assuming next week repeats last week (MASE ${v.mase}). Plan with the range, and prefer the other engine.`
        : `Typically within ${Math.round(v.horizon_mae)} patients a day${
            v.pi_coverage_pct != null
              ? `; the stated range caught ${Math.round(v.pi_coverage_pct)}% of days`
              : ''}.`,
    };
  }

  if (data.low_volume) {
    return {
      tone: 'caution',
      label: 'Too few cases to score',
      detail: 'Numbers this small make an accuracy percentage unstable. Use the range, not the single number.',
    };
  }

  return {
    tone: 'unknown',
    label: 'Not yet backtested',
    detail: horizon > 1
      ? `The engine's own error estimate is measured one day ahead, so it does not describe this ${horizon}-day forecast. Run a backtest to see how it really performs.`
      : "The engine's own error estimate has not been checked against held-out data yet.",
  };
}

export default function ForecastTrust({ data, onValidate, validating, compact }) {
  const s = state(data);
  if (!s) return null;
  const t = C[s.tone];
  const canCheck = typeof onValidate === 'function' && !data?.is_backtest && !data?.validated;

  return (
    <div style={{ textAlign: compact ? 'left' : 'right' }}>
      <div style={{
        fontSize: 'var(--step--2)', color: 'var(--text-3)', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        Forecast
      </div>
      <div style={{ fontSize: 'var(--step-0)', fontWeight: 800, color: t.fg, marginTop: 2 }}>
        <span aria-hidden="true" style={{ marginRight: 6 }}>{t.glyph}</span>{s.label}
      </div>
      <div style={{
        fontSize: 'var(--step--2)', color: 'var(--text-3)', marginTop: 3,
        maxWidth: 320, lineHeight: 1.45, marginLeft: compact ? 0 : 'auto',
      }}>
        {s.detail}
      </div>
      {canCheck && (
        <button
          className="btn btn-sm"
          onClick={onValidate}
          disabled={validating}
          style={{ marginTop: 8 }}
        >
          {validating ? 'Backtesting…' : 'Check this forecast'}
        </button>
      )}
    </div>
  );
}

export { state as forecastTrustState };
