import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { completeOnboardingWithDatabase, type Actor } from "@/modules/identity/onboarding";
import { simulatePaymentSuccessWithDatabase } from "@/modules/payments/repository";
import { publishProjectWithDatabase } from "@/modules/projects/publish";
import { saveReferenceBudgetWithDatabase } from "@/modules/projects/repository";
import { publishProjectInputSchema } from "@/modules/projects/validation";
import type { SpecDocumentV1 } from "@/modules/specs/document";
import {
  getOpenRecruitmentWithDatabase,
  listOpenRecruitmentsWithDatabase,
} from "@/modules/recruitment/repository";
import type { Database } from "@/platform/db/client";
import * as schema from "@/platform/db/schema";

import { clearDemoBusinessData } from "../helpers/demo-data";
import {
  loadLocalEnv,
  requireLoopbackApiUrl,
  requireLoopbackDatabaseUrl,
} from "../helpers/local-env";
import {
  createDepositPaidProject,
  createProjectWithBudgetAndSpec,
  lockProjectScope,
  type ProjectWithScope,
} from "../helpers/project-fixture";
import { validSpecDocument } from "../helpers/spec-fixture";

let admin: ReturnType<typeof postgres>;
let runtime: ReturnType<typeof postgres>;
let database: Database;
let authAdmin: SupabaseClient;
let enterpriseA: Actor;
let enterpriseB: Actor;
let builder: Actor;
let userIds: string[] = [];

/** Markers that must never reach a published snapshot. */
const secretRequirement = "ZZSECRET-原始需求：内部联系人 13800000000";
const secretGoal = "ZZSECRET-访谈：把模糊需求整理成可招募的确认范围。";

