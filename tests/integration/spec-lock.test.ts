import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AipmGateway } from "@/modules/aipm/gateway";
import { invokeAipmWithDatabase } from "@/modules/aipm/invocation";
import { createMockAipmGateway } from "@/modules/aipm/mock-gateway";
import { getProjectInterviewWithDatabase } from "@/modules/aipm/repository";
import { completeOnboardingWithDatabase, type Actor } from "@/modules/identity/onboarding";
import {
  createProjectWithDatabase,
  saveReferenceBudgetWithDatabase,
  updateProjectDraftWithDatabase,
} from "@/modules/projects/repository";
import {
  adoptSpecProposalWithDatabase,
  listProjectSpecVersionsWithDatabase,
  lockSpecWithDatabase,
  saveSpecVersionWithDatabase,
} from "@/modules/specs/repository";
import type { Database } from "@/platform/db/client";
import * as schema from "@/platform/db/schema";

import { clearDemoBusinessData } from "../helpers/demo-data";
import {
  loadLocalEnv,
  requireLoopbackApiUrl,
  requireLoopbackDatabaseUrl,
} from "../helpers/local-env";
import { createProjectWithBudgetAndSpec } from "../helpers/project-fixture";
import { validSpecDocument } from "../helpers/spec-fixture";

let admin: ReturnType<typeof postgres>;
let runtime: ReturnType<typeof postgres>;
let database: Database;
let authAdmin: SupabaseClient;
let enterpriseA: Actor;
let enterpriseB: Actor;
let userIds: string[] = [];

