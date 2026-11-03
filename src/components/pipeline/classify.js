// Which upload route a dropped file takes, decided by its name alone.
// Plain JS with no imports, so the test suite can load it directly.

// The server checks the YYYY_MM part and says so plainly if it is wrong.
const REGISTER = /^Casualty_Daily_Register_.+\.xlsx$/;

/**
 * classify(fileName, schemas) -> {kind: "register"} | {kind: "slot", id} | {kind: "unknown"}
 *
 * A monthly register goes to the transform route. A file whose name is
 * exactly a slot's source_filename_hint goes to that slot. Anything else is
 * not uploaded: unknownReason() says why.
 */
export function classify(fileName, schemas) {
  const name = String(fileName || '');
  if (REGISTER.test(name)) return { kind: 'register' };
  const slot = (schemas || []).find((s) => s?.source_filename_hint && s.source_filename_hint === name);
  if (slot) return { kind: 'slot', id: slot.id };
  return { kind: 'unknown' };
}

/** A plain-English reason an unknown file was not uploaded. */
export function unknownReason(fileName) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return 'Not uploaded: monthly registers must be named Casualty_Daily_Register_YYYY_MM.xlsx. Rename the file and drop it again.';
  }
  if (lower.endsWith('.csv')) {
    return 'Not uploaded: this name matches none of the expected files. Rename it to a name in the checklist, or use the Advanced section to pick its slot.';
  }
  return 'Not uploaded: only the monthly .xlsx registers and the expected .csv files are accepted.';
}
