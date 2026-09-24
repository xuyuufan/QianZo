import { describe, expect, it } from "vitest";

import {
  DEMO_CURRENCY,
  describeAmount,
  describeBudget,
  formatMinorUnits,
  parseMinorUnits,
} from "@/modules/projects/money";

describe("money parsing", () => {
  it.each([
    ["1000", 100_000],
    ["0", 0],
    ["0.1", 10],
    ["19.99", 1999],
    ["1,234.50", 123_450],
    ["1,234", 123_400],
    ["1,234,567.89", 123_456_789],
    [" 12.30 ", 1230],
    ["999999999.99", 99_999_999_999],
  ])("parses %s exactly", (input, expected) => {
    expect(parseMinorUnits(input, DEMO_CURRENCY)).toBe(expected);
  });

  it("does not lose a cent to binary floating point", () => {
    // 19.99 * 100 is 1998.9999999999998, which is why the parser works on digits.
    expect(parseMinorUnits("19.99", DEMO_CURRENCY)).toBe(1999);
    expect(19.99 * 100).not.toBe(1999);
  });

  it.each([
    ["an empty value", ""],
    ["a non-numeric value", "abc"],
    ["too many decimals", "1.005"],
    ["a negative value", "-5"],
    ["a separator only", "."],
    ["an exponent", "1e3"],
    ["a malformed thousands grouping", "1,2,3"],
    ["a two-digit thousand group", "12,34"],
    ["an empty thousand group", "1,,2"],
    ["a five-digit lead group", "12345,678"],
  ])("rejects %s", (_label, input) => {
    expect(parseMinorUnits(input, DEMO_CURRENCY)).toBeNull();
  });

  it("applies the minor unit digits of the currency and falls back for unknown codes", () => {
    // JPY has no minor unit: a whole amount is exact, a fractional one is refused.
    expect(parseMinorUnits("1500", "JPY")).toBe(1500);
    expect(parseMinorUnits("1500.5", "JPY")).toBeNull();
    expect(parseMinorUnits("1,500", "JPY")).toBe(1500);
    expect(formatMinorUnits(1500, "JPY")).toBe("1500");
    expect(describeAmount(1500, "JPY")).toBe("JPY 1500");
    // An unknown currency is treated as the default two minor digits.
    expect(parseMinorUnits("100.5", "XYZ")).toBe(10_050);
    expect(parseMinorUnits("100.505", "XYZ")).toBeNull();
    expect(formatMinorUnits(10_050, "XYZ")).toBe("100.50");
  });

  it("rejects amounts beyond the safe integer range instead of losing precision", () => {
    // 90071992547409.91 CNY is exactly Number.MAX_SAFE_INTEGER minor units.
    expect(parseMinorUnits("90071992547409.91", DEMO_CURRENCY)).toBe(9_007_199_254_740_991);
    // One minor unit more can no longer be represented exactly: refuse, do not round.
    expect(parseMinorUnits("90071992547409.92", DEMO_CURRENCY)).toBeNull();
    // The same boundary applies to a zero-decimal currency on the major unit.
    expect(parseMinorUnits("9007199254740991", "JPY")).toBe(9_007_199_254_740_991);
    expect(parseMinorUnits("9007199254740992", "JPY")).toBeNull();
    // A very long digit string must not be coerced into a nearby float.
    expect(parseMinorUnits("1".repeat(20), DEMO_CURRENCY)).toBeNull();
    expect(parseMinorUnits("9".repeat(17), "JPY")).toBeNull();
    expect(parseMinorUnits("12345678901234567890", DEMO_CURRENCY)).toBeNull();
  });

  it("round-trips minor units and formats a budget range", () => {
    expect(formatMinorUnits(1999, DEMO_CURRENCY)).toBe("19.99");
    expect(formatMinorUnits(10, DEMO_CURRENCY)).toBe("0.10");
    expect(formatMinorUnits(0, DEMO_CURRENCY)).toBe("0.00");
    expect(describeBudget(100_000, 250_000, DEMO_CURRENCY)).toBe("¥1000.00 – ¥2500.00");
    expect(describeBudget(null, null, null)).toBeNull();
  });
});
