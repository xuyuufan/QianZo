import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { invokeAipmWithDatabase } from "@/modules/aipm/invocation";
import { createMockAipmGateway } from "@/modules/aipm/mock-gateway";
import type { AipmRequest } from "@/modules/aipm/contract";
import type { AipmGateway } from "@/modules/aipm/gateway";
import { getProjectInterviewWithDatabase } from "@/modules/aipm/repository";
import { completeOnboardingWithDatabase, type Actor } from "@/modules/identity/onboarding";
import {
  createProjectWithDatabase,
  updateProjectDraftWithDatabase,
} from "@/modules/projects/repository";
import type { Database } from "@/platform/db/client";
import * as schema from "@/platform/db/schema";

import {
  loadLocalEnv,
  requireLoopbackApiUrl,
  requireLoopbackDatabaseUrl,
} from "../helpers/local-env";
import { clearDemoBusinessData } from "../helpers/demo-data";

let admin: ReturnType<typeof postgres>;
let runtime: ReturnType<typeof postgres>;
let database: Database;
let authAdmin: SupabaseClient;
let enterpriseA: Actor;
let enterpriseB: Actor;
let builder: Actor;
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

async function deleteInterviewData() {
  await clearDemoBusinessData(admin, userIds);
}

function turnInput(
  projectId: string,
  expectedVersion: number,
  operation: "INTERVIEW" | "GENERATE_SPEC" = "INTERVIEW",
  message = "补充一条合成需求：需要按里程碑验收。",
) {
  return { projectId, expectedVersion, operation, message };
}

async function createDraft(actor: Actor = enterpriseA, title = "S1 访谈项目") {
  return createProjectWithDatabase(database, actor, {
    projectId: randomUUID(),
    title,
    originalRequirement: "希望把模糊需求整理成可招募的确认范围。",
  });
}

async function storedPayloads(actor: Actor, projectId: string) {
  const interview = await getProjectInterviewWithDatabase(database, actor, projectId);
  if (!interview) throw new Error("The interview should be readable by its owner.");
  return interview;
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
    ensureAuthUser("aipm-enterprise-a@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("aipm-enterprise-b@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("aipm-builder@qianzo.test", tools.DEMO_USER_PASSWORD),
  ]);
  await deleteInterviewData();
  await admin`delete from app.user_roles where user_id in ${admin(userIds)}`;
  await admin`delete from app.users where id in ${admin(userIds)}`;

  enterpriseA = await completeOnboardingWithDatabase(database, userIds[0], {
    displayName: "访谈测试企业 A",
    roles: ["ENTERPRISE"],
  });
  enterpriseB = await completeOnboardingWithDatabase(database, userIds[1], {
    displayName: "访谈测试企业 B",
    roles: ["ENTERPRISE"],
  });
  builder = await completeOnboardingWithDatabase(database, userIds[2], {
    displayName: "访谈测试 Builder",
    roles: ["BUILDER"],
  });
});

beforeEach(deleteInterviewData);

afterAll(async () => {
  if (admin && userIds.length) {
    await deleteInterviewData();
    await admin`delete from app.user_roles where user_id in ${admin(userIds)}`;
    await admin`delete from app.users where id in ${admin(userIds)}`;
    for (const userId of userIds) {
      const { error } = await authAdmin.auth.admin.deleteUser(userId);
      if (error) throw error;
    }
  }
  await Promise.all([admin?.end(), runtime?.end()]);
});

