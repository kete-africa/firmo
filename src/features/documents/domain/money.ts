import Decimal from 'decimal.js';

/**
 * Money is exact: decimal arithmetic, never binary floating point, rounded half-up to the unit of
 * the currency (the F CFA has no subunit). Ported from the reference's `money.py`.
 */
export const Dec = Decimal.clone({ precision: 50, rounding: Decimal.ROUND_HALF_UP });
export type Dec = Decimal;

export const ZERO = new Dec(0);
const HUNDRED = new Dec(100);

export class MoneyError extends Error {}

/** A decimal from a string, an integer or a Decimal — never a float, never a non-finite value. */
export function asDecimal(value: Dec | number | string): Dec {
  if (typeof value === 'number' && !Number.isInteger(value)) {
    throw new MoneyError('binary floating-point values are not accepted');
  }
  let result: Dec;
  try {
    result = new Dec(value);
  } catch {
    throw new MoneyError('value is not a valid decimal');
  }
  if (!result.isFinite()) throw new MoneyError('value must be finite');
  return result;
}

export function quantizeMoney(value: Dec | number | string): Dec {
  return asDecimal(value).toDecimalPlaces(0, Dec.ROUND_HALF_UP);
}

export function multiplyMoney(quantity: Dec, unitPrice: Dec): Dec {
  return quantizeMoney(asDecimal(quantity).times(asDecimal(unitPrice)));
}

export function percentageOf(base: Dec, rate: Dec): Dec {
  return quantizeMoney(asDecimal(base).times(asDecimal(rate)).dividedBy(HUNDRED));
}

/** The canonical integer text of an amount: "655000", "-105000". */
export function moneyToString(value: Dec | number | string): string {
  const text = quantizeMoney(value).toFixed(0);
  return text === '-0' ? '0' : text;
}

/** An amount as a tradesman reads it: "655 000". */
export function formatMoney(value: Dec | number | string): string {
  const text = moneyToString(value);
  const negative = text.startsWith('-');
  const digits = negative ? text.slice(1) : text;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return negative ? `-${grouped}` : grouped;
}

/** The shortest exact text of a decimal: "2.5", "12", "0". */
export function decimalText(value: Dec | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = value.toFixed();
  return text === '-0' ? '0' : text;
}
