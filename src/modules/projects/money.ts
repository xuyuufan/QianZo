/**
 * Exact money handling for the reference budget. Amounts are stored as integer
 * minor units and converted from user input by parsing digits — never by
 * multiplying a float by 100, which would round 19.99 to 1998.
 */

/** S1 runs the local demo in CNY; the column keeps room for more currencies. */
export const DEMO_CURRENCY = "CNY";

const minorUnitDigitsByCurrency: Record<string, number> = {
  CNY: 2,
  USD: 2,
  EUR: 2,
  JPY: 0,
};

export function minorUnitDigits(currency: string): number {
  return minorUnitDigitsByCurrency[currency] ?? 2;
}

/**
 * Accepts plain decimal input such as `1000`, `1000.5` or `1,234.50` and returns
 * the exact number of minor units, or `null` when the input is not a valid
 * amount for the currency. Thousands separators are only accepted when they
 * form a canonical grouping: `1,234` is fine, `1,2,3` and `12,34` are rejected
 * instead of being silently concatenated into another number.
 */
export function parseMinorUnits(input: string, currency: string): number | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Split off the fractional part first so the integer part can be checked
  // against the exact grouping rule below.
  const parts = trimmed.split(".");
  if (parts.length > 2) {
    return null;
  }
  const [whole, fraction] = parts;
  const digits = minorUnitDigits(currency);

  if (fraction !== undefined && (digits === 0 || !/^\d+$/.test(fraction) || fraction.length > digits)) {
    return null;
  }

  // Either every digit with no grouping, or groups of exactly three after a
  // 1-3 digit lead: this rejects `1,2,3`, `12,34` and `1,,2`.
  if (!/^\d+$/.test(whole) && !/^\d{1,3}(?:,\d{3})+$/.test(whole)) {
    return null;
  }
  const wholeDigits = whole.replaceAll(",", "");

  const paddedFraction = (fraction ?? "").padEnd(digits, "0");
  const minorUnits = `${wholeDigits}${paddedFraction}`.replace(/^0+(?=\d)/, "");

  const parsed = Number(minorUnits);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Renders minor units back into a plain decimal string for form inputs. */
export function formatMinorUnits(amountMinor: number, currency: string): string {
  const digits = minorUnitDigits(currency);
  if (digits === 0) {
    return String(amountMinor);
  }
  const padded = String(amountMinor).padStart(digits + 1, "0");
  const whole = padded.slice(0, -digits);
  const fraction = padded.slice(-digits);
  return `${whole}.${fraction}`;
}

/** Display form with a currency symbol, used in read-only summaries. */
export function describeBudget(
  minMinor: number | null,
  maxMinor: number | null,
  currency: string | null,
): string | null {
  if (minMinor === null || maxMinor === null || currency === null) {
    return null;
  }
  return `${describeAmount(minMinor, currency)} – ${describeAmount(maxMinor, currency)}`;
}

/** A single amount with its symbol, e.g. the fixed mock deposit. */
export function describeAmount(amountMinor: number, currency: string): string {
  const symbol = currency === "CNY" ? "¥" : `${currency} `;
  return `${symbol}${formatMinorUnits(amountMinor, currency)}`;
}
