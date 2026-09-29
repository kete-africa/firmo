/**
 * Commercial numbers: one series per document type, burnt only at issuance. A series has a
 * prefix, a one-character separator, an optional year (annual cadence) and a minimum width.
 * A manual number is accepted if valid, unused and outside the automatic series; a revision keeps
 * its root and adds `/R2`, `/R3`. Ported from the reference's `numbering.py`, with its error codes.
 */
export class NumberingError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type SeriesCadence = 'continuous' | 'annual';

export interface SeriesFormat {
  prefix: string;
  separator: string;
  width: number;
  /** 0 for a continuous series, the issue year for an annual one. */
  year: number;
}

const MAX_COUNTER_VALUE = 9_223_372_036_854_775_807n;
const MAX_NUMBER_LENGTH = 128;
const ALLOWED_PUNCTUATION = new Set(['-', '_', '/', '.']);
const REVISION_TOKEN = /\/R[0-9]+/;
const REVISION_SUFFIX = /^(?<root>.+)\/R(?<revision>[1-9][0-9]*)$/;

function fail(code: string, message: string): never {
  throw new NumberingError(code, message);
}

function isNumberText(value: string): boolean {
  return (
    value.length > 0 &&
    [...value].every(
      (character) => /[\p{L}\p{N}]/u.test(character) || ALLOWED_PUNCTUATION.has(character),
    )
  );
}

function isPrintable(character: string): boolean {
  return !/[\p{C}]/u.test(character);
}

function validateSeries(series: SeriesFormat): void {
  if ([...series.prefix].some((c) => /\s/u.test(c) || !isPrintable(c))) {
    fail('invalid_series_prefix', 'series prefix contains unsupported characters');
  }
  if ([...series.separator].length !== 1) {
    fail('invalid_series_separator', 'series separator must be exactly one character');
  }
  if (/[\p{L}\p{N}\s]/u.test(series.separator) || !isPrintable(series.separator)) {
    fail('invalid_series_separator', 'series separator must be printable punctuation');
  }
  if (!Number.isInteger(series.width) || series.width < 1 || series.width > 12) {
    fail('invalid_series_width', 'series width is outside database bounds');
  }
  if (!Number.isInteger(series.year)) fail('invalid_series_year', 'series year must be an integer');
  if (series.year !== 0 && (series.year < 2000 || series.year > 9999)) {
    fail('invalid_series_year', 'series year is outside database bounds');
  }
}

/** The counter key of a series: 0 for continuous, the issue year for annual. */
export function counterYear(cadence: SeriesCadence, issuedOn: Date): number {
  if (cadence === 'continuous') return 0;
  if (cadence === 'annual') return issuedOn.getUTCFullYear();
  return fail('invalid_series_cadence', 'series cadence is not supported');
}

function stem(series: SeriesFormat): string {
  const parts = series.prefix ? [series.prefix] : [];
  if (series.year) parts.push(String(series.year));
  return parts.join(series.separator);
}

export function formatSeriesNumber(series: SeriesFormat, sequence: number | bigint): string {
  validateSeries(series);
  if (typeof sequence === 'number' && !Number.isInteger(sequence)) {
    fail('invalid_sequence', 'sequence must be an integer');
  }
  if (typeof sequence !== 'number' && typeof sequence !== 'bigint') {
    fail('invalid_sequence', 'sequence must be an integer');
  }
  const value = BigInt(sequence);
  if (value <= 0n || value > MAX_COUNTER_VALUE) {
    fail('invalid_sequence', 'sequence is outside database bounds');
  }
  const padded = value.toString().padStart(series.width, '0');
  const prefix = stem(series);
  const number = prefix ? `${prefix}${series.separator}${padded}` : padded;
  if (number.length > MAX_NUMBER_LENGTH)
    fail('number_too_long', 'number exceeds the supported length');
  return number;
}

export function ensureNumberAvailable(number: string, usedNumbers: Iterable<string>): void {
  for (const used of usedNumbers) {
    if (used === number)
      fail('number_already_used', 'document number is already used for this type');
  }
}

/** Whether the configured automatic series can generate this exact number. */
export function isAutomaticSeriesNumber(number: string, series: SeriesFormat): boolean {
  validateSeries(series);
  const prefix = stem(series);
  let sequenceText = number;
  if (prefix) {
    const marker = `${prefix}${series.separator}`;
    if (!number.startsWith(marker)) return false;
    sequenceText = number.slice(marker.length);
  }
  if (!/^[0-9]+$/.test(sequenceText)) return false;
  const sequence = BigInt(sequenceText);
  if (sequence <= 0n || sequence > MAX_COUNTER_VALUE) return false;
  return formatSeriesNumber(series, sequence) === number;
}

export function validateManualNumber(
  rawNumber: string,
  options: { usedNumbers?: Iterable<string>; automaticSeries?: SeriesFormat } = {},
): string {
  const number = rawNumber.trim();
  const first = number[0] ?? '';
  const last = number[number.length - 1] ?? '';
  if (
    !isNumberText(number) ||
    number.length > MAX_NUMBER_LENGTH ||
    ALLOWED_PUNCTUATION.has(first) ||
    ALLOWED_PUNCTUATION.has(last)
  ) {
    fail('invalid_manual_number', 'manual number has an unsupported format');
  }
  if (REVISION_TOKEN.test(number)) {
    fail('reserved_revision_suffix', 'manual number contains the reserved revision suffix');
  }
  if (options.automaticSeries && isAutomaticSeriesNumber(number, options.automaticSeries)) {
    fail('automatic_series_number_reserved', 'manual number belongs to the automatic series');
  }
  ensureNumberAvailable(number, options.usedNumbers ?? []);
  return number;
}

/** The commercial root and the revision (the original is revision one). */
export function splitRevisionNumber(number: string): { root: string; revision: number } {
  if (!number || number !== number.trim()) {
    fail('invalid_commercial_number', 'commercial number has an unsupported format');
  }
  const match = REVISION_SUFFIX.exec(number);
  if (match?.groups) {
    const root = match.groups.root ?? '';
    const revision = Number(match.groups.revision);
    if (revision < 2 || !isNumberText(root)) {
      fail('invalid_commercial_number', 'commercial revision number is malformed');
    }
    return { root, revision };
  }
  if (number.includes('/R') || !isNumberText(number)) {
    fail('invalid_commercial_number', 'commercial number has an unsupported format');
  }
  return { root: number, revision: 1 };
}

/** Appends `/R<n>` to the principal number, without consuming the main series. */
export function formatRevisionNumber(number: string, revision: number): string {
  if (!Number.isInteger(revision) || revision < 2) {
    fail('invalid_revision', 'revision must be an integer greater than or equal to two');
  }
  const { root } = splitRevisionNumber(number);
  const revised = `${root}/R${revision}`;
  if (revised.length > MAX_NUMBER_LENGTH) fail('number_too_long', 'revision number is too long');
  return revised;
}
