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
 * amount for the currency.
 */
export function parseMinorUnits(input: string, currency: string): number | null {
  const normalized = input.trim().replaceAll(",", "");
  if (normalized.length === 0) {
    return null;
  }

  const digits = minorUnitDigits(currency);
  const pattern = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`);
  if (!pattern.test(normalized)) {
    return null;
  }

  const [whole, fraction = ""] = normalized.split(".");
  const paddedFraction = fraction.padEnd(digits, "0");
  const minorUnits = `${whole}${paddedFraction}`.replace(/^0+(?=\d)/, "");

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
  const symbol = currency === "CNY" ? "¥" : `${currency} `;
  return `${symbol}${formatMinorUnits(minMinor, currency)} – ${symbol}${formatMinorUnits(maxMinor, currency)}`;
}