describe("AIPM interview boundary", () => {
  it("records the user message before the call and the validated answer afterwards", async () => {
    const project = await createDraft();
    const requests: AipmRequest[] = [];
    const mock = createMockAipmGateway();
    const gateway: AipmGateway = {
      async invoke(request) {
        requests.push(request);
        return mock.invoke(request);
      },
    };
    const invocationId = randomUUID();

    const result = await invokeAipmWithDatabase(
      database,
      enterpriseA,
      gateway,
      turnInput(project.id, project.version),
      { invocationId },
    );

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      invocationId,
      operation: "INTERVIEW",
      baseSpec: null,
    });
    expect(requests[0].messages).toEqual([
      { role: "user", content: "补充一条合成需求：需要按里程碑验收。" },
    ]);

    const interview = await storedPayloads(enterpriseA, project.id);
    expect(requests[0].sessionId).toBe(interview.sessionId);
    expect(interview.messages).toHaveLength(2);
    expect(interview.messages.map((message) => message.role)).toEqual(["USER", "ASSISTANT"]);
    // One increment for the recorded user message, one for the recorded answer.
    expect(interview.project.version).toBe(project.version + 2);
    expect(result.adoptableProjectVersion).toBe(interview.project.version);

    const payload = interview.messages[1].payload;
    expect(payload).toMatchObject({
      invocationId,
      contractVersion: "1",
      operation: "INTERVIEW",
      generatedFromProjectVersion: project.version + 1,
      baseSpecVersionId: null,
      adoptableProjectVersion: project.version + 2,
    });
    expect(payload?.result.specProposal).toBeUndefined();
  });

  it("calls the provider outside any database transaction", async () => {
    const project = await createDraft();
    const mock = createMockAipmGateway();
    let lockAcquired = false;

    const gateway: AipmGateway = {
      async invoke(request) {
        // A separate connection must be able to take the project row lock while
        // the provider call is in flight, which fails as soon as the platform
        // holds that row for the duration of the call.
        await runtime`select id from app.projects where id = ${request.project.id} for update nowait`;
        lockAcquired = true;
        return mock.invoke(request);
      },
    };

    await invokeAipmWithDatabase(database, enterpriseA, gateway, turnInput(project.id, project.version));

    expect(lockAcquired).toBe(true);
  });

  it("keeps the user message and stores nothing when the provider fails", async () => {
    const project = await createDraft();
    const gateway = createMockAipmGateway({
      failWith: { code: "UPSTREAM_TIMEOUT", message: "provider detail must not leak" },
    });

    await expect(
      invokeAipmWithDatabase(database, enterpriseA, gateway, turnInput(project.id, project.version)),
    ).rejects.toMatchObject({ name: "AipmError", code: "PROVIDER_FAILED" });

    const interview = await storedPayloads(enterpriseA, project.id);
    expect(interview.messages.map((message) => message.role)).toEqual(["USER"]);
    expect(interview.project.version).toBe(project.version + 1);
  });

  const unusableResponses: Array<[string, AipmGateway, string]> = [
    ["a wrong invocation id", createMockAipmGateway({ mismatchInvocationId: true }), "CONTRACT_MISMATCH"],
    ["a missing proposal", createMockAipmGateway({ omitSpecProposal: true }), "MISSING_SPEC"],
    ["an invalid proposal", createMockAipmGateway({ invalidSpecProposal: true }), "INVALID_RESPONSE"],
    [
      "an oversized payload",
      createMockAipmGateway({ respondWith: { padding: "x".repeat(200_001) } }),
      "INVALID_RESPONSE",
    ],
  ];

  it.each(unusableResponses)("does not persist %s", async (_label, gateway, expectedCode) => {
    const project = await createDraft();

    await expect(
      invokeAipmWithDatabase(database, enterpriseA, gateway, turnInput(project.id, project.version, "GENERATE_SPEC")),
    ).rejects.toMatchObject({ name: "AipmError", code: expectedCode });

    const interview = await storedPayloads(enterpriseA, project.id);
    expect(interview.messages.map((message) => message.role)).toEqual(["USER"]);
    expect(interview.project.version).toBe(project.version + 1);
  });

  it("scopes the interview to the owning enterprise and the enterprise role", async () => {
    const project = await createDraft();
    const gateway = createMockAipmGateway();

    await expect(
      invokeAipmWithDatabase(database, enterpriseB, gateway, turnInput(project.id, project.version)),
    ).rejects.toMatchObject({ name: "AipmError", code: "NOT_FOUND" });

    await expect(
      invokeAipmWithDatabase(database, builder, gateway, turnInput(project.id, project.version)),
    ).rejects.toMatchObject({ name: "IdentityError", code: "ROLE_REQUIRED" });

    expect(await getProjectInterviewWithDatabase(database, enterpriseB, project.id)).toBeNull();
    await expect(getProjectInterviewWithDatabase(database, builder, project.id)).rejects.toMatchObject({
      name: "IdentityError",
      code: "ROLE_REQUIRED",
    });

    const interview = await storedPayloads(enterpriseA, project.id);
    expect(interview.messages).toHaveLength(0);
    expect(interview.project.version).toBe(project.version);
  });

  it("rejects a stale expected version without writing anything", async () => {
    const project = await createDraft();
    // An old tab still holds version 1 while the draft has moved on.
    const updated = await updateProjectDraftWithDatabase(database, enterpriseA, {
      projectId: project.id,
      expectedVersion: project.version,
      title: "已更新的标题",
      originalRequirement: "已更新的需求。",
    });

    await expect(
      invokeAipmWithDatabase(
        database,
        enterpriseA,
        createMockAipmGateway(),
        turnInput(project.id, project.version),
      ),
    ).rejects.toMatchObject({ name: "AipmError", code: "VERSION_CONFLICT" });

    const interview = await storedPayloads(enterpriseA, project.id);
    expect(interview.messages).toHaveLength(0);
    expect(interview.project.version).toBe(updated.version);
  });

  it("keeps the answer but marks the candidate stale when the project changed during the call", async () => {
    const project = await createDraft();
    const mock = createMockAipmGateway();
    const gateway: AipmGateway = {
      async invoke(request) {
        // Another tab saves the draft while the provider call is in flight.
        await updateProjectDraftWithDatabase(database, enterpriseA, {
          projectId: project.id,
          expectedVersion: project.version + 1,
          title: "并发修改后的标题",
          originalRequirement: "并发修改后的需求。",
        });
        return mock.invoke(request);
      },
    };

    const result = await invokeAipmWithDatabase(
      database,
      enterpriseA,
      gateway,
      turnInput(project.id, project.version, "GENERATE_SPEC"),
    );

    expect(result.hasProposal).toBe(true);
    expect(result.adoptableProjectVersion).toBeNull();

    const interview = await storedPayloads(enterpriseA, project.id);
    expect(interview.project.version).toBe(project.version + 3);
    expect(interview.messages).toHaveLength(2);
    expect(interview.messages[1].payload?.adoptableProjectVersion).toBeNull();
    expect(interview.messages[1].payload?.generatedFromProjectVersion).toBe(project.version + 1);
    // A late answer never rewrites the newer baseline.
    expect(interview.messages[1].payload?.result.specProposal).toBeDefined();
    expect(interview.project.title).toBe("并发修改后的标题");
  });

  it("refuses a turn once the transcript reaches the session cap", async () => {
    const project = await createDraft();
    await invokeAipmWithDatabase(
      database,
      enterpriseA,
      createMockAipmGateway(),
      turnInput(project.id, project.version),
    );

    const interview = await storedPayloads(enterpriseA, project.id);
    if (!interview.sessionId) throw new Error("The first turn must create a session.");

    await admin`
      insert into app.aipm_messages (id, session_id, sequence, role, content)
      select gen_random_uuid(), ${interview.sessionId}, g, 'USER', '填充消息'
      from generate_series(3, 40) as g
    `;

    await expect(
      invokeAipmWithDatabase(
        database,
        enterpriseA,
        createMockAipmGateway(),
        turnInput(project.id, interview.project.version),
      ),
    ).rejects.toMatchObject({ name: "AipmError", code: "MESSAGE_LIMIT_REACHED" });

    const after = await storedPayloads(enterpriseA, project.id);
    expect(after.messages).toHaveLength(40);
    expect(after.project.version).toBe(interview.project.version);
  });

  it("refuses an entire round when an odd history cannot hold a full pair, without half-writing", async () => {
    const project = await createDraft();
    // A provider failure stores only the USER message: the history is now odd,
    // which is the state the off-by-one fix has to survive.
    await expect(
      invokeAipmWithDatabase(
        database,
        enterpriseA,
        createMockAipmGateway({ failWith: { code: "UPSTREAM_TIMEOUT", message: "provider detail" } }),
        turnInput(project.id, project.version),
      ),
    ).rejects.toMatchObject({ name: "AipmError", code: "PROVIDER_FAILED" });

    const afterFailure = await storedPayloads(enterpriseA, project.id);
    if (!afterFailure.sessionId) throw new Error("The failed turn must still create a session.");
    expect(afterFailure.messages).toHaveLength(1);

    // Pad the session to 39 stored rows: odd, one below the cap.
    await admin`
      insert into app.aipm_messages (id, session_id, sequence, role, content)
      select gen_random_uuid(), ${afterFailure.sessionId}, g, 'USER', '填充消息'
      from generate_series(2, 39) as g
    `;

    const before = await storedPayloads(enterpriseA, project.id);
    expect(before.messages).toHaveLength(39);

    // The round is rejected as a whole at `begin`: no USER row, no version bump.
    await expect(
      invokeAipmWithDatabase(
        database,
        enterpriseA,
        createMockAipmGateway(),
        turnInput(project.id, before.project.version),
      ),
    ).rejects.toMatchObject({ name: "AipmError", code: "MESSAGE_LIMIT_REACHED" });

    const after = await storedPayloads(enterpriseA, project.id);
    expect(after.messages).toHaveLength(39);
    expect(after.project.version).toBe(before.project.version);
  });

  it("stores the last fitting round as a complete pair and refuses the next round entirely", async () => {
    const project = await createDraft();
    await invokeAipmWithDatabase(
      database,
      enterpriseA,
      createMockAipmGateway(),
      turnInput(project.id, project.version),
    );

    const interview = await storedPayloads(enterpriseA, project.id);
    if (!interview.sessionId) throw new Error("The first turn must create a session.");
    expect(interview.messages.map((message) => message.role)).toEqual(["USER", "ASSISTANT"]);

    // 2 rows exist; pad to 38 so exactly one full round (USER + ASSISTANT) fits.
    await admin`
      insert into app.aipm_messages (id, session_id, sequence, role, content)
      select gen_random_uuid(), ${interview.sessionId}, g, 'USER', '填充消息'
      from generate_series(3, 38) as g
    `;

    const versionBefore = interview.project.version;
    await invokeAipmWithDatabase(
      database,
      enterpriseA,
      createMockAipmGateway(),
      turnInput(project.id, versionBefore),
    );

    // The round landed as a complete pair; nothing is stranded half-way.
    const atCap = await storedPayloads(enterpriseA, project.id);
    expect(atCap.messages).toHaveLength(40);
    expect(atCap.messages.map((message) => message.role).slice(-2)).toEqual(["USER", "ASSISTANT"]);
    expect(atCap.project.version).toBe(versionBefore + 2);

    // The next round is refused entirely: no USER row, no version bump.
    await expect(
      invokeAipmWithDatabase(
        database,
        enterpriseA,
        createMockAipmGateway(),
        turnInput(project.id, versionBefore + 2),
      ),
    ).rejects.toMatchObject({ name: "AipmError", code: "MESSAGE_LIMIT_REACHED" });

    const after = await storedPayloads(enterpriseA, project.id);
    expect(after.messages).toHaveLength(40);
    expect(after.project.version).toBe(versionBefore + 2);
  });

  it("stores a validated proposal that only the owner can read back", async () => {
    const project = await createDraft();
    await invokeAipmWithDatabase(
      database,
      enterpriseA,
      createMockAipmGateway(),
      turnInput(project.id, project.version, "INTERVIEW", "第一条需求说明"),
    );

    const afterFirstTurn = await storedPayloads(enterpriseA, project.id);
    const result = await invokeAipmWithDatabase(
      database,
      enterpriseA,
      createMockAipmGateway(),
      turnInput(project.id, afterFirstTurn.project.version, "GENERATE_SPEC", "需要按里程碑验收。"),
    );

    expect(result.hasProposal).toBe(true);

    const interview = await storedPayloads(enterpriseA, project.id);
    const proposal = interview.messages[interview.messages.length - 1].payload?.result.specProposal;
    expect(proposal?.schemaVersion).toBe(1);
    expect(proposal?.milestones.length).toBeGreaterThan(0);
    expect(interview.messages).toHaveLength(4);
    expect(await getProjectInterviewWithDatabase(database, enterpriseB, project.id)).toBeNull();
  });
});
