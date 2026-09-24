import { z } from "zod";

import { IdentityError } from "@/modules/identity/onboarding";
import { AuthenticationError } from "@/platform/auth/server";
import { describeFieldIssues } from "@/platform/validation";

/**
 * Shared mapping for the cross-cutting errors every Server Action can raise:
 * authentication, identity and input validation. Domain-specific errors stay in
 * each action; only the parts that are identical across `projects`, `aipm`,
 * `specs`, `payments` and `publish` live here, so nothing user-facing changes
 * apart from the one message that legitimately differs per domain (the role
 * guard), which each action passes in.
 */

export type SharedErrorCopy = {
  /** "Please sign in again" copy; the same for every action. */
  authentication?: string;
  /** The one message that differs per domain: the required-role guard. */
  roleRequired: string;
  actorDisabled?: string;
  onboardingRequired?: string;
  /**
   * How a `z.ZodError` from input validation is reported. Omit it when the
   * action reports Zod errors elsewhere (for example with a field-level report
   * or a confirmation-specific message); the shared mapper then leaves the
   * `ZodError` to the caller instead of turning it into a generic message.
   */
  validation?: {
    errorCode: string;
    message: string;
    includeFieldIssues?: boolean;
  };
};

export type MappedActionError = {
  errorCode: string;
  message: string;
  /** Present only when `validation.includeFieldIssues` was set. */
  issues?: string[];
};

const DEFAULT_AUTHENTICATION = "请重新登录后再操作。";
const DEFAULT_ACTOR_DISABLED = "账号已停用，无法继续操作。";
const DEFAULT_ONBOARDING = "请先完成身份设置。";

/**
 * PostgreSQL SQLSTATE codes that would otherwise fall through to the generic
 * "please try again" copy. They map to a stable domain code; the raw SQL text,
 * the provider body and any stack trace are never returned to the client.
 */
const databaseErrorMappings: Record<string, MappedActionError> = {
  // 23505 unique_violation: a concurrent write won the same slot.
  "23505": { errorCode: "VERSION_CONFLICT", message: "该项目正在被其他操作更新，请刷新后重试。" },
  // 23514 check_violation: the row or a trigger refused the new state.
  "23514": { errorCode: "INVALID_INPUT", message: "提交的内容不符合当前项目状态。" },
  // 23503 foreign_key_violation: a referenced row is missing or has changed.
  "23503": { errorCode: "INVALID_INPUT", message: "提交的内容引用了不存在或已变更的资源。" },
};

function matchDatabaseError(error: unknown): MappedActionError | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  // Only the numeric SQLSTATE codes are matched, so a domain error that also
  // carries a `code` (e.g. "NOT_FOUND") is never mistaken for a database error.
  // `Object.hasOwn` keeps inherited keys such as "constructor" out of the map.
  if (typeof code !== "string" || !Object.hasOwn(databaseErrorMappings, code)) {
    return null;
  }
  return databaseErrorMappings[code];
}

/**
 * Returns the shared mapping of `error`, or `null` when the error is
 * domain-specific and must be handled by the caller (or is unknown).
 */
export function mapSharedActionError(error: unknown, copy: SharedErrorCopy): MappedActionError | null {
  if (error instanceof AuthenticationError) {
    return { errorCode: "AUTHENTICATION_REQUIRED", message: copy.authentication ?? DEFAULT_AUTHENTICATION };
  }
  if (error instanceof IdentityError) {
    if (error.code === "ROLE_REQUIRED") {
      return { errorCode: "FORBIDDEN", message: copy.roleRequired };
    }
    if (error.code === "ACTOR_DISABLED") {
      return { errorCode: "ACTOR_DISABLED", message: copy.actorDisabled ?? DEFAULT_ACTOR_DISABLED };
    }
    return { errorCode: "ONBOARDING_REQUIRED", message: copy.onboardingRequired ?? DEFAULT_ONBOARDING };
  }
  if (copy.validation && error instanceof z.ZodError) {
    return {
      errorCode: copy.validation.errorCode,
      message: copy.validation.message,
      ...(copy.validation.includeFieldIssues ? { issues: describeFieldIssues(error) } : {}),
    };
  }
  return matchDatabaseError(error);
}
