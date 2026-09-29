import { describe, expect, it } from 'vitest';
import {
  counterYear,
  ensureNumberAvailable,
  formatRevisionNumber,
  formatSeriesNumber,
  isAutomaticSeriesNumber,
  NumberingError,
  splitRevisionNumber,
  validateManualNumber,
  type SeriesFormat,
} from '../domain/numbering';

// Ported from the reference's test_numbering.py.

const series = (overrides: Partial<SeriesFormat> = {}): SeriesFormat => ({
  prefix: 'DEV',
  separator: '-',
  width: 4,
  year: 0,
  ...overrides,
});

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof NumberingError) return error.code;
  }
  return 'no error';
}

describe('numbering', () => {
  it('formats prefix, year and padded sequence; a continuous series omits the year', () => {
    expect(formatSeriesNumber(series({ width: 3, year: 2026 }), 41)).toBe('DEV-2026-041');
    expect(formatSeriesNumber(series({ prefix: 'FAC' }), 17)).toBe('FAC-0017');
    expect(
      formatSeriesNumber(series({ prefix: 'DEV/LOME', separator: '/', width: 6, year: 2026 }), 1),
    ).toBe('DEV/LOME/2026/000001');
  });

  it('adds no leading separator without a prefix', () => {
    expect(formatSeriesNumber(series({ prefix: '', year: 2026 }), 7)).toBe('2026-0007');
    expect(formatSeriesNumber(series({ prefix: '' }), 7)).toBe('0007');
  });

  it('maps the cadence to the counter key', () => {
    expect(counterYear('continuous', new Date('2026-08-09'))).toBe(0);
    expect(counterYear('annual', new Date('2026-08-09'))).toBe(2026);
  });

  it.each([
    [series({ width: 0 }), 1, 'invalid_series_width'],
    [series({ width: 13 }), 1, 'invalid_series_width'],
    [series({ year: 1999 }), 1, 'invalid_series_year'],
    [series({ year: 10000 }), 1, 'invalid_series_year'],
    [series({ separator: '' }), 1, 'invalid_series_separator'],
    [series({ separator: '--' }), 1, 'invalid_series_separator'],
    [series({ prefix: 'DEV\n' }), 1, 'invalid_series_prefix'],
    [series(), 0, 'invalid_sequence'],
    [series(), -1, 'invalid_sequence'],
    [series(), 1.5, 'invalid_sequence'],
  ])('refuses an invalid series or sequence with a stable code (%#)', (format, sequence, code) => {
    expect(codeOf(() => formatSeriesNumber(format, sequence))).toBe(code);
  });

  it('treats the width as a minimum, never truncating', () => {
    expect(formatSeriesNumber(series({ width: 3, year: 2026 }), 10_001)).toBe('DEV-2026-10001');
  });

  it.each([
    [' DEV-2026-041 ', 'DEV-2026-041'],
    ['DEV/LOME/2026/000001', 'DEV/LOME/2026/000001'],
    ['facture_2026.17', 'facture_2026.17'],
  ])('normalizes a manual number without changing it (%s)', (raw, expected) => {
    expect(validateManualNumber(raw)).toBe(expected);
  });

  it.each([
    ['', 'invalid_manual_number'],
    ['   ', 'invalid_manual_number'],
    ['DEV 2026 041', 'invalid_manual_number'],
    ['DEV#041', 'invalid_manual_number'],
    ['DEV\n041', 'invalid_manual_number'],
    ['DEV-2026-041/R2', 'reserved_revision_suffix'],
    ['DEV/R12/EXTRA', 'reserved_revision_suffix'],
  ])('refuses a malformed or revision-shaped manual number (%j)', (raw, code) => {
    expect(codeOf(() => validateManualNumber(raw))).toBe(code);
  });

  it('refuses a manual number already used, with exact comparison', () => {
    expect(
      codeOf(() => validateManualNumber('DEV-2026-041', { usedNumbers: ['DEV-2026-041'] })),
    ).toBe('number_already_used');
    expect(() => ensureNumberAvailable('DEV-001', ['dev-001'])).not.toThrow();
  });

  it.each(['DEV-2026-001', 'DEV-2026-041', 'DEV-2026-10001'])(
    'reserves the automatic series (%s)',
    (number) => {
      const automaticSeries = series({ width: 3, year: 2026 });
      expect(codeOf(() => validateManualNumber(number, { automaticSeries }))).toBe(
        'automatic_series_number_reserved',
      );
    },
  );

  it.each(['DEV-SPECIAL-1', 'DEV-2025-001', 'FAC-2026-001', 'DEV-2026-0001', 'DEV-2026-000'])(
    'accepts a manual number outside the automatic series (%s)',
    (number) => {
      expect(
        validateManualNumber(number, { automaticSeries: series({ width: 3, year: 2026 }) }),
      ).toBe(number);
    },
  );

  it('recognizes a continuous series without prefix', () => {
    const format = series({ prefix: '' });
    expect(isAutomaticSeriesNumber('0001', format)).toBe(true);
    expect(isAutomaticSeriesNumber('001', format)).toBe(false);
    expect(isAutomaticSeriesNumber('MANUAL-0001', format)).toBe(false);
  });

  it('keeps the root of a revision and never nests', () => {
    expect(formatRevisionNumber('DEV-2026-041', 2)).toBe('DEV-2026-041/R2');
    expect(formatRevisionNumber('DEV-2026-041/R2', 3)).toBe('DEV-2026-041/R3');
    for (const revision of [0, 1, -1, 2.5]) {
      expect(codeOf(() => formatRevisionNumber('DEV-2026-041', revision))).toBe('invalid_revision');
    }
  });

  it('splits a commercial number into root and revision', () => {
    expect(splitRevisionNumber('DEV-2026-041')).toEqual({ root: 'DEV-2026-041', revision: 1 });
    expect(splitRevisionNumber('DEV-2026-041/R2')).toEqual({ root: 'DEV-2026-041', revision: 2 });
    expect(splitRevisionNumber('DEV/LOME/2026/000001/R12')).toEqual({
      root: 'DEV/LOME/2026/000001',
      revision: 12,
    });
    for (const number of ['', 'DEV-001/R0', 'DEV-001/R01', 'DEV-001/RX']) {
      expect(codeOf(() => splitRevisionNumber(number))).toBe('invalid_commercial_number');
    }
  });
});
