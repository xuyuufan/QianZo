"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ProjectActionState } from "@/app/actions/project-state";
import { IdentityError } from "@/modules/identity/onboarding";
import { PaymentError } from "@/modules/payments/errors";
import { ProjectError } from "@/modules/projects/repository";
import { publishProject } from "@/modules/projects/service";
import { specDocumentSchema } from "@/modules/specs/document";
import { AuthenticationError, requireAuth } from "@/platform/auth/server";
import { describeFieldIssues } from "@/platform/validation";

function failure(state: Omit<ProjectActionState, "issues"> & { issues?: string[] }): ProjectActionState {
  return { issues: [], ...state };
}

function actionFailure(error: unknown): ProjectActionState {
  if (error instanceof z.ZodError) {
    return failure({
      errorCode: "CONFIRMATION_REQUIRED",
      message: "发布前需要勾选“我已确认这是最终预览”。",
    });
  }
  if (error instanceof AuthenticationError) {
    return failure({ errorCode: "AUTHENTICATION_REQUIRED", message: "请重新登录后再操作。" });
  }
  if (error instanceof IdentityError) {
    if (error.code === "ROLE_REQUIRED") {
      return failure({ errorCode: "FORBIDDEN", message: "只有企业身份可以发布项目。" });
    }
    if (error.code === "ACTOR_DISABLED") {
      return failure({ errorCode: "ACTOR_DISABLED", message: "账号已停用，无法继续操作。" });
    }
    return failure({ errorCode: "ONBOARDING_REQUIRED", message: "请先完成身份设置。" });
  }
  if (error instanceof PaymentError) {
    if (error.code === "PAYMENT_REQUIRED") {
      return failure({
        errorCode: "PAYMENT_REQUIRED",
        message: "发布前需要先完成企业模拟定金。",
      });
    }
    return failure({ errorCode: "NOT_FOUND", message: "项目或定金记录不存在。" });
  }
  if (error instanceof ProjectError) {
    switch (error.code) {
      case "NOT_FOUND":
        return failure({ errorCode: "NOT_FOUND", message: "项目不存在。" });
      case "SPEC_LOCKED":
        return failure({
          errorCode: "SPEC_LOCKED",
          message: "发布前需要先锁定 Spec 范围。",
        });
      case "VERSION_CONFLICT":
        return failure({
          errorCode: "VERSION_CONFLICT",
          message: "项目已被更新，请刷新页面后重新确认预览。",
        });
      case "INVALID_SOURCE":
        return failure({
          errorCode: "INVALID_SOURCE",
          message: "预览不是从当前锁定的版本派生的，请刷新后重新生成预览。",
        });
      case "INVALID_PREVIEW":
        return failure({
          errorCode: "INVALID_PREVIEW",
          message:
            "脱敏预览不能删除或改写义务：请保留结构、条目数量、里程碑顺序与 dueAfterDays，只替换需要脱敏的文字。",
        });
      case "PUBLISH_CONFLICT":
        return failure({
          errorCode: "PUBLISH_CONFLICT",
          message: "该项目已经发布，S1 不支持用不同预览覆盖已公开内容。",
        });
      default:
        return failure({
          errorCode: "INVALID_STAGE",
          message: "当前项目状态不能发布，请先完成锁定与模拟定金。",
        });
    }
  }
  return failure({ errorCode: "PUBLISH_ACTION_FAILED", message: "暂时无法发布，请稍后再试。" });
}

export async function publishProjectAction(
  projectId: string,
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  let document: unknown;
  try {
    document = JSON.parse(String(formData.get("maskedDocument") ?? ""));
  } catch {
    return failure({
      errorCode: "INVALID_JSON",
      message: "脱敏预览不是合法的 JSON，请先修正格式。",
    });
  }

  // Validated here with clean paths so the editor can point at the exact field;
  // the service validates the same document again inside the transaction.
  const parsed = specDocumentSchema.safeParse(document);
  if (!parsed.success) {
    return failure({
      errorCode: "INVALID_DOCUMENT",
      message: "脱敏预览未通过结构校验，请修正下列问题。",
      issues: describeFieldIssues(parsed.error),
    });
  }

  try {
    const userId = await requireAuth();
    await publishProject(userId, {
      projectId,
      expectedVersion: formData.get("expectedVersion"),
      lockedSpecVersionId: formData.get("lockedSpecVersionId"),
      maskedTitle: formData.get("maskedTitle"),
      maskedDocument: parsed.data,
      confirmed: formData.get("confirmed"),
    });
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath(`/enterprise/projects/${projectId}`);
  revalidatePath(`/enterprise/projects/${projectId}/spec`);
  revalidatePath(`/enterprise/projects/${projectId}/publish`);
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);

  return failure({
    errorCode: null,
    message: "已发布：招募视图对已登录用户可见，项目状态为 OPEN。S1 不提供下架或修改已公开内容。",
  });
}