async function ensureAuthUser(email: string, password: string) {
  const { data: page, error: listError } = await authAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  const existing = page.users.find((user) => user.email === email);
  if (existing) return existing.id;
  const { data, error } = await authAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

/** A document whose text carries a marker the enterprise has to mask out. */
function markedDocument(): SpecDocumentV1 {
  const document = validSpecDocument();
  document.projectGoal = secretGoal;
  document.background = "由合成访谈整理，包含 ZZSECRET-背景。";
  return document;
}

function maskedCopy(document: SpecDocumentV1): SpecDocumentV1 {
  const masked = structuredClone(document);
  masked.projectGoal = "合成目标：把需求整理成可招募的确认范围。";
  masked.background = "由合成访谈整理。";
  return masked;
}

function publishInput(
  fixture: ProjectWithScope,
  expectedVersion: number,
  document: SpecDocumentV1,
  overrides: Partial<Record<"expectedVersion" | "lockedSpecVersionId" | "maskedTitle", string | number>> = {},
) {
  return {
    projectId: fixture.project.id,
    expectedVersion,
    lockedSpecVersionId: fixture.specVersion.id,
    maskedTitle: "已脱敏的招募标题",
    maskedDocument: document,
    confirmed: "on" as const,
    ...overrides,
  };
}

async function rawProject(projectId: string) {
  const [row] = await admin<
    {
      status: string;
      version: number;
      published_at: Date | null;
      published_spec_snapshot: unknown;
    }[]
  >`
    select status, version, published_at, published_spec_snapshot
    from app.projects where id = ${projectId}
  `;
  return row;
}

async function rawPayment(paymentId: string) {
  const [row] = await admin<
    { status: string; succeeded_at: Date | null; updated_at: Date }[]
  >`
    select status, succeeded_at, updated_at
    from app.payments where id = ${paymentId}
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
    ensureAuthUser("publish-enterprise-a@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("publish-enterprise-b@qianzo.test", tools.DEMO_USER_PASSWORD),
    ensureAuthUser("publish-builder@qianzo.test", tools.DEMO_USER_PASSWORD),
  ]);
  await clearDemoBusinessData(admin, userIds);
  await admin`delete from app.user_roles where user_id in ${admin(userIds)}`;
  await admin`delete from app.users where id in ${admin(userIds)}`;

  enterpriseA = await completeOnboardingWithDatabase(database, userIds[0], {
    displayName: "发布测试企业 A",
    roles: ["ENTERPRISE"],
  });
  enterpriseB = await completeOnboardingWithDatabase(database, userIds[1], {
    displayName: "发布测试企业 B",
    roles: ["ENTERPRISE"],
  });
  builder = await completeOnboardingWithDatabase(database, userIds[2], {
    displayName: "发布测试 Builder",
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

describe("publish transaction", () => {
  it("publishes a confirmed masked snapshot and keeps the private fields out of it", async () => {
    const { fixture, projectVersion } = await createDepositPaidProject(database, enterpriseA, {
      originalRequirement: secretRequirement,
      document: markedDocument(),
    });
    const masked = maskedCopy(markedDocument());

    const published = await publishProjectWithDatabase(
      database,
      enterpriseA,
      publishInput(fixture, projectVersion, masked),
    );

    expect(published.status).toBe("OPEN");
    const stored = await rawProject(fixture.project.id);
    expect(stored.status).toBe("OPEN");
    expect(stored.published_at).not.toBeNull();
    expect(stored.version).toBe(projectVersion + 1);

    const snapshot = stored.published_spec_snapshot as Record<string, unknown>;
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.lockedSpecVersionId).toBe(fixture.specVersion.id);
    expect(snapshot.title).toBe("已脱敏的招募标题");
    expect(snapshot.budget).toEqual({ minMinor: 100_000, maxMinor: 250_050, currency: "CNY" });

    // The snapshot is a whitelist: only these keys can ever be public.
    expect(Object.keys(snapshot).sort()).toEqual([
      "budget",
      "document",
      "lockedSpecVersionId",
      "schemaVersion",
      "title",
    ]);
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("ZZSECRET");
    expect(serialized).not.toContain(secretRequirement);
    expect(serialized).not.toContain(enterpriseA.displayName);
    expect(serialized).not.toContain("qianzo.test");
    expect(serialized).not.toContain(fixture.project.id);
  });

  const refusalCases: Array<[string, () => Promise<{ fixture: ProjectWithScope; expected: string }>]> = [
    [
      "a missing deposit",
      async () => {
        const fixture = await createProjectWithBudgetAndSpec(database, enterpriseA);
        await lockProjectScope(database, enterpriseA, fixture);
        return { fixture, expected: "PAYMENT_REQUIRED" };
      },
    ],
    [
      "an unlocked project",
      async () => {
        const fixture = await createProjectWithBudgetAndSpec(database, enterpriseA);
        return { fixture, expected: "SPEC_LOCKED" };
      },
    ],
  ];

  it.each(refusalCases)("refuses to publish with %s and writes nothing", async (_label, prepare) => {
    const { fixture, expected } = await prepare();

    await expect(
      publishProjectWithDatabase(
        database,
        enterpriseA,
        // The deposit stage never ran, so the locked version token is the current one.
        publishInput(fixture, fixture.projectVersion + 1, validSpecDocument()),
      ),
    ).rejects.toMatchObject({ code: expected });

    const stored = await rawProject(fixture.project.id);
    expect(stored.status).toBe("DRAFT");
    expect(stored.published_at).toBeNull();
    expect(stored.published_spec_snapshot).toBeNull();
  });

  it("refuses a preview that drops obligations, changes the timeline or comes from another version", async () => {
    const { fixture, projectVersion } = await createDepositPaidProject(database, enterpriseA);
    const dropped = validSpecDocument();
    dropped.features = dropped.features.slice(0, 1);
    const shortened = validSpecDocument();
    shortened.milestones[1].dueAfterDays = 12;

    const cases: Array<[string, () => unknown, string]> = [
      [
        "a dropped feature",
        () => publishInput(fixture, projectVersion, dropped),
        "INVALID_PREVIEW",
      ],
      [
        "a shortened timeline",
        () => publishInput(fixture, projectVersion, shortened),
        "INVALID_PREVIEW",
      ],
      [
        "an unknown source version",
        () => publishInput(fixture, projectVersion, validSpecDocument(), { lockedSpecVersionId: randomUUID() }),
        "INVALID_SOURCE",
      ],
      [
        "a stale expected version",
        () => publishInput(fixture, projectVersion, validSpecDocument(), { expectedVersion: 99 }),
        "VERSION_CONFLICT",
      ],
    ];

    for (const [label, input, expected] of cases) {
      await expect(publishProjectWithDatabase(database, enterpriseA, input()), label).rejects.toMatchObject({
        code: expected,
      });
    }

    const stored = await rawProject(fixture.project.id);
    expect(stored.status).toBe("DRAFT");
    expect(stored.published_spec_snapshot).toBeNull();
  });

  it("requires an explicit confirmation of the submitted preview", () => {
    const withoutConfirmation = {
      projectId: randomUUID(),
      expectedVersion: 1,
      lockedSpecVersionId: randomUUID(),
      maskedTitle: "标题",
      maskedDocument: validSpecDocument(),
    };

    expect(publishProjectInputSchema.safeParse(withoutConfirmation).success).toBe(false);
    expect(
      publishProjectInputSchema.safeParse({ ...withoutConfirmation, confirmed: "on" }).success,
    ).toBe(true);
  });

  it("returns the same result for a repeated intent and conflicts on a different preview", async () => {
    const { fixture, projectVersion } = await createDepositPaidProject(database, enterpriseA);
    const masked = validSpecDocument();
    const first = await publishProjectWithDatabase(
      database,
      enterpriseA,
      publishInput(fixture, projectVersion, masked),
    );

    const beforeReplay = await rawProject(fixture.project.id);
    const replay = await publishProjectWithDatabase(
      database,
      enterpriseA,
      publishInput(fixture, projectVersion, masked),
    );
    expect(replay.status).toBe("OPEN");
    const afterReplay = await rawProject(fixture.project.id);
    expect(afterReplay.version).toBe(first.version);
    expect(afterReplay.published_at?.getTime()).toBe(beforeReplay.published_at?.getTime());
    expect(afterReplay.published_spec_snapshot).toEqual(beforeReplay.published_spec_snapshot);

    const differentDocument = structuredClone(masked);
    differentDocument.projectGoal = "另一版脱敏目标。";
    await expect(
      publishProjectWithDatabase(
        database,
        enterpriseA,
        publishInput(fixture, first.version, differentDocument),
      ),
    ).rejects.toMatchObject({ code: "PUBLISH_CONFLICT" });

    const afterConflict = await rawProject(fixture.project.id);
    expect(afterConflict.published_spec_snapshot).toEqual(afterReplay.published_spec_snapshot);
  });

  it("keeps the published-state rules in the database", async () => {
    const { fixture, projectVersion } = await createDepositPaidProject(database, enterpriseA);
    const projectId = fixture.project.id;

    // A locked draft cannot jump to OPEN without a published snapshot, and an
    // unknown status is rejected by the enum check.
    const statements = [
      `update app.projects set status = 'OPEN' where id = '${projectId}'`,
      `update app.projects set status = 'PUBLISHED' where id = '${projectId}'`,
      `update app.projects set status = 'OPEN', published_at = now() where id = '${projectId}'`,
    ];

    for (const statement of statements) {
      await expect(runtime.unsafe(statement), statement).rejects.toMatchObject({ severity: "ERROR" });
    }

    const stored = await rawProject(projectId);
    expect(stored.status).toBe("DRAFT");
    expect(stored.version).toBe(projectVersion);
  });

  it("keeps a published project and its snapshot immutable, even by SQL", async () => {
    const { fixture, projectVersion } = await createDepositPaidProject(database, enterpriseA);
    await publishProjectWithDatabase(
      database,
      enterpriseA,
      publishInput(fixture, projectVersion, validSpecDocument()),
    );
    const published = await rawProject(fixture.project.id);

    const statements = [
      `update app.projects set status = 'DRAFT' where id = '${fixture.project.id}'`,
      `update app.projects set published_spec_snapshot = '{}'::jsonb where id = '${fixture.project.id}'`,
      `update app.projects set published_at = null where id = '${fixture.project.id}'`,
      `update app.projects set status = 'DRAFT', published_spec_snapshot = null where id = '${fixture.project.id}'`,
    ];

    for (const statement of statements) {
      await expect(runtime.unsafe(statement), statement).rejects.toMatchObject({ severity: "ERROR" });
    }

    const after = await rawProject(fixture.project.id);
    expect(after).toEqual(published);
  });

  it("publishes exactly once under two concurrent identical intents", async () => {
    const { fixture, projectVersion } = await createDepositPaidProject(database, enterpriseA);
    const masked = validSpecDocument();

    const results = await Promise.allSettled([
      publishProjectWithDatabase(database, enterpriseA, publishInput(fixture, projectVersion, masked)),
      publishProjectWithDatabase(database, enterpriseA, publishInput(fixture, projectVersion, masked)),
    ]);

    // Both intents resolve; the loser recognises the winner's result instead of
    // writing a second time.
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    const published = results.map(
      (result) => (result as PromiseFulfilledResult<Awaited<ReturnType<typeof publishProjectWithDatabase>>>).value,
    );
    expect(new Set(published.map((project) => project.publishedAt?.getTime())).size).toBe(1);

    const stored = await rawProject(fixture.project.id);
    expect(stored.status).toBe("OPEN");
    // At most one state change: the version token moved exactly once.
    expect(stored.version).toBe(projectVersion + 1);
    expect(stored.published_at).not.toBeNull();
    for (const project of published) {
      expect(project.version).toBe(stored.version);
      expect(project.publishedAt?.getTime()).toBe(stored.published_at?.getTime());
    }
  });

  it("rejects the loser of two concurrent conflicting previews without a second write", async () => {
    const { fixture, projectVersion } = await createDepositPaidProject(database, enterpriseA);
    const firstPreview = validSpecDocument();
    const secondPreview = validSpecDocument();
    secondPreview.projectGoal = "另一版脱敏目标。";

    const results = await Promise.allSettled([
      publishProjectWithDatabase(
        database,
        enterpriseA,
        publishInput(fixture, projectVersion, firstPreview),
      ),
      publishProjectWithDatabase(
        database,
        enterpriseA,
        publishInput(fixture, projectVersion, secondPreview),
      ),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      name: "ProjectError",
      code: "PUBLISH_CONFLICT",
    });

    const stored = await rawProject(fixture.project.id);
    expect(stored.status).toBe("OPEN");
    expect(stored.version).toBe(projectVersion + 1);
    expect(stored.published_at).not.toBeNull();

    // The stored snapshot is exactly the winner's preview, never a mix.
    const winner = (fulfilled[0] as PromiseFulfilledResult<
      Awaited<ReturnType<typeof publishProjectWithDatabase>>
    >).value;
    const storedGoal = (stored.published_spec_snapshot as { document: { projectGoal: string } })
      .document.projectGoal;
    const winnerGoal = (winner.publishedSpecSnapshot as { document: { projectGoal: string } })
      .document.projectGoal;
    expect(storedGoal).toBe(winnerGoal);
    expect([firstPreview.projectGoal, secondPreview.projectGoal]).toContain(winnerGoal);
  });

  it("returns the same succeeded deposit after publishing, changing nothing", async () => {
    const { fixture, payment, projectVersion } = await createDepositPaidProject(database, enterpriseA);
    await publishProjectWithDatabase(
      database,
      enterpriseA,
      publishInput(fixture, projectVersion, validSpecDocument()),
    );
    const published = await rawProject(fixture.project.id);
    const paymentBefore = await rawPayment(payment.id);
    expect(paymentBefore.status).toBe("SUCCEEDED");

    // Spec section 6: a repeated success request after the project is OPEN
    // returns the same result without touching timestamps or the version.
    const replay = await simulatePaymentSuccessWithDatabase(database, enterpriseA, {
      projectId: fixture.project.id,
      paymentId: payment.id,
    });

    expect(replay.status).toBe("SUCCEEDED");
    expect(replay.succeededAt?.getTime()).toBe(paymentBefore.succeeded_at?.getTime());

    const after = await rawProject(fixture.project.id);
    expect(after.version).toBe(published.version);
    expect(after.published_at?.getTime()).toBe(published.published_at?.getTime());
    expect(after.published_spec_snapshot).toEqual(published.published_spec_snapshot);

    const paymentAfter = await rawPayment(payment.id);
    expect(paymentAfter.succeeded_at?.getTime()).toBe(paymentBefore.succeeded_at?.getTime());
    expect(paymentAfter.updated_at.getTime()).toBe(paymentBefore.updated_at.getTime());
  });

  it("keeps publishing private to the owning enterprise and the enterprise role", async () => {
    const { fixture, projectVersion } = await createDepositPaidProject(database, enterpriseA);
    const input = () => publishInput(fixture, projectVersion, validSpecDocument());

    // Another enterprise reads "not found" instead of learning the project exists.
    await expect(publishProjectWithDatabase(database, enterpriseB, input())).rejects.toMatchObject({
      name: "ProjectError",
      code: "NOT_FOUND",
    });
    await expect(publishProjectWithDatabase(database, builder, input())).rejects.toMatchObject({
      name: "IdentityError",
      code: "ROLE_REQUIRED",
    });

    const stored = await rawProject(fixture.project.id);
    expect(stored.status).toBe("DRAFT");
    expect(stored.published_at).toBeNull();
    expect(stored.published_spec_snapshot).toBeNull();
    expect(stored.version).toBe(projectVersion);
  });
});

describe("recruitment view", () => {
  it("lists and returns only published projects through whitelist DTOs", async () => {
    const { fixture, projectVersion } = await createDepositPaidProject(database, enterpriseA, {
      title: "招募中的合成项目",
      originalRequirement: secretRequirement,
      document: markedDocument(),
    });
    await publishProjectWithDatabase(
      database,
      enterpriseA,
      publishInput(fixture, projectVersion, maskedCopy(markedDocument())),
    );

    // A draft and a locked-but-unpublished project stay invisible.
    const draft = await createProjectWithBudgetAndSpec(database, enterpriseA, { title: "未发布草稿" });
    await lockProjectScope(database, enterpriseA, draft);

    const listed = await listOpenRecruitmentsWithDatabase(database, builder);
    expect(listed).toHaveLength(1);
    expect(Object.keys(listed[0]).sort()).toEqual([
      "budgetLabel",
      "deliveryDays",
      "goal",
      "milestoneCount",
      "projectId",
      "publishedAt",
      "title",
    ]);
    expect(listed[0]).toMatchObject({
      projectId: fixture.project.id,
      title: "已脱敏的招募标题",
      goal: "合成目标：把需求整理成可招募的确认范围。",
      budgetLabel: "¥1000.00 – ¥2500.50",
      deliveryDays: 24,
      milestoneCount: 2,
    });

    const detail = await getOpenRecruitmentWithDatabase(database, builder, fixture.project.id);
    expect(Object.keys(detail ?? {}).sort()).toEqual([
      "budgetLabel",
      "deliveryDays",
      "document",
      "projectId",
      "publishedAt",
      "title",
    ]);
    expect(detail?.document.milestones).toHaveLength(2);
    expect(detail?.budgetLabel).toBe("¥1000.00 – ¥2500.50");
    expect(detail?.deliveryDays).toBe(24);

    // Private projects and drafts read as absent for everyone.
    expect(await getOpenRecruitmentWithDatabase(database, builder, draft.project.id)).toBeNull();
    expect(await getOpenRecruitmentWithDatabase(database, enterpriseA, draft.project.id)).toBeNull();
    expect(await getOpenRecruitmentWithDatabase(database, builder, randomUUID())).toBeNull();

    // Another enterprise may read the published snapshot but never its own
    // private project pages from here.
    const readByOtherEnterprise = await getOpenRecruitmentWithDatabase(
      database,
      enterpriseB,
      fixture.project.id,
    );
    expect(readByOtherEnterprise?.title).toBe("已脱敏的招募标题");

    // Nothing private leaks through the DTOs.
    const serialized = JSON.stringify({ listed, detail });
    expect(serialized).not.toContain("ZZSECRET");
    expect(serialized).not.toContain(secretRequirement);
    expect(serialized).not.toContain("qianzo.test");
    expect(serialized).not.toContain("originalRequirement");
    expect(serialized).not.toContain("lockedSpecVersionId");
  });

  it("refuses a disabled account", async () => {
    const { fixture, projectVersion } = await createDepositPaidProject(database, enterpriseA);
    await publishProjectWithDatabase(
      database,
      enterpriseA,
      publishInput(fixture, projectVersion, validSpecDocument()),
    );

    await admin`update app.users set status = 'DISABLED' where id = ${builder.id}`;
    try {
      const disabled = { ...builder, status: "DISABLED" as const };
      await expect(listOpenRecruitmentsWithDatabase(database, disabled)).rejects.toMatchObject({
        name: "IdentityError",
        code: "ACTOR_DISABLED",
      });
      await expect(
        getOpenRecruitmentWithDatabase(database, disabled, fixture.project.id),
      ).rejects.toMatchObject({ name: "IdentityError", code: "ACTOR_DISABLED" });
    } finally {
      await admin`update app.users set status = 'ACTIVE' where id = ${builder.id}`;
    }
  });

  it("keeps the budget a reference amount and the cycle derived from the locked spec", async () => {
    const { fixture, projectVersion } = await createDepositPaidProject(database, enterpriseA);
    // The enterprise edits the budget after locking is impossible; the published
    // snapshot must match the frozen range.
    await expect(
      saveReferenceBudgetWithDatabase(database, enterpriseA, {
        projectId: fixture.project.id,
        expectedVersion: projectVersion,
        minAmount: "1",
        maxAmount: "2",
      }),
    ).rejects.toMatchObject({ name: "ProjectError", code: "SPEC_LOCKED" });

    await publishProjectWithDatabase(
      database,
      enterpriseA,
      publishInput(fixture, projectVersion, validSpecDocument()),
    );
    const detail = await getOpenRecruitmentWithDatabase(database, builder, fixture.project.id);
    expect(detail?.budgetLabel).toBe("¥1000.00 – ¥2500.50");
  });
});