async function ensureAuthUser(email: string, password: string) {
  const { data: page, error: listError } = await authAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  const existing = page.users.find((user) => user.email === email);
  if (existing) return existing.id;
  const { data, error } = await authAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

/** A draft with one saved version and a complete reference budget. */
async function createLockableProject(actor: Actor = enterpriseA) {
  const fixture = await createProjectWithBudgetAndSpec(database, actor);
  return {
    withBudget: fixture.withBudget,
    version: fixture.specVersion,
    projectVersion: fixture.projectVersion,
  };
}

async function rawProject(projectId: string) {
  const [row] = await admin<
    {
      status: string;
      version: number;
      title: string;
      current_spec_version_id: string | null;
      locked_spec_version_id: string | null;
      locked_at: Date | null;
      budget_min_minor: string | null;
      budget_max_minor: string | null;
      currency: string | null;
    }[]
  >`
    select status, version, title, current_spec_version_id, locked_spec_version_id,
      locked_at, budget_min_minor, budget_max_minor, currency
    from app.projects where id = ${projectId}
  `;
  return row;
}

beforeAll(async () => {
  const { tools, app } = loadLocalEnv(resolve(import.meta.dirname, "../.."));
  if (!tools.DEMO_USER_PASSWORD) throw new Error("DEMO_USER_PASSWORD is required.");

  admin = postgres(requireLoopbackDatabaseUrl(tools.SUPABASE_DB_ADMIN_URL, "SUPABASE_DB_ADMIN_URL"), {
    max: 1,
    prepare: false,
  });
  runtime = postgres(requireLoopbackDatabaseUrl(app.DATABASE_URL, "DATABASE_URL"), {
    max: 5,
    prepare: false,
  });
  database = drizzle(runtime, { schema });
  authAdmin = createClient(
    requireLoopbackApiUrl(app.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    tools.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  userIds = await Promise.all([
    ensureAuthUser("lock-enterprise-a@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("lock-enterprise-b@qianzo.test", tools.DEMO_USER_PASSWORD),
  ]);
  await clearDemoBusinessData(admin, userIds);
  await admin`delete from app.user_roles where user_id in ${admin(userIds)}`;
  await admin`delete from app.users where id in ${admin(userIds)}`;

  enterpriseA = await completeOnboardingWithDatabase(database, userIds[0], {
    displayName: "锁定测试企业 A",
    roles: ["ENTERPRISE"],
  });
  enterpriseB = await completeOnboardingWithDatabase(database, userIds[1], {
    displayName: "锁定测试企业 B",
    roles: ["ENTERPRISE"],
  });
});

beforeEach(async () => {
  await clearDemoBusinessData(admin, userIds);
});

afterAll(async () => {
  if (admin && userIds.length) {
    await clearDemoBusinessData(admin, userIds);
    await admin`delete from app.user_roles where user_id in ${admin(userIds)}`;
    await admin`delete from app.users where id in ${admin(userIds)}`;
    for (const userId of userIds) {
      const { error } = await authAdmin.auth.admin.deleteUser(userId);
      if (error) throw error;
    }
  }
  await Promise.all([admin?.end(), runtime?.end()]);
});

describe("reference budget and locked scope", () => {
  it("stores the budget as exact minor units and bumps the project version", async () => {
    const draft = await createProjectWithDatabase(database, enterpriseA, {
      projectId: randomUUID(),
      title: "预算项目",
      originalRequirement: "预算需要精确到分。",
    });

    const updated = await saveReferenceBudgetWithDatabase(database, enterpriseA, {
      projectId: draft.id,
      expectedVersion: draft.version,
      // 19.99 * 100 would be 1998.9999999999998.
      minAmount: "19.99",
      maxAmount: "1,234.50",
    });

    expect(updated.budgetMinMinor).toBe(1999);
    expect(updated.budgetMaxMinor).toBe(123_450);
    expect(updated.currency).toBe("CNY");
    expect(updated.version).toBe(draft.version + 1);
  });

  it("rejects an incomplete, negative or inverted budget and a foreign project", async () => {
    const draft = await createProjectWithDatabase(database, enterpriseA, {
      projectId: randomUUID(),
      title: "预算校验项目",
      originalRequirement: "",
    });

    const cases: Array<[string, string, string]> = [
      ["an inverted range", "2000", "1000"],
      ["a non-numeric amount", "abc", "1000"],
      ["a negative amount", "-1", "1000"],
      ["too many decimals", "1.005", "2"],
    ];

    for (const [label, minAmount, maxAmount] of cases) {
      await expect(
        saveReferenceBudgetWithDatabase(database, enterpriseA, {
          projectId: draft.id,
          expectedVersion: draft.version,
          minAmount,
          maxAmount,
        }),
        label,
      ).rejects.toMatchObject({ name: "ZodError" });
    }

    await expect(
      saveReferenceBudgetWithDatabase(database, enterpriseB, {
        projectId: draft.id,
        expectedVersion: draft.version,
        minAmount: "1",
        maxAmount: "2",
      }),
    ).rejects.toMatchObject({ name: "ProjectError", code: "NOT_FOUND" });

    const stored = await rawProject(draft.id);
    expect(stored.budget_min_minor).toBeNull();
    expect(stored.version).toBe(draft.version);
  });

  it("locks the current version, keeps the project a draft and replays safely", async () => {
    const { version, projectVersion } = await createLockableProject();

    const locked = await lockSpecWithDatabase(database, enterpriseA, {
      projectId: version.projectId,
      specVersionId: version.id,
      expectedVersion: projectVersion,
    });

    expect(locked.id).toBe(version.id);
    const stored = await rawProject(version.projectId);
    expect(stored.status).toBe("DRAFT");
    expect(stored.locked_spec_version_id).toBe(version.id);
    expect(stored.locked_at).not.toBeNull();
    expect(stored.current_spec_version_id).toBe(version.id);
    expect(stored.version).toBe(projectVersion + 1);

    const replay = await lockSpecWithDatabase(database, enterpriseA, {
      projectId: version.projectId,
      specVersionId: version.id,
      expectedVersion: projectVersion,
    });
    expect(replay.id).toBe(version.id);
    const afterReplay = await rawProject(version.projectId);
    expect(afterReplay.version).toBe(stored.version);
  });

  it("refuses a stale lock confirmation that names another version", async () => {
    const { version, projectVersion } = await createLockableProject();
    await lockSpecWithDatabase(database, enterpriseA, {
      projectId: version.projectId,
      specVersionId: version.id,
      expectedVersion: projectVersion,
    });

    const other = await createLockableProject();

    // "Already locked" is only a safe replay when the submitted version is the
    // one that was locked; naming a different version is a different intent.
    await expect(
      lockSpecWithDatabase(database, enterpriseA, {
        projectId: version.projectId,
        specVersionId: other.version.id,
        expectedVersion: projectVersion,
      }),
    ).rejects.toMatchObject({ name: "SpecError", code: "SPEC_LOCKED" });

    const stored = await rawProject(version.projectId);
    expect(stored.locked_spec_version_id).toBe(version.id);
  });

  it("refuses to lock without a saved version, without a budget or with another project's version", async () => {
    const draft = await createProjectWithDatabase(database, enterpriseA, {
      projectId: randomUUID(),
      title: "无版本项目",
      originalRequirement: "",
    });

    await expect(
      lockSpecWithDatabase(database, enterpriseA, {
        projectId: draft.id,
        specVersionId: randomUUID(),
        expectedVersion: draft.version,
      }),
    ).rejects.toMatchObject({ name: "SpecError", code: "INVALID_PROPOSAL" });

    const withVersion = await saveSpecVersionWithDatabase(database, enterpriseA, {
      projectId: draft.id,
      expectedVersion: draft.version,
      document: validSpecDocument(),
    });

    // Saved version but no reference budget yet.
    await expect(
      lockSpecWithDatabase(database, enterpriseA, {
        projectId: draft.id,
        specVersionId: withVersion.id,
        expectedVersion: draft.version + 1,
      }),
    ).rejects.toMatchObject({ name: "SpecError", code: "INVALID_PROPOSAL" });

    const other = await createLockableProject(enterpriseB);
    await expect(
      lockSpecWithDatabase(database, enterpriseA, {
        projectId: draft.id,
        specVersionId: other.version.id,
        expectedVersion: draft.version + 1,
      }),
    ).rejects.toMatchObject({ name: "SpecError", code: "INVALID_PROPOSAL" });

    const stored = await rawProject(draft.id);
    expect(stored.locked_spec_version_id).toBeNull();
  });

  it("closes interview, adoption, editing and saving once the scope is locked", async () => {
    const { version, projectVersion } = await createLockableProject();
    await lockSpecWithDatabase(database, enterpriseA, {
      projectId: version.projectId,
      specVersionId: version.id,
      expectedVersion: projectVersion,
    });
    const locked = await rawProject(version.projectId);

    await expect(
      invokeAipmWithDatabase(database, enterpriseA, createMockAipmGateway(), {
        projectId: version.projectId,
        expectedVersion: locked.version,
        operation: "INTERVIEW",
        message: "锁定后再访谈。",
      }),
    ).rejects.toMatchObject({ name: "AipmError", code: "SPEC_LOCKED" });

    await expect(
      saveSpecVersionWithDatabase(database, enterpriseA, {
        projectId: version.projectId,
        expectedVersion: locked.version,
        document: validSpecDocument(),
      }),
    ).rejects.toMatchObject({ name: "SpecError", code: "SPEC_LOCKED" });

    await expect(
      saveReferenceBudgetWithDatabase(database, enterpriseA, {
        projectId: version.projectId,
        expectedVersion: locked.version,
        minAmount: "1",
        maxAmount: "2",
      }),
    ).rejects.toMatchObject({ name: "ProjectError", code: "SPEC_LOCKED" });

    await expect(
      updateProjectDraftWithDatabase(database, enterpriseA, {
        projectId: version.projectId,
        expectedVersion: locked.version,
        title: "锁定后改名",
        originalRequirement: "锁定后改需求。",
      }),
    ).rejects.toMatchObject({ name: "ProjectError", code: "SPEC_LOCKED" });

    // History stays readable.
    const history = await listProjectSpecVersionsWithDatabase(database, enterpriseA, version.projectId);
    expect(history?.versions).toHaveLength(1);
    expect(history?.current?.id).toBe(version.id);
  });

  it("checks the locked scope before the expected version on a manual save", async () => {
    const { version, projectVersion } = await createLockableProject();
    await lockSpecWithDatabase(database, enterpriseA, {
      projectId: version.projectId,
      specVersionId: version.id,
      expectedVersion: projectVersion,
    });

    // A stale tab still holds the pre-lock version. The locked-scope refusal
    // must win over the version conflict: the shared lock helper checks
    // not found → locked scope → version drift, exactly like the inline code
    // it replaced.
    await expect(
      saveSpecVersionWithDatabase(database, enterpriseA, {
        projectId: version.projectId,
        expectedVersion: projectVersion,
        document: validSpecDocument(),
      }),
    ).rejects.toMatchObject({ name: "SpecError", code: "SPEC_LOCKED" });

    const stored = await rawProject(version.projectId);
    expect(stored.version).toBe(projectVersion + 1);
  });

  it("checks the locked scope before the candidate's staleness on adoption", async () => {
    const { version, projectVersion } = await createLockableProject();
    const turn = await invokeAipmWithDatabase(database, enterpriseA, createMockAipmGateway(), {
      projectId: version.projectId,
      expectedVersion: projectVersion,
      operation: "GENERATE_SPEC",
      message: "功能范围是需求整理与范围确认；验收标准按里程碑逐条核对。",
    });
    if (!turn.hasProposal) {
      throw new Error("The generation turn must store a candidate.");
    }

    await lockSpecWithDatabase(database, enterpriseA, {
      projectId: version.projectId,
      specVersionId: version.id,
      expectedVersion: turn.projectVersion,
    });

    // The candidate is stale by now (generated before the lock moved the
    // version), but the locked scope must be reported first. A correct
    // expectedVersion is used so the version check alone cannot explain the
    // SPEC_LOCKED result.
    await expect(
      adoptSpecProposalWithDatabase(database, enterpriseA, {
        projectId: version.projectId,
        sourceMessageId: turn.messageId,
        expectedVersion: turn.projectVersion + 1,
      }),
    ).rejects.toMatchObject({ name: "SpecError", code: "SPEC_LOCKED" });

    const history = await listProjectSpecVersionsWithDatabase(
      database,
      enterpriseA,
      version.projectId,
    );
    expect(history?.versions).toHaveLength(1);
  });

  it("keeps the interview readable but never adoptable for a late answer after locking", async () => {
    const draft = await createProjectWithDatabase(database, enterpriseA, {
      projectId: randomUUID(),
      title: "迟到回复项目",
      originalRequirement: "访谈期间会被锁定。",
    });
    const version = await saveSpecVersionWithDatabase(database, enterpriseA, {
      projectId: draft.id,
      expectedVersion: draft.version,
      document: validSpecDocument(),
    });
    const withBudget = await saveReferenceBudgetWithDatabase(database, enterpriseA, {
      projectId: draft.id,
      expectedVersion: draft.version + 1,
      minAmount: "10",
      maxAmount: "20",
    });

    const mock = createMockAipmGateway();
    const gateway: AipmGateway = {
      async invoke(request) {
        // The enterprise locks the scope while the provider call is in flight.
        // Recording the user message already advanced the project version.
        await lockSpecWithDatabase(database, enterpriseA, {
          projectId: draft.id,
          specVersionId: version.id,
          expectedVersion: withBudget.version + 1,
        });
        return mock.invoke(request);
      },
    };

    const turn = await invokeAipmWithDatabase(database, enterpriseA, gateway, {
      projectId: draft.id,
      expectedVersion: withBudget.version,
      operation: "GENERATE_SPEC",
      message: "锁定瞬间发出的最后一条需求。",
    });

    expect(turn.hasProposal).toBe(true);
    expect(turn.adoptableProjectVersion).toBeNull();

    const interview = await getProjectInterviewWithDatabase(database, enterpriseA, draft.id);
    expect(interview?.messages).toHaveLength(2);
    expect(interview?.messages[1].payload?.adoptableProjectVersion).toBeNull();

    await expect(
      adoptSpecProposalWithDatabase(database, enterpriseA, {
        projectId: draft.id,
        sourceMessageId: turn.messageId,
        expectedVersion: turn.projectVersion,
      }),
    ).rejects.toMatchObject({ name: "SpecError", code: "SPEC_LOCKED" });

    const stored = await rawProject(draft.id);
    expect(stored.locked_spec_version_id).toBe(version.id);
    // The late answer still advanced the project version, which the trigger allows.
    expect(stored.version).toBe(turn.projectVersion);
  });

  it("lets only one of a concurrent lock and save change the project", async () => {
    const { version, projectVersion } = await createLockableProject();

    const results = await Promise.allSettled([
      lockSpecWithDatabase(database, enterpriseA, {
        projectId: version.projectId,
        specVersionId: version.id,
        expectedVersion: projectVersion,
      }),
      saveSpecVersionWithDatabase(database, enterpriseA, {
        projectId: version.projectId,
        expectedVersion: projectVersion,
        document: validSpecDocument(),
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(["VERSION_CONFLICT", "SPEC_LOCKED"]).toContain(
      (rejected[0] as PromiseRejectedResult).reason.code,
    );

    const stored = await rawProject(version.projectId);
    const history = await listProjectSpecVersionsWithDatabase(database, enterpriseA, version.projectId);
    if (stored.locked_spec_version_id) {
      // The lock won: current and locked point at the same version.
      expect(stored.current_spec_version_id).toBe(stored.locked_spec_version_id);
      expect(history?.versions).toHaveLength(1);
      expect(stored.version).toBe(projectVersion + 1);
    } else {
      // The save won: nothing is locked yet.
      expect(history?.versions).toHaveLength(2);
      expect(stored.version).toBe(projectVersion + 1);
    }
  });

  it("blocks direct SQL from rewriting the frozen scope", async () => {
    const { version, projectVersion } = await createLockableProject();
    await lockSpecWithDatabase(database, enterpriseA, {
      projectId: version.projectId,
      specVersionId: version.id,
      expectedVersion: projectVersion,
    });
    const locked = await rawProject(version.projectId);
    const projectId = version.projectId;

    // Every statement targets this test's own project only.
    const statements = [
      `update app.projects set title = 'SQL 改名' where id = '${projectId}'`,
      `update app.projects set original_requirement = 'SQL 改需求' where id = '${projectId}'`,
      `update app.projects set budget_min_minor = 1, budget_max_minor = 2 where id = '${projectId}'`,
      `update app.projects set locked_spec_version_id = null, locked_at = null where id = '${projectId}'`,
      `update app.projects set current_spec_version_id = null where id = '${projectId}'`,
    ];

    for (const statement of statements) {
      await expect(runtime.unsafe(statement), statement).rejects.toMatchObject({ severity: "ERROR" });
    }

    const stored = await rawProject(projectId);
    expect(stored).toEqual(locked);

    // A version of another project can never be pointed at, even by SQL.
    const other = await createLockableProject(enterpriseB);
    await expect(
      admin`update app.projects set locked_spec_version_id = ${other.version.id} where id = ${projectId}`,
    ).rejects.toMatchObject({ severity: "ERROR" });
  });
});
