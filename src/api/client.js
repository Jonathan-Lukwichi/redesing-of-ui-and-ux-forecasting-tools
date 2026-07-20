// Dev: Vite on :5173 talks to the API on :8000. Production: the API serves the
// built frontend itself, so requests are same-origin (empty base).
const API_BASE = import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '');

async function request(path, { method = 'GET', body, signal } = {}) {
  const opts = { method, signal };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) {
    let detail = null;
    let parsed = null;
    try {
      parsed = await res.json();
      detail = parsed?.detail ?? parsed;
    } catch {
      try { detail = await res.text(); } catch { /* ignore */ }
    }
    const messageText =
      typeof detail === 'string'
        ? detail
        : (detail && typeof detail === 'object' && detail.message)
          ? detail.message
          : detail
            ? JSON.stringify(detail)
            : `${res.status} ${res.statusText}`;
    const err = new Error(`${res.status} ${res.statusText} — ${path}: ${messageText}`);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  return res.json();
}

export const api = {
  forecastDemo: (signal) => request('/api/forecast/demo', { signal }),

  forecast: {
    run: ({ model = 'statistical', horizon = 7, alias = null, start_date = null } = {}) =>
      request('/api/forecast/run', {
        method: 'POST',
        body: { model, horizon, alias, start_date },
      }),
    specialty: ({ specialty, model = 'statistical', horizon = 7, alias = null, resolution = 'daily', start_date = null } = {}) =>
      request('/api/forecast/specialty', {
        method: 'POST',
        body: { specialty, model, horizon, alias, resolution, start_date },
      }),
    coverage: (group = 'g1', signal) =>
      request(`/api/forecast/coverage?group=${group}`, { signal }),
    engines: ({ group = 'g1', specialty = null } = {}, signal) =>
      request(`/api/forecast/engines?group=${group}${specialty ? `&specialty=${encodeURIComponent(specialty)}` : ''}`, { signal }),
    demo: (signal) => request('/api/forecast/demo', { signal }),
  },

  datasets: {
    inventory: (signal) => request('/api/datasets/inventory', { signal }),
    get: (id, signal) => request(`/api/datasets/${id}`, { signal }),
    preview: (id, n = 10, signal) =>
      request(`/api/datasets/${id}/preview?n=${n}`, { signal }),
    upload: (id, file) => {
      const fd = new FormData();
      fd.append('file', file);
      return request(`/api/datasets/${id}/upload`, { method: 'POST', body: fd });
    },
    fetch:        (id) => request(`/api/datasets/${id}/fetch`, { method: 'POST' }),
    sourceStatus: (signal) => request('/api/datasets/source/status', { signal }),
    clear: (id) => request(`/api/datasets/${id}`, { method: 'DELETE' }),
    clearAll: () => request('/api/datasets', { method: 'DELETE' }),
  },

  prepare: {
    groups: (signal) => request('/api/prepare/groups', { signal }),
    build: ({ group, dateStart, dateEnd }) =>
      request('/api/prepare/build', {
        method: 'POST',
        body: { group, date_start: dateStart, date_end: dateEnd },
      }),
    get: (id, signal) => request(`/api/prepare/${id}`, { signal }),
    preview: (id, n = 20, signal) =>
      request(`/api/prepare/${id}/preview?n=${n}`, { signal }),
    quality: (id, signal) => request(`/api/prepare/${id}/quality`, { signal }),
    clear: (id) => request(`/api/prepare/${id}`, { method: 'DELETE' }),
    clearAll: () => request('/api/prepare', { method: 'DELETE' }),
  },

  supply: {
    overview: (signal) => request('/api/supply/overview', { signal }),
    item: (id, signal) => request(`/api/supply/item/${id}`, { signal }),
    // Policy comparison + lead-time sweep (forecast-value demonstration cards).
    compare:     (payload) => request('/api/supply/compare', { method: 'POST', body: payload }),
    sweep:       (payload) => request('/api/supply/sweep', { method: 'POST', body: payload }),
    compareDemo: ({ leadTime, serviceLevel } = {}, signal) => {
      const p = new URLSearchParams();
      if (leadTime != null) p.set('lead_time', leadTime);
      if (serviceLevel != null) p.set('service_level', serviceLevel);
      const q = p.toString();
      return request(`/api/supply/compare-demo${q ? '?' + q : ''}`, { signal });
    },
    sweepDemo:   (signal) => request('/api/supply/sweep-demo', { signal }),
  },

  staff: {
    overview: (signal) => request('/api/staff/overview', { signal }),
    // Rostering strategy comparison (forecast-value demonstration card).
    strategyCompareDemo: ({ meanArrivals } = {}, signal) => {
      const q = meanArrivals != null ? `?mean_arrivals=${meanArrivals}` : '';
      return request(`/api/staff/strategy-compare-demo${q}`, { signal });
    },
  },

  optimization: {
    // Each "Run" button hits one of these. Server has sensible defaults.
    runStaff: ({ model = 'ml', kappa = 1.65, weekly_budget_zar = null, start_date = null } = {}) =>
      request('/api/optimization/staff', {
        method: 'POST',
        body: { model, kappa, weekly_budget_zar, start_date },
      }),
    runSupply: ({ model = 'ml', service_level = 0.95, start_date = null } = {}) =>
      request('/api/optimization/supply', {
        method: 'POST',
        body: { model, service_level, start_date },
      }),
    // Combined (both models) — used by the Action Center.
    run: ({ model = 'ml', kappa = 1.65, service_level = 0.95, weekly_budget_zar = null, start_date = null } = {}) =>
      request('/api/optimization/run', {
        method: 'POST',
        body: { model, kappa, service_level, weekly_budget_zar, start_date },
      }),
    // Run the full optimization under BOTH forecast models and compare.
    compare: ({ kappa = 1.65, service_level = 0.95 } = {}) =>
      request('/api/optimization/compare', { method: 'POST', body: { kappa, service_level } }),
    forecastOptions: (signal) => request('/api/optimization/forecast-options', { signal }),
    last:      (signal) => request('/api/optimization/last', { signal }),
    staffPool: (signal) => request('/api/optimization/staff-pool', { signal }),
  },

  task1: {
    // GET /api/task1/models — sorted by val_RMSE asc, each item has badge + card.
    models:   (signal) => request('/api/task1/models', { signal }),
    // GET /api/task1/metrics — per-horizon errors for all 6 models.
    metrics:  (signal) => request('/api/task1/metrics', { signal }),
    // POST /api/task1/forecast — { alias, horizon, start_date }.
    forecast: ({ alias, horizon, start_date }) =>
      request('/api/task1/forecast', {
        method: 'POST',
        body: { alias, horizon, start_date },
      }),
  },

  task2: {
    // GET /api/task2/specialties — 7 specialties, each with its available_models[].
    specialties: (signal) => request('/api/task2/specialties', { signal }),
    metrics:     (signal) => request('/api/task2/metrics', { signal }),
    forecast: ({ specialty, alias, horizon, start_date }) =>
      request('/api/task2/forecast', {
        method: 'POST',
        body: { specialty, alias, horizon, start_date },
      }),
  },

  explore: {
    index:           (signal) => request('/api/explore/index', { signal }),
    findings:        (signal) => request('/api/explore/findings', { signal }),
    metrics:         (section = 'forecast', signal) =>
      request(`/api/explore/metrics?section=${section}`, { signal }),
    findingsIndex:   (signal) => request('/api/explore/findings/index', { signal }),
    findingsCoverage:(signal) => request('/api/explore/findings/coverage', { signal }),
    missingness:     (group = 'g1', signal) => request(`/api/explore/missingness?group=${group}`, { signal }),
    outliers:        (group = 'g1', signal) => request(`/api/explore/outliers?group=${group}`, { signal }),
    covidRegimes:    (group = 'g1', signal) => request(`/api/explore/covid_regimes?group=${group}`, { signal }),
    task1Distribution:    (group = 'g1', signal) => request(`/api/explore/task1/distribution?group=${group}`, { signal }),
    task1Stl:             (group = 'g1', signal) => request(`/api/explore/task1/stl?group=${group}`, { signal }),
    task1AcfPacf:         (group = 'g1', signal) => request(`/api/explore/task1/acf_pacf?group=${group}`, { signal }),
    task1CalendarEffects: (group = 'g1', signal) => request(`/api/explore/task1/calendar_effects?group=${group}`, { signal }),
    task2SpecialtyMix:    (group = 'g3', signal) => request(`/api/explore/task2/specialty_mix?group=${group}`, { signal }),
    task2SpecialtyCorr:   (group = 'g3', signal) => request(`/api/explore/task2/specialty_corr?group=${group}`, { signal }),
    task3ClassBalance:    (group = 'g3', signal) => request(`/api/explore/task3/class_balance?group=${group}`, { signal }),
    layer2HourlyProfile:  (group = 'g2', signal) => request(`/api/explore/layer2/hourly_profile?group=${group}`, { signal }),
    impactMatrix:         (group = 'g1', signal) => request(`/api/explore/impact_matrix?group=${group}`, { signal }),
  },
};
