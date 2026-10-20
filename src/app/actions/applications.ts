"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { mapSharedActionError } from "@/app/actions/error-mapping";
import type { ApplicationActionState } from "@/app/actions/application-state";
import { ApplicationError } from "@/modules/applications/errors";
import { applyToProject, selectApplication } from "@/modules/applications/service";
import { requireAuth } from "@/platform/auth/server";
import { describeFieldIssues } from "@/platform/validation";

function failure(errorCode: string, message: string, issues: string[] = []): ApplicationActionState {
  return { errorCode, message, successMessage: null, issues };
}

function actionFailure(error: unknown, role: "BUILDER" | "ENTERPRISE"): ApplicationActionState {
  const shared = mapSharedActionError(error, {
    roleRequired: role === "BUILDER" ? "只有有效的 Builder 身份可以申请项目。" : "只有企业身份可以选择 Builder。",
    validation: { errorCode: "INVALID_INPUT", message: "请检查填写内容。", includeFieldIssues: true },
  });
  if (shared) return failure(shared.errorCode, shared.message, shared.issues ?? []);
  if (error instanceof z.ZodError) return failure("INVALID_INPUT", "请检查填写内容。", describeFieldIssues(error));
  if (error instanceof ApplicationError) {
    switch (error.code) {
      case "NOT_FOUND":
        return failure("NOT_FOUND", "项目或申请不存在。请刷新后重试。");
      case "ALREADY_APPLIED":
        return failure("ALREADY_APPLIED", "你已申请该项目，不能重复提交不同内容。");
      case "ALREADY_SELECTED":
        return failure("ALREADY_SELECTED", "该申请已被处理，请刷新申请列表。");
      case "VERSION_CONFLICT":
        return failure("VERSION_CONFLICT", "项目已更新，请刷新页面后重试。");
      case "CANNOT_APPLY_TO_OWN_PROJECT":
        return failure("FORBIDDEN", "不能申请自己负责的项目。");
      default:
        return failure("INVALID_STAGE", "项目当前阶段不接受该操作。");
    }
  }
  return failure("APPLICATION_ACTION_FAILED", "暂时无法处理，请稍后再试。");
}

export async function applyToProjectAction(
  projectId: string,
  _previous: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  try {
    const userId = await requireAuth();
    await applyToProject(userId, { projectId, statement: formData.get("statement") });
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/projects");
    revalidatePath("/builder/applications");
    return { errorCode: null, message: null, successMessage: "申请已提交，可在“我的申请”查看进度。", issues: [] };
  } catch (error) {
    return actionFailure(error, "BUILDER");
  }
}

export async function selectApplicationAction(
  projectId: string,
  applicationId: string,
  _previous: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  try {
    const userId = await requireAuth();
    await selectApplication(userId, {
      projectId,
      applicationId,
      expectedVersion: formData.get("expectedVersion"),
    });
    revalidatePath(`/enterprise/projects/${projectId}`);
    revalidatePath(`/enterprise/projects/${projectId}/applications`);
    revalidatePath(`/builder/applications`);
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return { errorCode: null, message: null, successMessage: "已选择 Builder，项目正在等待其完成 Mock 押金。", issues: [] };
  } catch (error) {
    return actionFailure(error, "ENTERPRISE");
  }
}
