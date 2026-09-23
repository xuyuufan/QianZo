"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { SpecActionState } from "@/app/actions/spec-state";
import { IdentityError } from "@/modules/identity/onboarding";
import { describeSpecIssues, specDocumentSchema } from "@/modules/specs/document";
import { SpecError } from "@/modules/specs/errors";
import { adoptSpecProposal, saveSpecVersion } from "@/modules/specs/service";
import { AuthenticationError, requireAuth } from "@/platform/auth/server";

function failure(state: Omit<SpecActionState, "successMessage">): SpecActionState {
  return { ...state, successMessage: null };
}

function actionFailure(error: unknown): SpecActionState {
  if (error instanceof AuthenticationError) {
    return failure({ errorCode: "AUTHENTICATION_REQUIRED", message: "请重新登录后再操作。", issues: [] });
  }
  if (error instanceof IdentityError) {
    if (error.code === "ROLE_REQUIRED") {
      return failure({ errorCode: "FORBIDDEN", message: "只有企业身份可以管理 Spec。", issues: [] });
    }
    if (error.code === "ACTOR_DISABLED") {
      return failure({ errorCode: "ACTOR_DISABLED", message: "账号已停用，无法继续操作。", issues: [] });
    }
    return failure({ errorCode: "ONBOARDING_REQUIRED", message: "请先完成身份设置。", issues: [] });
  }
  if (error instanceof SpecError) {
    switch (error.code) {
      case "NOT_FOUND":
        return failure({ errorCode: "NOT_FOUND", message: "项目或 Spec 版本不存在。", issues: [] });
      case "VERSION_CONFLICT":
        return failure({
          errorCode: "VERSION_CONFLICT",
          message: "项目已被更新，请刷新页面后再操作。",
          issues: [],
        });
      case "SPEC_LOCKED":
        return failure({
          errorCode: "SPEC_LOCKED",
          message: "Spec 已锁定，不能再保存或采用新的候选。",
          issues: [],
        });
      case "STALE_PROPOSAL":
        return failure({
          errorCode: "STALE_PROPOSAL",
          message: "该候选基于更早的项目版本，已过期，请重新生成或手工另存。",
          issues: [],
        });
      default:
        return failure({
          errorCode: "INVALID_PROPOSAL",
          message: "这条消息不是可采用的候选，请重新生成 Spec。",
          issues: [],
        });
    }
  }
  return failure({ errorCode: "SPEC_ACTION_FAILED", message: "暂时无法保存，请稍后再试。", issues: [] });
}

function revalidateSpecPages(projectId: string) {
  revalidatePath(`/enterprise/projects/${projectId}`);
  revalidatePath(`/enterprise/projects/${projectId}/spec`);
}

export async function adoptSpecProposalAction(
  projectId: string,
  _previous: SpecActionState,
  formData: FormData,
): Promise<SpecActionState> {
  try {
    const userId = await requireAuth();
    const adopted = await adoptSpecProposal(userId, {
      projectId,
      sourceMessageId: formData.get("sourceMessageId"),
      expectedVersion: formData.get("expectedVersion"),
    });
    revalidateSpecPages(projectId);
    return {
      errorCode: null,
      message: null,
      successMessage: `已采用为版本 ${adopted.versionNo}。`,
      issues: [],
    };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function saveSpecVersionAction(
  projectId: string,
  _previous: SpecActionState,
  formData: FormData,
): Promise<SpecActionState> {
  let document: unknown;
  try {
    document = JSON.parse(String(formData.get("document") ?? ""));
  } catch {
    return failure({
      errorCode: "INVALID_JSON",
      message: "Spec 内容不是合法的 JSON，请先修正格式。",
      issues: [],
    });
  }

  // Validated here with clean paths so the editor can point at the exact field;
  // the service validates the same document again.
  const parsed = specDocumentSchema.safeParse(document);
  if (!parsed.success) {
    return failure({
      errorCode: "INVALID_DOCUMENT",
      message: "Spec 内容未通过校验，请修正下列问题后保存。",
      issues: describeSpecIssues(parsed.error),
    });
  }

  try {
    const userId = await requireAuth();
    const saved = await saveSpecVersion(userId, {
      projectId,
      expectedVersion: formData.get("expectedVersion"),
      document: parsed.data,
    });
    revalidateSpecPages(projectId);
    return {
      errorCode: null,
      message: null,
      successMessage: `已保存为版本 ${saved.versionNo}。`,
      issues: [],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return failure({ errorCode: "VALIDATION_ERROR", message: "请检查提交的版本信息。", issues: [] });
    }
    return actionFailure(error);
  }
}
