import { useEffect, useState } from 'react';
import PageHero from '../components/PageHero';
import KPI from '../components/KPI';
import Icon from '../components/Icon';
import { LineChart, BarChart } from '../components/Charts';
import AiPanel from '../components/AiPanel';
import { api } from '../api/client';
import { gatherReportData, buildReportPdf, pdfOutputs } from '../utils/buildReportPdf';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const wd = (iso) => WD[new Date(iso + 'T00:00:00').getDay()];
const zarShort = (n) => (n == null ? '—' : n >= 1e6 ? 'R' + (n / 1e6).toFixed(1) + 'M' : 'R' + Math.round(n / 1e3) + 'k');

export default function Dashboard({ onNavigate }) {
  const [fc, setFc] = useState(null);     // forecast result (history + next7)
  const [supply, setSupply] = useState(null);
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState(null);

  // Download / Email Report
  const [reportBusy, setReportBusy] = useState(false);
  const [reportName, setReportName] = useState('');
  const [reportEmail, setReportEmail] = useState('');
  const [reportMsg, setReportMsg] = useState(null); // {ok, text}

  const [retryToken, setRetryToken] = useState(0);
  const retry = () => { setError(null); setFc(null); setRetryToken((n) => n + 1); };

  useEffect(() => {
    let alive = true;
    api.forecast.run({ model: 'ml', horizon: 7 })   // most accurate engine (matches Forecast & Optimization pages)
      .then((d) => { if (alive) setFc(d); })
      .catch((e) => { if (alive) setError(e.detail?.error === 'g1_not_merged' ? 'g1' : (e.message || 'Request failed')); });
    api.supply.overview().then((d) => alive && setSupply(d)).catch(() => {});
    api.staff.overview().then((d) => alive && setStaff(d)).catch(() => {});
    return () => { alive = false; };
  }, [retryToken]);

  // Three real states instead of one raw '—' standing in for all of them:
  // loading (nothing has resolved yet), empty (no data uploaded — a known,
  // actionable cause), offline (unexpected failure — humanized, never a
  // raw parser message), live (normal render).
  const dashState = (!fc && !error) ? 'loading' : error === 'g1' ? 'empty' : error ? 'offline' : 'live';

  const hist = fc?.history || [];           // [{date, arrivals}]
  const days = fc?.forecast || [];          // [{date, predicted, lower, upper}]
  const histVals = hist.map((h) => h.arrivals);
  const lastActual = histVals.length ? histVals[histVals.length - 1] : 0;
  // Build the combined series: history then forecast (joined at the last actual).
  const histSeries = [...histVals, ...Array(days.length).fill(0)];
  const fcLine = [...Array(Math.max(0, histVals.length - 1)).fill(0), lastActual, ...days.map((d) => d.predicted)];
  const fcUpper = [...Array(Math.max(0, histVals.length - 1)).fill(0), lastActual, ...days.map((d) => d.upper)];
  const fcLower = [...Array(Math.max(0, histVals.length - 1)).fill(0), lastActual, ...days.map((d) => d.lower)];

  // Day-of-week average from real history.
  const dow = Array.from({ length: 7 }, () => []);
  hist.forEach((h) => dow[new Date(h.date + 'T00:00:00').getDay()].push(h.arrivals));
  const dowAvg = [1, 2, 3, 4, 5, 6, 0].map((i) => {
    const a = dow[i]; return a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : 0;
  });

  const next7Total = days.reduce((s, d) => s + d.predicted, 0);
  const busiest = days.length ? days.reduce((a, b) => (b.predicted > a.predicted ? b : a)) : null;
  const peakIdx = busiest ? histVals.length + days.indexOf(busiest) : null;
  const peakLabel = busiest ? `PEAK ${wd(busiest.date).toUpperCase()} · ${Math.round(busiest.predicted)}` : null;
  const tomorrow = days[0];
  const histAvg = histVals.length ? histVals.reduce((s, v) => s + v, 0) / histVals.length : 0;
  const sk = supply?.kpis; const tk = staff?.kpis; // dicts of {mean, lo, hi}

  async function handleDownloadReport() {
    setReportBusy(true); setReportMsg(null);
    try {
      const data = await gatherReportData();
      const doc = await buildReportPdf(data);
      doc.save('healthforecast-operations-report.pdf');
    } catch (e) {
      setReportMsg({ ok: false, text: 'Could not build the report: ' + (e.message || 'unknown error') });
    } finally {
      setReportBusy(false);
    }
  }

  async function handleEmailReport() {
    if (!reportEmail.trim()) { setReportMsg({ ok: false, text: 'Enter an email address first.' }); return; }
    setReportBusy(true); setReportMsg(null);
    try {
      const data = await gatherReportData();
      const doc = await buildReportPdf(data);
      const { base64 } = pdfOutputs(doc);
      const res = await api.reports.email({
        to: reportEmail.trim(),
        pdf_base64: base64,
        context: data,
        recipient_name: reportName.trim() || null,
      });
      setReportMsg(res.sent
        ? { ok: true, text: `Sent to ${reportEmail.trim()}.` }
        : { ok: false, text: 'Could not send — the email service may not be configured yet.' });
    } catch (e) {
      setReportMsg({ ok: false, text: 'Could not send: ' + (e.message || 'unknown error') });
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <div className="content">
      <PageHero
        kicker="Operations · Live"
        title="Operations Dashboard"
        sub="Hospital · live forecast, KPIs, and a daily AI briefing"
        image="/images/dashboard-bg.jpg"
        actions={<>
          <button className="btn" onClick={() => window.location.reload()}><Icon name="refresh" size={14} />Refresh</button>
        </>}
      />

      {dashState === 'empty' && (
        <div className="card notice-card notice-empty">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No arrival history loaded for this hospital yet</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16, maxWidth: '52ch', marginInline: 'auto' }}>
            Forecasts need G1 · Daily demand built first — two columns, date and count, is enough to start.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => onNavigate('upload')}>See the format</button>
            <button className="btn btn-primary" onClick={() => onNavigate('prepare')}>Go to Prepare →</button>
          </div>
        </div>
      )}

      {dashState === 'offline' && (
        <div className="card notice-card notice-offline">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Live data isn't reachable right now</div>
          <div style={{ fontSize: 13, color: '#334155', marginBottom: 12 }}>
            The forecast couldn't be loaded. Your other pages and cached plans are unaffected — try again below.
          </div>
          <button className="btn btn-primary" onClick={retry}>Retry now</button>
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: '#64748b' }}>Details for IT</summary>
            <pre>{error}</pre>
          </details>
        </div>
      )}

      {/* Download / Email Report */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Operations report</div>
            <div className="card-sub">Overview, analysis, forecast, optimization and recommendations — one PDF</div>
          </div>
        </div>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn" disabled={reportBusy} onClick={handleDownloadReport}>
              <Icon name="download" size={14} />{reportBusy ? 'Working…' : 'Download PDF'}
            </button>
            <input
              className="input"
              type="text"
              placeholder="Name (optional)"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              style={{ maxWidth: 150 }}
            />
            <input
              className="input"
              type="email"
              placeholder="colleague@hospital.org"
              value={reportEmail}
              onChange={(e) => setReportEmail(e.target.value)}
              style={{ maxWidth: 260 }}
            />
            <button className="btn btn-primary" disabled={reportBusy} onClick={handleEmailReport}>
              {reportBusy ? 'Working…' : 'Send by email'}
            </button>
          </div>
          {reportMsg && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: reportMsg.ok ? '#0d9488' : '#dc2626' }}>
              {reportMsg.text}
            </div>
          )}
        </div>
      </div>

      {/* AI daily briefing */}
      {fc && <AiPanel surface="briefing" context={fc} label="Generate today's briefing" />}

      {(dashState === 'loading' || dashState === 'live') && <>
        {/* KPIs */}
        <div className="grid-kpi">
          <KPI loading={dashState === 'loading'} label="Tomorrow's forecast" value={tomorrow ? Math.round(tomorrow.predicted) : '—'} unit="patients"
            foot={tomorrow ? `${wd(tomorrow.date)} · range ${Math.round(tomorrow.lower)}–${Math.round(tomorrow.upper)}` : ''}
            spark={histVals.slice(-14)} sparkColor="#1e6091" />
          <KPI loading={dashState === 'loading'} label="Next 7 days" value={next7Total ? Math.round(next7Total).toLocaleString() : '—'} unit="patients"
            foot={`avg ${days.length ? Math.round(next7Total / days.length) : '—'}/day`}
            spark={days.map((d) => d.predicted)} sparkColor="#0d9488" />
          <KPI loading={dashState === 'loading'} label="Peak day" value={busiest ? Math.round(busiest.predicted) : '—'} unit={busiest ? wd(busiest.date) : ''}
            foot={busiest ? `${MONTH3[new Date(busiest.date + 'T00:00:00').getMonth()]} ${new Date(busiest.date + 'T00:00:00').getDate()}` : ''}
            spark={days.map((d) => d.predicted)} sparkColor="#d97706" />
          <KPI loading={dashState === 'loading'} label="Forecast" value={fc ? 'Reliable' : '—'} unit=""
            foot={fc ? 'validated · plan with the range' : ''} />
        </div>

        {/* Forecast chart + day-of-week */}
        <div className="layout-main">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Patient arrivals — history + 7-day forecast</div>
                <div className="card-sub">{hist.length} days history · live {fc?.requested_model === 'ml' ? 'best ML model' : 'best statistical model'} · likely range shaded</div>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#64748b' }}>
                <span><span className="dot" style={{ color: '#475569' }} /> Historical</span>
                <span><span className="dot" style={{ color: '#0d9488' }} /> Forecast</span>
              </div>
            </div>
            <div className="card-body">
              {dashState === 'loading' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="skel" style={{ height: 200 }} />
                  <div className="skel" style={{ height: 12, width: '40%' }} />
                </div>
              )}
              {dashState === 'live' && (
                <LineChart
                  series={[
                    { data: histSeries, color: '#475569' },
                    { data: fcLine, color: '#0d9488', band: { upper: fcUpper, lower: fcLower } },
                  ]}
                  xLabels={['−30d', '−20', '−10', 'Today', '+7d']}
                  height={260}
                  peakIndex={peakIdx}
                  peakLabel={peakLabel}
                />
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">Day-of-week pattern</div></div>
            <div className="card-body">
              {dashState === 'loading'
                ? <div className="skel" style={{ height: 180 }} />
                : <BarChart data={dowAvg} labels={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']} color="#1e6091" height={220} />}
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>Average daily arrivals by weekday · from your history</div>
            </div>
          </div>
        </div>
      </>}

      {/* Real operational snapshots */}
      <div className="grid-3">
        <div className="card">
          <div className="card-header"><div className="card-title">Supply</div>
            <a style={{ fontSize: 12, color: '#1e6091', cursor: 'pointer' }} onClick={() => onNavigate('supply')}>Open →</a></div>
          <div className="card-body">
            <SnapRow label="Items at risk" value={supply ? supply.items_at_risk : '—'} danger={supply?.items_at_risk > 0} />
            <SnapRow label="Total cost" value={sk ? zarShort(sk.total_cost_zar) : '—'} />
            <SnapRow label="Stockout penalty" value={sk ? zarShort(sk.stockout_cost_zar) : '—'} danger
              hint="The estimated cost of running out of this stock at current levels, if nothing is reordered." />
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Staffing</div>
            <a style={{ fontSize: 12, color: '#1e6091', cursor: 'pointer' }} onClick={() => onNavigate('staff')}>Open →</a></div>
          <div className="card-body">
            <SnapRow label="Coverage (lawful hrs)" value={tk ? Math.round(tk.lawful_coverage_pct) + '%' : '—'} danger={tk?.lawful_coverage_pct < 90} />
            <SnapRow label="Staffing shortfall" value={tk ? tk.staffing_shortfall + ' nurses' : '—'} danger={tk?.staffing_shortfall > 0} />
            <SnapRow label="BCEA breaches/nurse" value={tk ? tk.bcea_per_nurse : '—'} danger={tk?.bcea_per_nurse > 0}
              hint="How many times, on average, a nurse worked beyond the legal 45-hour week." />
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">Recommended actions</div></div>
          <div className="card-body">
            <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
              The Action Center turns the live forecast, staffing, and supply signals into a ranked, plain-English to-do list.
            </div>
            <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={() => onNavigate('actions')}>
              Open Action Center →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SnapRow({ label, value, danger, hint }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
      <span title={hint} style={hint ? { color: '#64748b', cursor: 'help', textDecoration: 'underline dotted', textUnderlineOffset: 3 } : { color: '#64748b' }}>{label}</span>
      <strong style={{ color: danger ? '#dc2626' : '#0f172a' }}>{value}</strong>
    </div>
  );
}
