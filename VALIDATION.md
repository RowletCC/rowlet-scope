# Release checks — Scope 0.1.0

Checked on 21 September 2026 (Asia/Shanghai).

## Core checks

`node --test test/core.test.mjs`: **12 passed, 0 failed**.

Coverage includes quoted and multiline records, delimiter selection, blank logical records and record numbering, malformed quoting, row limits, strict numeric parsing, calendar and timezone validation, early calendar years, missing values, invalid coordinates, nonadjacent duplicates, backwards steps, median interval calculation and segment boundaries.

## Browser checks

Performed through the Codex in-app browser using the actual file picker and page controls:

- Built-in synthetic sample: 89 records, 85 plotted points, 3 missing vertical values, 1 invalid coordinate and 1 long interval.
- `examples/gaps.csv`: 7 records, 6 points, 1 missing value and 1 long interval; issues mapped to logical records 4 and 8.
- `examples/quoted.tsv`: quoted column names and tab separation imported correctly; 4 records, 3 points and 1 missing value. Zero retained as an observed value.
- `examples/invalid.csv`: malformed quoting reported; old plot cleared and plot/report exports disabled. Accessible plot description and title cleared too. The sample button restored a valid plot and exports.
- SVG and JSON exports saved through the browser to local files. SVG parsed as XML with a 1040 × 500 viewBox and no NaN/Infinity coordinates. JSON counts, selected columns and issue records matched the imported gaps fixture. The browser automation download event timed out for the SVG, but the actual saved file was independently read and validated.
- Desktop and 390 px mobile layouts inspected; mobile document width matched its viewport, with no horizontal overflow.

These are parser, plotting and interaction checks. They are not scientific validation, a complete accessibility audit, a benchmark on large field datasets or certification across all browsers. No production field-data accuracy claim is made.
