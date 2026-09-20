import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, analyze } from '../core.mjs';

test('parses BOM, quoted delimiters, doubled quotes, multiline and CRLF', () => {
  const out = parseCSV('\ufeffname, note\r\nA,"hello, ""world""\r\nnext"\r\nB,ok');
  assert.deepEqual(out.headers, ['name', ' note']);
  assert.deepEqual(out.rows, [['A', 'hello, "world"\r\nnext'], ['B', 'ok']]);
});
test('supports tab and semicolon delimiters, skips blank rows and flags ragged rows', () => {
  const out = parseCSV('\n a\tb\n1\t2\n\n3', '\t');
  assert.deepEqual(out.rows, [['1', '2'], ['3']]);
  assert.equal(out.issues[0].kind, 'ragged');
  assert.deepEqual(parseCSV('a;b\n1;2', ';').rows, [['1', '2']]);
});
test('retains comma-only and quoted-empty records, with logical row numbers', () => {
  const out = parseCSV('a,b\n\n,\n"",""\n1,2');
  assert.deepEqual(out.rows, [['', ''], ['', ''], ['1', '2']]);
  assert.deepEqual(out.rowNumbers, [3, 4, 5]);
});
test('rejects malformed quoting and row cap', () => {
  assert.throws(() => parseCSV('a,b\n"oops'), /unclosed quoted field/);
  const many = 'x\n' + Array.from({ length: 50001 }, (_, i) => String(i)).join('\n');
  assert.throws(() => parseCSV(many), /maximum of 50000/);
});
test('analyzes strict numbers, missing values, invalid values and order', () => {
  const a = analyze([['1', '0'], ['2', '1e3'], ['2', 'Infinity'], ['1', '4'], ['3', ''], ['4', 'x']], { xColumn: 0, yColumn: 1 });
  assert.deepEqual(a.points.map(p => p.y), [0, 1000, null, 4, null, null]);
  assert.equal(a.stats.validPoints, 3); assert.equal(a.stats.missingY, 1); assert.equal(a.stats.invalidY, 2);
  assert.equal(a.stats.duplicateX, 2); assert.equal(a.stats.outOfOrder, 1);
  assert.ok(a.segments.length >= 2);
});
test('validates dates, timezone requirement and leap days', () => {
  const a = analyze([['2024-02-29', '1'], ['2023-02-29', '2'], ['2024-01-01T00:00:00', '3'], ['2024-01-01T00:00:00+08:00', '4']], { xMode: 'date' });
  assert.equal(a.points.length, 2); assert.equal(a.points[0].row, 2); assert.equal(a.stats.invalidX, 2);
  assert.equal(a.points[1].x, Date.parse('2024-01-01T00:00:00+08:00'));
});
test('handles years below 100 and maps skipped records to issue rows', () => {
  const parsed = parseCSV('x,y\n\n0000-02-29,1\n0099-02-29,2');
  const a = analyze(parsed.rows, { xMode: 'date', rowNumbers: parsed.rowNumbers });
  assert.equal(a.points[0].row, 3); assert.equal(a.stats.invalidX, 1);
  assert.equal(a.issues.find(i => i.kind === 'invalidX').row, 4);
});
test('invalid X breaks segments and does not bridge gap baseline', () => {
  const a = analyze([['0', '1'], ['bad', '2'], ['2', '3']], { gapFactor: 3 });
  assert.deepEqual(a.segments.map(s => s.map(p => [p.x, p.y])), [[[0, 1]], [[2, 3]]]);
});
test('duplicates include nonadjacent values and even median gaps split', () => {
  const a = analyze([['0', '1'], ['1', '1'], ['3', '1'], ['6', '1'], ['0', '1'], ['20', '1']], { gapFactor: 3 });
  assert.equal(a.stats.duplicateX, 1);
  assert.ok(a.issues.some(i => i.kind === 'gap'));
});
test('splits at missing values and heuristic forward gaps', () => {
  const a = analyze([['0', '1'], ['1', '2'], ['2', ''], ['3', '4'], ['20', '5'], ['19', '6']], { gapFactor: 3 });
  assert.equal(a.stats.gaps, 1); assert.ok(a.issues.some(i => i.kind === 'gap'));
  assert.ok(a.segments.every(seg => seg.every(p => p.y !== null)));
});

test('a repeated coordinate starts a new segment even after a lower coordinate', () => {
  const a=analyze([['0','1'],['2','2'],['1','3'],['2','4'],['3','5']], {gapFactor: Infinity});
  assert.deepEqual(a.segments.map(s=>s.map(p=>p.row)), [[2,3],[4],[5,6]]);
  assert.equal(a.stats.duplicateX,1);
});

test('bad horizontal values do not hide independent missing or invalid vertical values',()=>{
 const a=analyze([['bad',''],['bad','oops'],['2','3']]);
 assert.equal(a.stats.invalidX,2);assert.equal(a.stats.missingY,1);assert.equal(a.stats.invalidY,1);assert.equal(a.stats.validPoints,1);
});
