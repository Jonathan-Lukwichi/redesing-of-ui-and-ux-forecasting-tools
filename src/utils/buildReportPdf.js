// Builds the combined "Download / Email Report" PDF from data the app has
// already computed (read-only "last materialized result" endpoints — this
// never triggers a fresh forecast/optimization run). Text/vector PDF via
// jsPDF, not a screenshot, so it stays small and its text stays selectable.
//
// The SAME object gatherReportData() returns is also POSTed to the backend
// as `context` for the AI cover note, so the emailed note can never describe
// something the PDF doesn't actually contain.
//
// jsPDF's ES bundle statically pulls in html2canvas + dompurify (its optional
// .html() feature, unused here) — a dynamic import keeps that ~110KB gzipped
// out of every Dashboard page load, fetched only when the report is actually
// built.
import { api } from '../api/client';
import { aiApi } from '../api/aiClient';

const zar = (n) => (n == null ? 'n/a' : 'R' + Math.round(n).toLocaleString('en-ZA'));
const pct = (n) => (n == null ? 'n/a' : Math.round(n) + '%');
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const wd = (iso) => { try { return WD[new Date(iso + 'T00:00:00').getDay()]; } catch { return ''; } };

// ---------------------------------------------------------------- gather ---

// Never let one failed OR SLOW section block the rest of the report — every
// field degrades to null/[] on failure or timeout, same "best-effort" spirit
// as the pages this data is drawn from. A bounded timeout matters here
// specifically because one section (actions) calls the AI assistant, which
// can take much longer than a plain data read if the model API is slow.
const SECTION_TIMEOUT_MS = 8000;

async function safe(promise) {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), SECTION_TIMEOUT_MS));
  try { return await Promise.race([promise, timeout]); } catch { return null; }
}

export async function gatherReportData() {
  const [fcResp, optResp, supply, staff, findingsResp, actionsResp] = await Promise.all([
    safe(api.forecast.last()),
    safe(api.optimization.last()),
    safe(api.supply.overview()),
    safe(api.staff.overview()),
    safe(api.explore.findings()),
    safe(aiApi.actions()),
  ]);

  // Forecast — re-derive total/busiest client-side rather than trust any
  // upstream field, and deliberately exclude mae/accuracy/model-name (the
  // public app never states those; see CLAUDE.md AI governance rule).
  let forecast = null;
  if (fcResp?.available && fcResp.result?.forecast?.length) {
    const days = fcResp.result.forecast.map((d) => ({
      date: d.date, predicted: d.predicted, lower: d.lower, upper: d.upper,
    }));
    const total = days.reduce((s, d) => s + (d.predicted || 0), 0);
    const busiest = days.reduce((a, b) => (b.predicted > a.predicted ? b : a), days[0]);
    forecast = { days, total, busiest };
  }

  // Optimization
  let optimization = null;
  if (optResp && optResp.status !== 'no_solution_yet' && optResp.staff) {
    optimization = {
      totalSavingAnnual: optResp.impact?.total_saving_annual_zar,
      staff: optResp.staff?.cost,
      staffKpis: optResp.staff?.kpis,
      supply: optResp.supply?.cost,
    };
  }

  const findings = (findingsResp?.findings || [])
    .slice(0, 5)
    .map((f) => ({ title: f.title, summary: f.summary, headline: f.headline }));

  const actions = (actionsResp?.actions || []).slice(0, 8)
    .map((a) => ({ category: a.category, urgency: a.urgency, title: a.title, reason: a.reason }));

  return {
    generatedAt: new Date().toISOString(),
    overview: {
      supplyItemsAtRisk: supply?.items_at_risk ?? null,
      supplyCostZar: supply?.kpis?.total_cost_zar ?? null,
      staffCoveragePct: staff?.kpis?.lawful_coverage_pct ?? null,
      staffShortfall: staff?.kpis?.staffing_shortfall ?? null,
    },
    forecast,
    optimization,
    findings,
    actions,
  };
}

// ----------------------------------------------------------------- build ---

const MARGIN = 18;
const PAGE_W = 210; // A4 portrait, mm

function heading(doc, text, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 41);
  doc.text(text, MARGIN, y);
  doc.setDrawColor(210, 218, 230);
  doc.line(MARGIN, y + 2, PAGE_W - MARGIN, y + 2);
  return y + 9;
}

function para(doc, text, y, opts = {}) {
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
  doc.setFontSize(opts.size || 10.5);
  doc.setTextColor(...(opts.color || [51, 65, 85]));
  const lines = doc.splitTextToSize(text, PAGE_W - MARGIN * 2);
  doc.text(lines, MARGIN, y);
  return y + lines.length * (opts.lineHeight || 5) + (opts.gap ?? 3);
}

