import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * The canonical snapshot of a document: one unambiguous JSON (sorted keys, no whitespace), and
 * its SHA-256. The preview shows it; issuance proceeds only if the tradesman confirmed exactly
 * this hash — what he saw is what is issued. Money is a canonical integer string, a source number
 * a canonical decimal string. Ported from the reference's `snapshots.py`.
 */
export const SNAPSHOT_SCHEMA_VERSION = 1;

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const INTEGER_MONEY = /^(?:0|-?[1-9][0-9]*)$/;
const CANONICAL_DECIMAL = /^(?:0|-?[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/;
const MONEY_FIELDS = new Set([
  'adjustments_total',
  'amount',
  'balance',
  'balance_due',
  'base_amount',
  'deposit',
  'deposit_requested',
  'grand_total',
  'indicative_after_deposit',
  'items_total',
  'line_amount',
  'paid_total',
  'subtotal',
  'tax_amount',
  'taxable_base',
  'total',
]);
const DECIMAL_SOURCE_FIELDS = new Set([
  'deposit_percent',
  'flat_amount',
  'quantity',
  'tax_rate',
  'unit_price',
]);
const ADJUSTMENT_MODES = new Set(['fixed', 'percent']);

export class SnapshotError extends Error {
  constructor(
    readonly path: string,
    readonly reason: string,
  ) {
    super(`${path}: ${reason}`);
  }
}

export interface DocumentSnapshot {
  canonicalJson: string;
  sha256: string;
}

/** A plain object only: a Date, a Set or a class instance has no unambiguous JSON form. */
function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeRecord(
  value: Record<string, unknown>,
  path: string,
): { [key: string]: JsonValue } {
  const out: { [key: string]: JsonValue } = {};
  for (const key of Object.keys(value).sort()) {
    if (!key) throw new SnapshotError(path, 'mapping keys must not be empty');
    const child = value[key];
    const childPath = `${path}.${key}`;
    if (child === null || child === undefined) {
      out[key] = null;
    } else if (MONEY_FIELDS.has(key)) {
      if (typeof child !== 'string' || !INTEGER_MONEY.test(child)) {
        throw new SnapshotError(childPath, 'money must be a canonical integer string');
      }
      out[key] = child;
    } else if (
      DECIMAL_SOURCE_FIELDS.has(key) ||
      (key === 'value' && typeof value.mode === 'string' && ADJUSTMENT_MODES.has(value.mode))
    ) {
      if (typeof child !== 'string' || !CANONICAL_DECIMAL.test(child)) {
        throw new SnapshotError(childPath, 'source number must be a canonical decimal string');
      }
      out[key] = child;
    } else {
      out[key] = normalize(child, childPath);
    }
  }
  return out;
}

function normalize(value: unknown, path: string): JsonValue {
  if (typeof value === 'string') {
    if (!value.isWellFormed()) throw new SnapshotError(path, 'text must be valid UTF-8');
    return value;
  }
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new SnapshotError(path, 'unsupported or ambiguous value type: non-integer number');
    }
    return value;
  }
  if (Array.isArray(value))
    return value.map((child, index) => normalize(child, `${path}[${index}]`));
  if (isRecord(value)) return normalizeRecord(value, path);
  throw new SnapshotError(path, `unsupported or ambiguous value type: ${typeof value}`);
}

/**
 * Serializes with sorted keys at every level (the reference's `sort_keys=True`). Keys sort by
 * code unit, never by locale: the bytes must not depend on the machine.
 */
function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key] as JsonValue)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function buildSnapshot(document: Record<string, unknown>): DocumentSnapshot {
  if ('schema_version' in document) {
    throw new SnapshotError('$.schema_version', 'schema_version is reserved for the envelope');
  }
  const envelope = {
    document: normalizeRecord(document, '$'),
    schema_version: SNAPSHOT_SCHEMA_VERSION,
  };
  const canonicalJson = canonical(envelope);
  return {
    canonicalJson,
    sha256: createHash('sha256').update(canonicalJson, 'utf8').digest('hex'),
  };
}

/** Constant-time comparison of the hash the tradesman confirmed with the snapshot's own. */
export function confirms(snapshot: DocumentSnapshot, confirmedSha256: string): boolean {
  const expected = Buffer.from(snapshot.sha256, 'utf8');
  const given = Buffer.from(confirmedSha256, 'utf8');
  return expected.length === given.length && timingSafeEqual(expected, given);
}
