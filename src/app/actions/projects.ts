"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { mapSharedActionError } from "@/app/actions/error-mapping";
import type { ProjectActionState } from "@/app/actions/project-state";
import { ProjectError } from "@/modules/projects/errors";
import { describeBudget } from "@/modules/projects/money";
import { createProject, saveReferenceBudget, updateProjectDraft } from "@/modules/projects/service";
import { requireAuth } from "@/platform/auth/server";

function actionFailure(error: unknown): ProjectActionState {
  // Authentication, identity and input validation are shared across actions;
  // only the required-role copy differs per domain.
  const shared = mapSharedActionError(error, {
    roleRequired: "只有企业身份可以管理项目草稿。",
    validation: {
      errorCode: "VALIDATION_ERROR",
      message: "请检查填写内容。",
      includeFieldIssues: true,
    },
  });
  if (shared) {
    return {
      errorCode: shared.errorCode,
      message: shared.message,
      successMessage: null,
      issues: shared.issues ?? [],
    };
  }
  if (error instanceof ProjectError) {
    if (error.code === "NOT_FOUND") {
      return { errorCode: "NOT_FOUND", message: "项目不存在。", successMessage: null, issues: [] };
    }
    if (error.code === "SPEC_LOCKED") {
      return {
        errorCode: "SPEC_LOCKED",
        message: "已锁定评审范围，标题、需求与参考预算不能再修改。",
        successMessage: null,
        issues: [],
      };
    }
    if (error.code === "VERSION_CONFLICT") {
      return {
        errorCode: "VERSION_CONFLICT",
        message: "项目已被更新，请刷新页面后再编辑。",
        successMessage: null,
        issues: [],
      };
    }
    return {
      errorCode: "CREATE_CONFLICT",
      message: "该创建请求与已有项目冲突。",
      successMessage: null,
      issues: [],
    };
  }
  return {
    errorCode: "PROJECT_ACTION_FAILED",
    message: "暂时无法保存，请稍后再试。",
    successMessage: null,
    issues: [],
  };
}

export async function createProjectAction(
  projectId: string,
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  let createdId: string;
  try {
    const userId = await requireAuth();
    const project = await createProject(userId, {
      projectId,
      title: formData.get("title"),
      originalRequirement: formData.get("originalRequirement"),
    });
    createdId = project.id;
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/enterprise/projects");
  redirect(`/enterprise/projects/${createdId}`);
}

export async function updateProjectAction(
  projectId: string,
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  try {
    const userId = await requireAuth();
    await updateProjectDraft(userId, {
      projectId,
      expectedVersion: formData.get("expectedVersion"),
      title: formData.get("title"),
      originalRequirement: formData.get("originalRequirement"),
    });
  } catch (error) {
    return actionFailure(error);
  }

  revalidatePath("/enterprise/projects");
  revalidatePath(`/enterprise/projects/${projectId}`);
  redirect(`/enterprise/projects/${projectId}?saved=1`);
}

export async function saveReferenceBudgetAction(
  projectId: string,
  _previous: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  try {
    const userId = await requireAuth();
    const project = await saveReferenceBudget(userId, {
      projectId,
      expectedVersion: formData.get("expectedVersion"),
      minAmount: formData.get("minAmount"),
      maxAmount: formData.get("maxAmount"),
    });
    revalidatePath("/enterprise/projects");
    revalidatePath(`/enterprise/projects/${projectId}`);
    revalidatePath(`/enterprise/projects/${projectId}/spec`);
    return {
      errorCode: null,
      message: `参考预算已保存：${describeBudget(project.budgetMinMinor, project.budgetMaxMinor, project.currency)}（项目版本 ${project.version}）。这是模拟参考金额，不是成交价。`,
      successMessage: null,
      issues: [],
    };
  } catch (error) {
    return actionFailure(error);
  }
}
