import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AipmRequest } from "@/modules/aipm/contract";
import type { AipmGateway } from "@/modules/aipm/gateway";
import { invokeAipmWithDatabase } from "@/modules/aipm/invocation";
import { createMockAipmGateway } from "@/modules/aipm/mock-gateway";
import { getProjectInterviewWithDatabase } from "@/modules/aipm/repository";
import { completeOnboardingWithDatabase, type Actor } from "@/modules/identity/onboarding";
import {
  createProjectWithDatabase,
  updateProjectDraftWithDatabase,
} from "@/modules/projects/repository";
import {
  adoptSpecProposalWithDatabase,
  listProjectSpecVersionsWithDatabase,
  saveSpecVersionWithDatabase,
} from "@/modules/specs/repository";
import type { SpecDocumentV1 } from "@/modules/specs/document";
import type { Database } from "@/platform/db/client";
import * as schema from "@/platform/db/schema";

import { clearDemoBusinessData } from "../helpers/demo-data";
import {
  loadLocalEnv,
  requireLoopbackApiUrl,
  requireLoopbackDatabaseUrl,
} from "../helpers/local-env";
import { validSpecDocument } from "../helpers/spec-fixture";

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

async function createDraft(actor: Actor = enterpriseA, title = "S1 Spec 版本项目") {
  return createProjectWithDatabase(database, actor, {
    projectId: randomUUID(),
    title,
    originalRequirement: "希望把需求整理成可招募的确认范围。",
  });
}

/** Runs one generation turn and returns the stored candidate message. */
async function generateCandidate(projectId: string, expectedVersion: number) {
  const turn = await invokeAipmWithDatabase(database, enterpriseA, createMockAipmGateway(), {
    projectId,
    expectedVersion,
    operation: "GENERATE_SPEC",
    message: "功能范围是需求整理与范围确认；验收标准按里程碑逐条核对。",
  });
  if (!turn.hasProposal) throw new Error("The generation turn must store a candidate.");
  return turn;
}

