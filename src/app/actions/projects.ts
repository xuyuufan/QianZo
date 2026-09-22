"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ProjectActionState } from "@/app/actions/project-state";
import { IdentityError } from "@/modules/identity/onboarding";
import { ProjectError } from "@/modules/projects/repository";
import { createProject, updateProjectDraft } from "@/modules/projects/service";
import { AuthenticationError, requireAuth } from "@/platform/auth/server";

function actionFailure(error: unknown): ProjectActionState {
  if (error instanceof z.ZodError) {
    return { errorCode: "VALIDATION_ERROR", message: "请检查标题、需求内容和版本信息。" };
  }
  if (error instanceof AuthenticationError) {
    return { errorCode: "AUTHENTICATION_REQUIRED", message: "请重新登录后再操作。" };
  }
  if (error instanceof IdentityError) {
    if (error.code === "ROLE_REQUIRED") {
      return { errorCode: "FORBIDDEN", message: "只有企业身份可以管理项目草稿。" };
    }
    if (error.code === "ACTOR_DISABLED") {
      return { errorCode: "ACTOR_DISABLED", message: "账号已停用，无法继续操作。" };
    }
    return { errorCode: "ONBOARDING_REQUIRED", message: "请先完成身份设置。" };
  }
  if (error instanceof ProjectError) {
    if (error.code === "NOT_FOUND") {
      return { errorCode: "NOT_FOUND", message: "项目不存在。" };
    }
    if (error.code === "VERSION_CONFLICT") {
      return { errorCode: "VERSION_CONFLICT", message: "项目已被更新，请刷新页面后再编辑。" };
    }
    return { errorCode: "CREATE_CONFLICT", message: "该创建请求与已有项目冲突。" };
  }
  return { errorCode: "PROJECT_ACTION_FAILED", message: "暂时无法保存，请稍后再试。" };
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
