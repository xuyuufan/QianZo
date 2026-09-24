"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { completeOnboarding } from "@/modules/identity/service";
import {
  AuthenticationError,
  requireAuth,
  createSupabaseServerClient,
} from "@/platform/auth/server";

import type { FormActionState } from "./form-state";

const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  intent: z.enum(["requester", "builder"]).optional(),
});

export async function signInAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const input = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    intent: formData.get("intent") || undefined,
  });
  if (!input.success) {
    return { errorCode: "INVALID_CREDENTIALS", message: "邮箱或密码不正确。" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(input.data);
  if (error) {
    return { errorCode: "INVALID_CREDENTIALS", message: "邮箱或密码不正确。" };
  }

  redirect(input.data.intent ? `/?intent=${input.data.intent}` : "/");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

export async function completeOnboardingAction(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  try {
    const userId = await requireAuth();
    await completeOnboarding(userId, {
      displayName: formData.get("displayName"),
      roles: formData.getAll("roles"),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { errorCode: "VALIDATION_ERROR", message: "请填写显示名并至少选择一个身份。" };
    }
    if (error instanceof AuthenticationError) {
      return { errorCode: "AUTHENTICATION_REQUIRED", message: "请重新登录后再操作。" };
    }
    return { errorCode: "ONBOARDING_FAILED", message: "暂时无法保存，请稍后再试。" };
  }

  const intent = formData.get("intent");
  redirect(intent === "requester" || intent === "builder" ? `/?intent=${intent}` : "/");
}
