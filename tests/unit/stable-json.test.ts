import { describe, expect, it } from "vitest";

import { stableJson } from "@/modules/recruitment/snapshot";

/**
 * The repeated-publish check compares the stored snapshot with the freshly
 * submitted preview through `stableJson`. A JSONB round trip (or a different
 * client) can hand back the same object with a different key order, so the
 * serialisation must depend on the semantic content, never on insertion order.
 */
describe("stableJson", () => {
  it("serialises objects with different key order to the same string", () => {
    const stored = {
      schemaVersion: 1,
      title: "已脱敏的招募标题",
      budget: { minMinor: 100_000, maxMinor: 250_050, currency: "CNY" },
      document: { projectGoal: "合成目标", features: [{ id: "feature-1", title: "需求整理" }] },
    };
    const submitted = {
      document: { features: [{ title: "需求整理", id: "feature-1" }], projectGoal: "合成目标" },
      budget: { currency: "CNY", maxMinor: 250_050, minMinor: 100_000 },
      title: "已脱敏的招募标题",
      schemaVersion: 1,
    };

    expect(stableJson(submitted)).toBe(stableJson(stored));
    expect(stableJson(stored)).toBe(stableJson(stored));
  });

  it("treats the same nested key order difference inside arrays as equal", () => {
    const a = { milestones: [{ id: "m1", dueAfterDays: 10 }, { id: "m2", dueAfterDays: 24 }] };
    const b = { milestones: [{ dueAfterDays: 10, id: "m1" }, { dueAfterDays: 24, id: "m2" }] };

    expect(stableJson(b)).toBe(stableJson(a));
  });

  it("keeps array order significant, including inside objects", () => {
    expect(stableJson([1, 2])).not.toBe(stableJson([2, 1]));
    expect(stableJson([1, 2])).not.toBe(stableJson([1, 2, 2]));

    const ordered = { milestones: [{ id: "m1" }, { id: "m2" }] };
    const swapped = { milestones: [{ id: "m2" }, { id: "m1" }] };
    expect(stableJson(swapped)).not.toBe(stableJson(ordered));
  });

  it("agrees with JSON.stringify for already-ordered input and renders null-like values", () => {
    expect(stableJson({ a: 1, b: [true, null, "x"] })).toBe('{"a":1,"b":[true,null,"x"]}');
    expect(stableJson(null)).toBe("null");
    expect(stableJson(undefined)).toBe("null");
    expect(stableJson(19.99)).toBe(JSON.stringify(19.99));
  });
});
