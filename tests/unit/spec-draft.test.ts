import { describe, expect, it } from "vitest";

import {
  clearSpecDraft,
  readSpecDraft,
  specDraftStorageKey,
  writeSpecDraft,
  type DraftStorage,
} from "@/app/enterprise/projects/[projectId]/spec/spec-draft";

/** A Map-backed stand-in for sessionStorage, so the rules need no browser. */
function createStorage(seed: Record<string, string> = {}) {
  const entries = new Map(Object.entries(seed));
  const storage: DraftStorage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
  return { entries, storage };
}

const serverContent = JSON.stringify({ schemaVersion: 1, projectGoal: "服务端版本" }, null, 2);
const editedContent = JSON.stringify({ schemaVersion: 1, projectGoal: "本地未保存修改" }, null, 2);

describe("spec draft storage", () => {
  it("scopes the key to the project", () => {
    expect(specDraftStorageKey("project-1")).toBe("qianzo:spec-draft:project-1");
    expect(specDraftStorageKey("project-2")).not.toBe(specDraftStorageKey("project-1"));
  });

  it("reads back a draft written against the same server version", () => {
    const { storage } = createStorage();
    writeSpecDraft(storage, specDraftStorageKey("p"), { content: editedContent, serverContent });

    expect(readSpecDraft(storage, specDraftStorageKey("p"), serverContent)).toEqual({
      content: editedContent,
      serverContent,
    });
  });

  it("ignores a draft written against a different server version", () => {
    const { storage } = createStorage();
    writeSpecDraft(storage, specDraftStorageKey("p"), { content: editedContent, serverContent });

    // A newer version was saved elsewhere: the stale draft must not shadow it.
    expect(readSpecDraft(storage, specDraftStorageKey("p"), `${serverContent}\n`)).toBeNull();
  });

  it("ignores missing, malformed and non-object payloads", () => {
    const key = specDraftStorageKey("p");
    expect(readSpecDraft(createStorage().storage, key, serverContent)).toBeNull();
    expect(readSpecDraft(createStorage({ [key]: "not json" }).storage, key, serverContent)).toBeNull();
    expect(readSpecDraft(createStorage({ [key]: "null" }).storage, key, serverContent)).toBeNull();
    expect(readSpecDraft(createStorage({ [key]: '"text"' }).storage, key, serverContent)).toBeNull();
    expect(
      readSpecDraft(createStorage({ [key]: JSON.stringify({ serverContent }) }).storage, key, serverContent),
    ).toBeNull();
  });

  it("drops a draft when it is cleared", () => {
    const { storage, entries } = createStorage();
    const key = specDraftStorageKey("p");
    writeSpecDraft(storage, key, { content: editedContent, serverContent });
    expect(entries.size).toBe(1);

    clearSpecDraft(storage, key);
    expect(readSpecDraft(storage, key, serverContent)).toBeNull();
  });

  it("never throws when storage is unavailable", () => {
    const failing: DraftStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };

    expect(readSpecDraft(failing, "p", serverContent)).toBeNull();
    expect(() => writeSpecDraft(failing, "p", { content: editedContent, serverContent })).not.toThrow();
    expect(() => clearSpecDraft(failing, "p")).not.toThrow();
  });
});
