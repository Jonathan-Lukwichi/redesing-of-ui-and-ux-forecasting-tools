import Card, { CardGrid } from '../ui/Card';

export const REGISTER_PATTERN = 'Casualty_Daily_Register_YYYY_MM.xlsx';

// The four groups of section 9, keyed by the slot schema's category.
const GROUPS = [
  { category: 'hospital', title: 'Patient registers',
    note: 'The monthly registers, or the four pure_*.csv tables, or both.' },
  { category: 'external', title: 'External factors', note: 'The calendar and Pretoria weather.' },
  { category: 'inventory', title: 'Inventory', note: 'The item list and daily stock movements.' },
  { category: 'scheduling', title: 'Scheduling', note: 'The staff list, shift log and daily staffing.' },
];

const MARK = { present: '✓', missing: '✕', problem: '!', warning: '!', optional: '–' };
const SAY = { present: 'Present', missing: 'Missing', problem: 'Problem', warning: 'Warning', optional: 'Optional' };

function range(months) {
  return months.length === 1 ? months[0].month : `${months[0].month} to ${months[months.length - 1].month}`;
}

// Issues for one file name, with the row's state raised to match. A missing
// file's own issue already says it is missing, so the generic note goes.
function withIssues(base, note, issues) {
  const errors = issues.filter((i) => i.level === 'error');
  let state = base;
  if (errors.length) state = 'problem';
  else if (issues.length && base === 'present') state = 'warning';
  return { state, issues, note: base === 'missing' && issues.length ? null : note };
}

function slotRow(item, issuesFor, registersStaged) {
  const { schema, loaded, metadata } = item;
  let base = 'missing';
  let note = 'Not uploaded yet.';
  if (loaded) {
    base = 'present';
    note = `${metadata?.rows?.toLocaleString?.() ?? '?'} rows` +
      (metadata?.date_range ? `, ${metadata.date_range.start} to ${metadata.date_range.end}` : '');
  } else if (schema.category === 'hospital' && registersStaged) {
    base = 'optional';
    note = 'Optional: built from the staged registers.';
  }
  return { key: schema.id, name: schema.source_filename_hint, ...withIssues(base, note, issuesFor(schema.source_filename_hint)) };
}

function registerRow(staged, arrivalsSource, issuesFor) {
  const months = staged?.months || [];
  let base = 'missing';
  let note = 'None uploaded yet.';
  if (months.length) {
    base = 'present';
    note = `${months.length} month${months.length === 1 ? '' : 's'} staged, ${range(months)}.`;
  } else if (arrivalsSource === 'pure') {
    base = 'optional';
    note = 'Optional: the pure tables supply the arrivals.';
  }
  return { key: 'registers', name: REGISTER_PATTERN, ...withIssues(base, note, issuesFor(REGISTER_PATTERN)) };
}

function Row({ row }) {
  return (
    <li className="pl-check-row" data-state={row.state}>
      <span className="pl-check-mark" aria-hidden="true">{MARK[row.state]}</span>
      <div className="pl-check-body">
        <Card.FileLabel>{row.name}</Card.FileLabel>
        <span className="sr-only"> {SAY[row.state]}.</span>
        {row.note && <div className="pl-check-note">{row.note}</div>}
        {row.issues.map((i, n) => (
          <div key={n} className="pl-check-issue" data-level={i.level}>{i.message}</div>
        ))}
      </div>
    </li>
  );
}

/**
 * What is present, what is missing, and any problem per file, in the four
 * groups. `items` are the dataset inventory rows; `preflight` the server's
 * cross-file checks (GET /api/pipeline/preflight).
 */
export default function FileChecklist({ items, staged, preflight, preflightError }) {
  const issues = preflight?.issues || [];
  const names = new Set([REGISTER_PATTERN, ...(items || []).map((it) => it.schema.source_filename_hint)]);
  const issuesFor = (name) => issues.filter((i) => i.file === name);
  const crossFile = issues.filter((i) => !names.has(i.file));
  const registersStaged = !!staged?.months?.length;

  return (
    <div className="pl-checklist">
      <CardGrid columns={4} minItemWidth={240}>
        {GROUPS.map((g) => {
          const rows = (items || []).filter((it) => it.schema.category === g.category)
            .map((it) => slotRow(it, issuesFor, registersStaged));
          if (g.category === 'hospital') rows.unshift(registerRow(staged, preflight?.arrivals_source, issuesFor));
          const open = rows.filter((r) => r.state === 'missing' || r.state === 'problem').length;
          return (
            <Card key={g.category} className="pl-check-group">
              <Card.Header chip={rows.length ? (
                <Card.StatusChip tone={open ? 'missing' : 'valid'}>{open ? `${open} to fix` : 'Ready'}</Card.StatusChip>
              ) : null}>
                <Card.Title>{g.title}</Card.Title>
                <Card.Description>{g.note}</Card.Description>
              </Card.Header>
              {rows.length ? (
                <ul className="pl-check-rows">{rows.map((r) => <Row key={r.key} row={r} />)}</ul>
              ) : (
                <div className="pl-check-note">The file list could not be loaded.</div>
              )}
            </Card>
          );
        })}
      </CardGrid>
      {(crossFile.length > 0 || preflightError) && (
        <div className="pl-check-cross" role="status">
          {preflightError && <div className="pl-check-issue" data-level="error">The cross-file checks could not be loaded. Is the server running?</div>}
          {crossFile.map((i, n) => (
            <div key={n} className="pl-check-issue" data-level={i.level}>
              <Card.FileLabel>{i.file}</Card.FileLabel> {i.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
