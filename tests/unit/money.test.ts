import { describe, expect, it } from "vitest";

import {
  DEMO_CURRENCY,
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
  ])("rejects %s", (_label, input) => {
    expect(parseMinorUnits(input, DEMO_CURRENCY)).toBeNull();
  });

  it("round-trips minor units and formats a budget range", () => {
    expect(formatMinorUnits(1999, DEMO_CURRENCY)).toBe("19.99");
    expect(formatMinorUnits(10, DEMO_CURRENCY)).toBe("0.10");
    expect(formatMinorUnits(0, DEMO_CURRENCY)).toBe("0.00");
    expect(describeBudget(100_000, 250_000, DEMO_CURRENCY)).toBe("¥1000.00 – ¥2500.00");
    expect(describeBudget(null, null, null)).toBeNull();
  });
});