async function specVersionCount(projectId: string) {
  const [row] = await admin<{ count: string }[]>`
    select count(*)::text as count from app.spec_versions where project_id = ${projectId}
  `;
  return Number(row.count);
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
    ensureAuthUser("specs-enterprise-a@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("specs-enterprise-b@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("specs-builder@qianzo.test", tools.DEMO_USER_PASSWORD),
  ]);
  await clearDemoBusinessData(admin, userIds);
  await admin`delete from app.user_roles where user_id in ${admin(userIds)}`;
  await admin`delete from app.users where id in ${admin(userIds)}`;

  enterpriseA = await completeOnboardingWithDatabase(database, userIds[0], {
    displayName: "Spec 测试企业 A",
    roles: ["ENTERPRISE"],
  });
  enterpriseB = await completeOnboardingWithDatabase(database, userIds[1], {
    displayName: "Spec 测试企业 B",
    roles: ["ENTERPRISE"],
  });
  builder = await completeOnboardingWithDatabase(database, userIds[2], {
    displayName: "Spec 测试 Builder",
    roles: ["BUILDER"],
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

describe("spec version boundary", () => {
  it("adopts a stored candidate into an immutable version and points the project at it", async () => {
    const project = await createDraft();
    const turn = await generateCandidate(project.id, project.version);

    const adopted = await adoptSpecProposalWithDatabase(database, enterpriseA, {
      projectId: project.id,
      sourceMessageId: turn.messageId,
      expectedVersion: turn.projectVersion,
    });

    expect(adopted.versionNo).toBe(1);
    expect(adopted.sourceMessageId).toBe(turn.messageId);
    expect(adopted.createdBy).toBe(enterpriseA.id);
    expect(adopted.document?.milestones.length).toBeGreaterThan(0);

    const history = await listProjectSpecVersionsWithDatabase(database, enterpriseA, project.id);
    expect(history?.versions).toHaveLength(1);
    expect(history?.current?.id).toBe(adopted.id);
    expect(history?.project.currentSpecVersionId).toBe(adopted.id);
    // Adopting a candidate is a project change: the version token moves on.
    expect(history?.project.version).toBe(turn.projectVersion + 1);
  });

  it("replays the same adoption instead of appending a second version", async () => {
    const project = await createDraft();
    const turn = await generateCandidate(project.id, project.version);

    const first = await adoptSpecProposalWithDatabase(database, enterpriseA, {
      projectId: project.id,
      sourceMessageId: turn.messageId,
      expectedVersion: turn.projectVersion,
    });
    const replay = await adoptSpecProposalWithDatabase(database, enterpriseA, {
      projectId: project.id,
      sourceMessageId: turn.messageId,
      expectedVersion: turn.projectVersion,
    });

    expect(replay.id).toBe(first.id);
    expect(replay.versionNo).toBe(first.versionNo);
    expect(await specVersionCount(project.id)).toBe(1);
    const history = await listProjectSpecVersionsWithDatabase(database, enterpriseA, project.id);
    expect(history?.project.version).toBe(turn.projectVersion + 1);
  });

  it("refuses a candidate that was generated from an earlier project version", async () => {
    const project = await createDraft();
    const turn = await generateCandidate(project.id, project.version);

    const updated = await updateProjectDraftWithDatabase(database, enterpriseA, {
      projectId: project.id,
      expectedVersion: turn.projectVersion,
      title: "候选生成后又改了标题",
      originalRequirement: "候选生成后又改了需求。",
    });

    await expect(
      adoptSpecProposalWithDatabase(database, enterpriseA, {
        projectId: project.id,
        sourceMessageId: turn.messageId,
        expectedVersion: updated.version,
      }),
    ).rejects.toMatchObject({ name: "SpecError", code: "STALE_PROPOSAL" });

    expect(await specVersionCount(project.id)).toBe(0);
  });

  it("refuses a source message that is not a candidate of this project", async () => {
    const first = await createDraft(enterpriseA, "候选来源项目");
    const second = await createDraft(enterpriseA, "另一个项目");
    const turn = await generateCandidate(first.id, first.version);
    await invokeAipmWithDatabase(database, enterpriseA, createMockAipmGateway(), {
      projectId: second.id,
      expectedVersion: second.version,
      operation: "INTERVIEW",
      message: "另一个项目的访谈。",
    });

    const interview = await getProjectInterviewWithDatabase(database, enterpriseA, second.id);
    if (!interview) throw new Error("The interview must be readable by its owner.");
    const userMessage = interview.messages.find((message) => message.role === "USER");
    if (!userMessage) throw new Error("The interview must contain the recorded user message.");

    const cases: Array<[string, string]> = [
      ["its own user message", userMessage.id],
      ["an assistant candidate of another project", turn.messageId],
      ["an unknown message id", randomUUID()],
    ];

    for (const [label, sourceMessageId] of cases) {
      await expect(
        adoptSpecProposalWithDatabase(database, enterpriseA, {
          projectId: second.id,
          sourceMessageId,
          expectedVersion: interview.project.version,
        }),
        label,
      ).rejects.toMatchObject({ name: "SpecError", code: "INVALID_PROPOSAL" });
    }

    expect(await specVersionCount(second.id)).toBe(0);
    expect(await specVersionCount(first.id)).toBe(0);
  });

  it("appends a new version on every manual save and keeps earlier versions intact", async () => {
    const project = await createDraft();
    const first = await saveSpecVersionWithDatabase(database, enterpriseA, {
      projectId: project.id,
      expectedVersion: project.version,
      document: validSpecDocument(),
    });
    const edited = structuredClone(validSpecDocument());
    edited.projectGoal = "手工修改后的目标。";
    const second = await saveSpecVersionWithDatabase(database, enterpriseA, {
      projectId: project.id,
      expectedVersion: project.version + 1,
      document: edited,
    });

    expect([first.versionNo, second.versionNo]).toEqual([1, 2]);
    expect(second.sourceMessageId).toBeNull();

    const history = await listProjectSpecVersionsWithDatabase(database, enterpriseA, project.id);
    expect(history?.versions.map((version) => version.versionNo)).toEqual([2, 1]);
    expect(history?.current?.id).toBe(second.id);
    expect(history?.versions[1].document?.projectGoal).toBe(
      "让企业可以把模糊需求整理成可招募的确认范围。",
    );
  });

  const invalidDocuments: Array<[string, () => SpecDocumentV1]> = [
    [
      "a dangling reference",
      () => {
        const document = structuredClone(validSpecDocument());
        document.features[0].userRoleIds = ["role-missing"];
        return document;
      },
    ],
    [
      "an empty milestone criterion",
      () => {
        const document = structuredClone(validSpecDocument());
        document.milestones[0].acceptanceCriteria = [];
        return document;
      },
    ],
    [
      "a non-increasing delivery window",
      () => {
        const document = structuredClone(validSpecDocument());
        document.milestones[1].dueAfterDays = document.milestones[0].dueAfterDays;
        return document;
      },
    ],
  ];

  it.each(invalidDocuments)("rejects a manual save with %s", async (_label, buildDocument) => {
    const project = await createDraft();

    await expect(
      saveSpecVersionWithDatabase(database, enterpriseA, {
        projectId: project.id,
        expectedVersion: project.version,
        document: buildDocument(),
      }),
    ).rejects.toMatchObject({ name: "ZodError" });

    expect(await specVersionCount(project.id)).toBe(0);
  });

  it("rejects a stale expected version and lets only one of two concurrent saves win", async () => {
    const project = await createDraft();

    const results = await Promise.allSettled([
      saveSpecVersionWithDatabase(database, enterpriseA, {
        projectId: project.id,
        expectedVersion: project.version,
        document: validSpecDocument(),
      }),
      saveSpecVersionWithDatabase(database, enterpriseA, {
        projectId: project.id,
        expectedVersion: project.version,
        document: validSpecDocument(),
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      name: "SpecError",
      code: "VERSION_CONFLICT",
    });

    const history = await listProjectSpecVersionsWithDatabase(database, enterpriseA, project.id);
    expect(history?.versions.map((version) => version.versionNo)).toEqual([1]);
    expect(history?.project.version).toBe(project.version + 1);
  });

  it("keeps the history private to the owning enterprise", async () => {
    const project = await createDraft();
    await saveSpecVersionWithDatabase(database, enterpriseA, {
      projectId: project.id,
      expectedVersion: project.version,
      document: validSpecDocument(),
    });

    expect(await listProjectSpecVersionsWithDatabase(database, enterpriseB, project.id)).toBeNull();
    await expect(
      listProjectSpecVersionsWithDatabase(database, builder, project.id),
    ).rejects.toMatchObject({ name: "IdentityError", code: "ROLE_REQUIRED" });

    await expect(
      saveSpecVersionWithDatabase(database, enterpriseB, {
        projectId: project.id,
        expectedVersion: project.version,
        document: validSpecDocument(),
      }),
    ).rejects.toMatchObject({ name: "SpecError", code: "NOT_FOUND" });

    expect(await specVersionCount(project.id)).toBe(1);
  });

  it("sends the current version as the base spec of the next interview turn", async () => {
    const project = await createDraft();
    const turn = await generateCandidate(project.id, project.version);
    const adopted = await adoptSpecProposalWithDatabase(database, enterpriseA, {
      projectId: project.id,
      sourceMessageId: turn.messageId,
      expectedVersion: turn.projectVersion,
    });

    const requests: AipmRequest[] = [];
    const mock = createMockAipmGateway();
    const gateway: AipmGateway = {
      async invoke(request) {
        requests.push(request);
        return mock.invoke(request);
      },
    };
    const next = await invokeAipmWithDatabase(
      database,
      enterpriseA,
      gateway,
      {
        projectId: project.id,
        expectedVersion: turn.projectVersion + 1,
        operation: "INTERVIEW",
        message: "再补充一条约束。",
      },
    );

    expect(requests[0].baseSpec?.versionId).toBe(adopted.id);
    expect(requests[0].baseSpec?.document.projectGoal).toBe(adopted.document?.projectGoal);

    const history = await listProjectSpecVersionsWithDatabase(database, enterpriseA, project.id);
    expect(history?.versions).toHaveLength(1);
    // Adoption moved the token to +1, the interview turn recorded two messages.
    expect(next.projectVersion).toBe(turn.projectVersion + 3);
  });

  it("keeps the database constraints as the last line of defence", async () => {
    const project = await createDraft();

    const insert = (versionNo: number, schemaVersion: number, content: string) => admin`
      insert into app.spec_versions
        (id, project_id, version_no, schema_version, content, created_by)
      values
        (gen_random_uuid(), ${project.id}, ${versionNo}, ${schemaVersion}, ${content}::jsonb, ${enterpriseA.id})
    `;

    await expect(insert(0, 1, "{}")).rejects.toMatchObject({ severity: "ERROR" });
    await expect(insert(1, 2, "{}")).rejects.toMatchObject({ severity: "ERROR" });
    await expect(insert(1, 1, "[]")).rejects.toMatchObject({ severity: "ERROR" });
    // A project may only point at a version of its own.
    await expect(
      admin`
        update app.projects
        set current_spec_version_id = ${randomUUID()}
        where id = ${project.id}
      `,
    ).rejects.toMatchObject({ severity: "ERROR" });
  });
});