function notRun(doc, y, label) {
  return para(doc, `${label} — not run yet. Visit that page in the app to generate it.`, y,
    { color: [148, 163, 184], size: 9.5 });
}

// Simple vector bar chart for the 7-day forecast — no external chart lib.
function forecastBars(doc, days, y) {
  const chartW = PAGE_W - MARGIN * 2;
  const chartH = 32;
  const max = Math.max(...days.map((d) => d.upper ?? d.predicted), 1);
  const barW = chartW / days.length;
  days.forEach((d, i) => {
    const barH = (d.predicted / max) * chartH;
    const x = MARGIN + i * barW + barW * 0.15;
    doc.setFillColor(22, 166, 121);
    doc.rect(x, y + chartH - barH, barW * 0.7, barH, 'F');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(String(Math.round(d.predicted)), x, y + chartH - barH - 1.5);
    doc.text(wd(d.date), x, y + chartH + 5);
  });
  return y + chartH + 10;
}

export async function buildReportPdf(data) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 22;

  // --- Cover ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 41);
  doc.text('HealthForecast', MARGIN, y);
  y += 8;
  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Operations Report', MARGIN, y);
  y += 6;
  doc.setFontSize(9.5);
  doc.setTextColor(148, 163, 184);
  doc.text(new Date(data.generatedAt).toLocaleString('en-ZA'), MARGIN, y);
  y += 12;

  // --- Overview ---
  y = heading(doc, 'Overview', y);
  const o = data.overview;
  y = para(doc, `Supply items at risk: ${o.supplyItemsAtRisk ?? 'n/a'}  ·  Est. supply cost: ${zar(o.supplyCostZar)}`, y);
  y = para(doc, `Staffing coverage: ${pct(o.staffCoveragePct)}  ·  Staffing shortfall: ${o.staffShortfall ?? 'n/a'}`, y, { gap: 8 });

  // --- Analysis ---
  y = heading(doc, 'Analysis highlights', y);
  if (data.findings.length) {
    data.findings.forEach((f) => {
      y = para(doc, `${f.title}${f.headline ? ' (' + f.headline + ')' : ''}`, y, { bold: true, gap: 1 });
      y = para(doc, f.summary || '', y, { gap: 4 });
    });
  } else {
    y = notRun(doc, y, 'Analysis');
  }
  y += 4;

  // --- Forecast ---
  y = heading(doc, 'Forecast — next 7 days', y);
  if (data.forecast) {
    y = para(doc, `Total predicted arrivals: ${Math.round(data.forecast.total)}  ·  Busiest day: ${wd(data.forecast.busiest.date)} (${Math.round(data.forecast.busiest.predicted)})`, y, { gap: 6 });
    y = forecastBars(doc, data.forecast.days, y);
  } else {
    y = notRun(doc, y, 'Forecast');
  }
  y += 4;

  if (y > 230) { doc.addPage(); y = 22; }

  // --- Optimization ---
  y = heading(doc, 'Optimization', y);
  if (data.optimization) {
    y = para(doc, `Estimated annual saving: ${zar(data.optimization.totalSavingAnnual)}`, y, { bold: true, gap: 5 });
    if (data.optimization.staff) {
      y = para(doc, `Staffing cost: ${zar(data.optimization.staff.before_zar)} -> ${zar(data.optimization.staff.after_zar)} (saving ${zar(data.optimization.staff.saving_zar)})`, y);
    }
    if (data.optimization.supply) {
      y = para(doc, `Supply cost: ${zar(data.optimization.supply.before_zar)} -> ${zar(data.optimization.supply.after_zar)} (saving ${zar(data.optimization.supply.saving_zar)})`, y, { gap: 6 });
    }
  } else {
    y = notRun(doc, y, 'Optimization');
  }
  y += 4;

  // --- Recommendations ---
  y = heading(doc, 'Recommendations', y);
  if (data.actions.length) {
    data.actions.forEach((a) => {
      y = para(doc, `[${(a.urgency || '').toUpperCase()}] ${a.title}`, y, { bold: true, gap: 1 });
      y = para(doc, a.reason || '', y, { gap: 4 });
      if (y > 265) { doc.addPage(); y = 22; }
    });
  } else {
    y = notRun(doc, y, 'Recommendations');
  }

  return doc;
}

// Returns { blob, base64 } — base64 has no data-URI prefix, ready for the
// backend's pdf_base64 field.
export function pdfOutputs(doc) {
  const dataUri = doc.output('datauristring');
  const base64 = dataUri.split(',')[1];
  const blob = doc.output('blob');
  return { blob, base64 };
}
