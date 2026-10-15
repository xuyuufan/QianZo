import { describe, expect, it } from "vitest";
import { z } from "zod";

import { mapSharedActionError } from "@/app/actions/error-mapping";
import { IdentityError } from "@/modules/identity/onboarding";
import { ProjectError } from "@/modules/projects/errors";
import { AuthenticationError } from "@/platform/auth/server";

/**
 * The five Server Actions used to map authentication, identity and validation
 * errors inline. After the extraction to `error-mapping.ts` the shared error
 * codes and the Chinese copy must stay exactly the same, because the forms and
 * the E2E specs match on these strings.
 */
describe("mapSharedActionError", () => {
  // One domain's role copy; every action passes its own.
  const copy = { roleRequired: "只有企业身份可以发布项目。" };

  it("keeps the authentication error code and copy", () => {
    expect(mapSharedActionError(new AuthenticationError(), copy)).toEqual({
      errorCode: "AUTHENTICATION_REQUIRED",
      message: "请重新登录后再操作。",
    });
  });

  it("keeps the identity error codes and copy for every identity branch", () => {
    expect(mapSharedActionError(new IdentityError("ROLE_REQUIRED", "role"), copy)).toEqual({
      errorCode: "FORBIDDEN",
      message: "只有企业身份可以发布项目。",
    });
    expect(mapSharedActionError(new IdentityError("ACTOR_DISABLED", "disabled"), copy)).toEqual({
      errorCode: "ACTOR_DISABLED",
      message: "账号已停用，无法继续操作。",
    });
    expect(mapSharedActionError(new IdentityError("ONBOARDING_REQUIRED", "onboarding"), copy)).toEqual(
      {
        errorCode: "ONBOARDING_REQUIRED",
        message: "请先完成身份设置。",
      },
    );
  });

  it("maps a ZodError only when the action opts in, with field issues on request", () => {
    const parsed = z.object({ title: z.string().min(1, "标题不能为空。") }).safeParse({ title: "" });
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error("The input must fail the schema.");
    }
    const error = parsed.error;

    // Without a `validation` copy the mapper leaves the ZodError to the caller.
    expect(mapSharedActionError(error, copy)).toBeNull();

    expect(
      mapSharedActionError(error, {
        roleRequired: copy.roleRequired,
        validation: { errorCode: "VALIDATION_ERROR", message: "请填写 1～4000 字的访谈内容；如果页面停留过久，请刷新后重试。" },
      }),
    ).toEqual({
      errorCode: "VALIDATION_ERROR",
      message: "请填写 1～4000 字的访谈内容；如果页面停留过久，请刷新后重试。",
    });

    expect(
      mapSharedActionError(error, {
        roleRequired: copy.roleRequired,
        validation: {
          errorCode: "VALIDATION_ERROR",
          message: "请检查填写内容。",
          includeFieldIssues: true,
        },
      }),
    ).toEqual({
      errorCode: "VALIDATION_ERROR",
      message: "请检查填写内容。",
      issues: ["title: 标题不能为空。"],
    });
  });

  it("maps numeric SQLSTATE codes to stable domain codes and Chinese copy", () => {
    const databaseError = (code: string) => Object.assign(new Error("raw database text"), { code });

    expect(mapSharedActionError(databaseError("23505"), copy)).toEqual({
      errorCode: "VERSION_CONFLICT",
      message: "该项目正在被其他操作更新，请刷新后重试。",
    });
    expect(mapSharedActionError(databaseError("23514"), copy)).toEqual({
      errorCode: "INVALID_INPUT",
      message: "提交的内容不符合当前项目状态。",
    });
    expect(mapSharedActionError(databaseError("23503"), copy)).toEqual({
      errorCode: "INVALID_INPUT",
      message: "提交的内容引用了不存在或已变更的资源。",
    });
  });

  it("never mistakes a domain error for a database error and returns null for unknown errors", () => {
    // A domain error carries a string code, not a numeric SQLSTATE.
    expect(mapSharedActionError(new ProjectError("NOT_FOUND", "Project not found."), copy)).toBeNull();
    expect(mapSharedActionError(new Error("anything else"), copy)).toBeNull();
    expect(mapSharedActionError("23505", copy)).toBeNull();
    expect(mapSharedActionError(null, copy)).toBeNull();
  });
});
