"use server";

import { revalidatePath } from "next/cache";

import type { AipmActionState } from "@/app/actions/aipm-state";
import { mapSharedActionError } from "@/app/actions/error-mapping";
import { AipmError } from "@/modules/aipm/errors";
import { invokeAipm } from "@/modules/aipm/service";
import { requireAuth } from "@/platform/auth/server";

function actionFailure(error: unknown): AipmActionState {
  // Authentication, identity and input validation are shared across actions;
  // only the required-role copy differs per domain.
  const shared = mapSharedActionError(error, {
    roleRequired: "只有企业身份可以进行需求访谈。",
    validation: {
      errorCode: "VALIDATION_ERROR",
      message: "请填写 1～4000 字的访谈内容；如果页面停留过久，请刷新后重试。",
    },
  });
  if (shared) {
    return { errorCode: shared.errorCode, message: shared.message, successMessage: null };
  }
  if (error instanceof AipmError) {
    switch (error.code) {
      case "NOT_FOUND":
        return { errorCode: "NOT_FOUND", message: "项目或访谈记录不存在。", successMessage: null };
      case "VERSION_CONFLICT":
        return {
          errorCode: "VERSION_CONFLICT",
          message: "项目已被更新，请刷新页面后再发送。",
          successMessage: null,
        };
      case "SPEC_LOCKED":
        return { errorCode: "SPEC_LOCKED", message: "Spec 已锁定，不能再继续访谈或生成候选。", successMessage: null };
      case "MESSAGE_LIMIT_REACHED":
        return {
          errorCode: "MESSAGE_LIMIT_REACHED",
          message: "本次访谈的消息数量已达上限，请先处理已生成的候选。",
          successMessage: null,
        };
      case "PROVIDER_FAILED":
        return {
          errorCode: "PROVIDER_FAILED",
          message: "本次访谈没有取得可用结果，你的输入已保留，可以重新发送。",
          successMessage: null,
        };
      case "MISSING_SPEC":
        return { errorCode: "MISSING_SPEC", message: "生成结果缺少候选 Spec，请重新生成。", successMessage: null };
      default:
        return {
          errorCode: "INVALID_RESPONSE",
          message: "访谈服务返回了不可用结果，本次没有产生候选，请重试。",
          successMessage: null,
        };
    }
  }
  return { errorCode: "AIPM_ACTION_FAILED", message: "暂时无法完成访谈，请稍后再试。", successMessage: null };
}

export async function invokeAipmAction(
  projectId: string,
  _previous: AipmActionState,
  formData: FormData,
): Promise<AipmActionState> {
  let result;
  try {
    const userId = await requireAuth();
    result = await invokeAipm(userId, {
      projectId,
      expectedVersion: formData.get("expectedVersion"),
      operation: formData.get("operation"),
      message: formData.get("message"),
      instruction: formData.get("instruction") || undefined,
    });
  } catch (error) {
    // A provider or validation failure still committed the USER message and
    // moved the project version inside `begin`. Refresh the pages as well, so
    // the form picks up the new expectedVersion and the retained message can
    // actually be resent; otherwise every retry is rejected with
    // VERSION_CONFLICT until the user refreshes by hand.
    revalidatePath(`/enterprise/projects/${projectId}`);
    revalidatePath(`/enterprise/projects/${projectId}/spec`);
    return actionFailure(error);
  }

  revalidatePath(`/enterprise/projects/${projectId}`);
  revalidatePath(`/enterprise/projects/${projectId}/spec`);

  return { errorCode: null, message: null, successMessage: successMessageFor(result) };
}

function successMessageFor(result: { adoptableProjectVersion: number | null; hasProposal: boolean }) {
  if (!result.hasProposal) {
    return "已收到访谈回复。";
  }
  if (result.adoptableProjectVersion === null) {
    return "候选已生成，但生成期间项目内容有改动，该候选已过期，请重新生成。";
  }
  return "候选 Spec 已生成，可在下方预览。";
}
