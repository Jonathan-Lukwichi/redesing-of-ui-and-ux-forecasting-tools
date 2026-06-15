const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

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
    run: ({ model = 'statistical', horizon = 7, alias = null } = {}) =>
      request('/api/forecast/run', {
        method: 'POST',
        body: { model, horizon, alias },
      }),
    specialty: ({ specialty, model = 'statistical', horizon = 7, alias = null, resolution = 'daily' } = {}) =>
      request('/api/forecast/specialty', {
        method: 'POST',
        body: { specialty, model, horizon, alias, resolution },
      }),
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
