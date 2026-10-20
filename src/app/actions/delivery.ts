"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { mapSharedActionError } from "@/app/actions/error-mapping";
import type { DeliveryActionState } from "@/app/actions/delivery-state";
import { DeliveryError } from "@/modules/delivery/errors";
import { completeProject, reviewDelivery, submitDelivery } from "@/modules/delivery/service";
import { requireAuth } from "@/platform/auth/server";

function failure(errorCode: string, message: string, issues: string[] = []): DeliveryActionState {
  return { errorCode, message, successMessage: null, issues };
}

function actionFailure(error: unknown, role: "BUILDER" | "ENTERPRISE"): DeliveryActionState {
  const shared = mapSharedActionError(error, {
    roleRequired: role === "BUILDER" ? "只有当前承接项目的 Builder 可以提交成果。" : "只有项目所属企业可以验收或确认完成。",
    validation: { errorCode: "VALIDATION_ERROR", message: "请检查链接和验收结果。", includeFieldIssues: true },
  });
  if (shared) return failure(shared.errorCode, shared.message, shared.issues ?? []);
  if (error instanceof z.ZodError) return failure("VALIDATION_ERROR", "请检查链接和验收结果。");
  if (error instanceof DeliveryError) {
    switch (error.code) {
      case "NOT_FOUND":
        return failure("NOT_FOUND", "项目或交付记录不存在。");
      case "CONFLICT":
        return failure("CONFLICT", error.message);
      case "INVALID_REVIEW":
        return failure("INVALID_REVIEW", error.message);
      default:
        return failure("INVALID_STAGE", error.message);
    }
  }
  return failure("DELIVERY_ACTION_FAILED", "暂时无法完成交付操作，请刷新后重试。");
}

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}/workspace`);
  revalidatePath(`/enterprise/projects/${projectId}`);
  revalidatePath(`/enterprise/projects/${projectId}/applications`);
  revalidatePath(`/enterprise/projects`);
  revalidatePath(`/builder/applications`);
}

export async function submitDeliveryAction(
  projectId: string,
  milestoneId: string,
  _previous: DeliveryActionState,
  formData: FormData,
): Promise<DeliveryActionState> {
  try {
    const userId = await requireAuth();
    const result = await submitDelivery(userId, {
      projectId,
      milestoneId,
      submissionKey: formData.get("submissionKey"),
      expectedCurrentSubmissionId: formData.get("expectedCurrentSubmissionId") === ""
        ? null
        : formData.get("expectedCurrentSubmissionId"),
      summary: formData.get("summary"),
      links: formData.getAll("link").map(String).filter((value) => value.length > 0),
    });
    revalidateProject(projectId);
    return {
      errorCode: null,
      message: null,
      successMessage: result.replayed ? "已找到这次提交记录，未重复创建。" : "成果已提交，等待企业逐项验收。",
      issues: [],
    };
  } catch (error) {
    return actionFailure(error, "BUILDER");
  }
}

export async function reviewDeliveryAction(
  projectId: string,
  milestoneId: string,
  submissionId: string,
  _previous: DeliveryActionState,
  formData: FormData,
): Promise<DeliveryActionState> {
  try {
    const userId = await requireAuth();
    const criteriaResults = formData.getAll("criterionResult").map((entry) => {
      const value = String(entry);
      const match = /^(\d+):(PASS|FAIL)$/.exec(value);
      return match ? { position: Number(match[1]), outcome: match[2] } : value;
    });
    const result = await reviewDelivery(userId, {
      projectId,
      milestoneId,
      submissionId,
      criteriaResults,
      reason: formData.get("reason"),
    });
    revalidateProject(projectId);
    return {
      errorCode: null,
      message: null,
      successMessage: result.replayed
        ? "已找到原验收记录，未重复推进项目。"
        : result.outcome === "PASS"
          ? result.projectStatus === "FINAL_REVIEW"
            ? "全部里程碑已通过，项目进入最终验收。"
            : "本里程碑已通过，后续里程碑已开放。"
          : "已记录逐项结果与返工原因，Builder 可以提交新版本。",
      issues: [],
    };
  } catch (error) {
    return actionFailure(error, "ENTERPRISE");
  }
}

export async function completeProjectAction(
  projectId: string,
  previous: DeliveryActionState,
  formData: FormData,
): Promise<DeliveryActionState> {
  void previous;
  void formData;
  try {
    const userId = await requireAuth();
    const result = await completeProject(userId, { projectId });
    revalidateProject(projectId);
    return {
      errorCode: null,
      message: null,
      successMessage: result.replayed ? "项目已经完成。" : "你已确认项目最终验收，项目现已完成。",
      issues: [],
    };
  } catch (error) {
    return actionFailure(error, "ENTERPRISE");
  }
}
