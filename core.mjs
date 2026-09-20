const MAX_DATA_ROWS = 50000;

export function parseCSV(input, delimiter = ',') {
  if (typeof input !== 'string') throw new TypeError('CSV input must be a string');
  if (![',', '\t', ';'].includes(delimiter)) throw new Error('Delimiter must be comma, tab, or semicolon');
  if (input.charCodeAt(0) === 0xfeff) input = input.slice(1);

  const records = [];
  let fields = [], field = '', quoted = false, afterQuote = false, touched = false;
  let recordNo = 1;
  const pushRecord = () => {
    fields.push(field);
    const blank = !touched;
    if (!blank) records.push({ fields, row: recordNo });
    fields = []; field = ''; afterQuote = false; touched = false; recordNo++;
  };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; afterQuote = true; }
      } else field += c;
      continue;
    }
    if (afterQuote) {
      if (c === delimiter) { touched = true; fields.push(field); field = ''; afterQuote = false; }
      else if (c === '\r' || c === '\n') {
        if (c === '\r' && input[i + 1] === '\n') i++;
        pushRecord();
      } else throw new Error(`Malformed CSV quoting at character ${i + 1}: unexpected content after closing quote`);
      continue;
    }
    if (c === delimiter) { touched = true; fields.push(field); field = ''; }
    else if (c === '"') {
      if (field !== '') throw new Error(`Malformed CSV quoting at character ${i + 1}: quote must start a field`);
      touched = true; quoted = true;
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && input[i + 1] === '\n') i++;
      pushRecord();
    } else { touched = true; field += c; }
  }
  if (quoted) throw new Error(`Malformed CSV quoting at character ${input.length}: unclosed quoted field`);
  if (fields.length || field !== '' || afterQuote || touched) pushRecord();
  if (!records.length) return { headers: [], rows: [], rowNumbers: [], issues: [] };

  const headers = records[0].fields;
  const rows = records.slice(1).map(r => r.fields);
  const rowNumbers = records.slice(1).map(r => r.row);
  if (rows.length > MAX_DATA_ROWS) throw new Error(`CSV exceeds the maximum of ${MAX_DATA_ROWS} data rows`);
  const issues = [];
  rows.forEach((row, i) => {
    if (row.length !== headers.length) issues.push({ row: records[i + 1].row, kind: 'ragged', message: `Expected ${headers.length} fields, found ${row.length}` });
  });
  return { headers, rows, rowNumbers, issues };
}

const NUMBER_RE = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;
function numberValue(value) {
  const s = String(value).trim();
  if (!NUMBER_RE.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function daysInMonth(year, month) {
  if (month === 2) return (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
function dateValue(value) {
  const s = String(value).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
    const dt = new Date(0); dt.setUTCHours(0, 0, 0, 0); dt.setUTCFullYear(y, mo - 1, d); return dt.getTime();
  }
  m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})$/.exec(s);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3], h = +m[4], min = +m[5], sec = +(m[6] || 0);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo) || h > 23 || min > 59 || sec > 59) return null;
  const z = m[8];
  if (z !== 'Z') { const om = /[+-](\d{2}):?(\d{2})/.exec(z); if (+om[1] > 23 || +om[2] > 59) return null; }
  const n = Date.parse(s);
  return Number.isFinite(n) ? n : null;
}

export function analyze(rows, options = {}) {
  const { xColumn = 0, yColumn = 1, xMode = 'number', gapFactor = 3 } = options;
  const rowNumbers = Array.isArray(options.rowNumbers) ? options.rowNumbers : null;
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array');
  if (xMode !== 'number' && xMode !== 'date') throw new Error("xMode must be 'number' or 'date'");
  const points = [], issues = [];
  const stats = { rows: rows.length, validPoints: 0, missingY: 0, invalidX: 0, invalidY: 0, duplicateX: 0, outOfOrder: 0, gaps: 0 };
  const parseX = xMode === 'number' ? numberValue : dateValue;
  const validXs = [];
  const seenXs = new Set();
  const duplicateRows = new Set();
  let invalidBreakPending = false;
  const breakBeforeRows = new Set();
  let previousX = null;
  rows.forEach((row, i) => {
    const csvRow = rowNumbers?.[i] ?? i + 2;
    const x = parseX(row?.[xColumn] ?? '');
    const rawY = row?.[yColumn] ?? '';
    const yText = String(rawY).trim();
    let y = null;
    if (yText === '') { stats.missingY++; issues.push({ row: csvRow, kind: 'missingY', message: 'Y is blank' }); }
    else { y = numberValue(yText); if (y === null) { stats.invalidY++; issues.push({ row: csvRow, kind: 'invalidY', message: 'Y is not a valid finite number' }); } else if (x !== null) stats.validPoints++; }
    if (x === null) { stats.invalidX++; issues.push({ row: csvRow, kind: 'invalidX', message: 'X is not a valid finite value' }); invalidBreakPending = true; previousX = null; validXs.push(null); return; }
    if (invalidBreakPending) { breakBeforeRows.add(csvRow); invalidBreakPending = false; }
    if (previousX !== null) {
      if (x === previousX) { stats.duplicateX++; issues.push({ row: csvRow, kind: 'duplicateX', message: 'X duplicates a previous valid X' }); }
      else if (x < previousX) { stats.outOfOrder++; issues.push({ row: csvRow, kind: 'outOfOrder', message: 'X is earlier than the previous valid X' }); }
    }
    if (seenXs.has(x) && x !== previousX) { stats.duplicateX++; issues.push({ row: csvRow, kind: 'duplicateX', message: 'X duplicates a previous valid X' }); }
    if (seenXs.has(x)) duplicateRows.add(csvRow);
    seenXs.add(x); previousX = x; validXs.push(x); points.push({ x, y, row: csvRow });
  });
  const deltas = validXs.slice(1).map((x, i) => Number.isFinite(x) && Number.isFinite(validXs[i]) ? x - validXs[i] : null).filter(d => Number.isFinite(d) && d > 0).sort((a, b) => a - b);
  const median = deltas.length ? (deltas.length % 2 ? deltas[(deltas.length - 1) / 2] : deltas[deltas.length / 2 - 1] / 2 + deltas[deltas.length / 2] / 2) : null;
  const threshold = median !== null && Number.isFinite(gapFactor) && gapFactor > 0 ? gapFactor * median : null;
  const segments = [];
  let segment = [], prev = null;
  for (const point of points) {
    let split = breakBeforeRows.has(point.row) || duplicateRows.has(point.row) || point.y === null || (prev && point.x <= prev.x);
    if (prev && point.x !== null && prev.x !== null && threshold !== null && point.x > prev.x && point.x - prev.x > threshold) {
      stats.gaps++; issues.push({ row: point.row, kind: 'gap', message: 'Large forward X gap; segment split heuristically' }); split = true;
    }
    if (split) { if (segment.length) segments.push(segment); segment = []; }
    if (point.y !== null) segment.push(point);
    prev = point;
  }
  if (segment.length) segments.push(segment);
  return { points, segments, issues, stats, xMode };
}
