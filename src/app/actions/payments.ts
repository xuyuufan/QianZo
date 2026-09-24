"use server";

import { revalidatePath } from "next/cache";

import { mapSharedActionError } from "@/app/actions/error-mapping";
import type { PaymentActionState } from "@/app/actions/payment-state";
import { PaymentError } from "@/modules/payments/errors";
import { describeAmount } from "@/modules/projects/money";
import {
  createEnterpriseDeposit,
  simulatePaymentSuccess,
} from "@/modules/payments/service";
import { requireAuth } from "@/platform/auth/server";

function failure(state: Omit<PaymentActionState, "successMessage">): PaymentActionState {
  return { ...state, successMessage: null };
}

function actionFailure(error: unknown): PaymentActionState {
  // Authentication, identity and input validation are shared across actions;
  // only the required-role copy differs per domain.
  const shared = mapSharedActionError(error, {
    roleRequired: "只有企业身份可以支付企业定金。",
    validation: { errorCode: "VALIDATION_ERROR", message: "请刷新页面后重试。" },
  });
  if (shared) {
    return failure({ errorCode: shared.errorCode, message: shared.message });
  }
  if (error instanceof PaymentError) {
    switch (error.code) {
      case "NOT_FOUND":
        return failure({ errorCode: "NOT_FOUND", message: "项目或定金记录不存在。" });
      case "SPEC_LOCKED":
        return failure({
          errorCode: "SPEC_LOCKED",
          message: "企业定金只在 Spec 锁定后才能创建或确认。",
        });
      case "INVALID_STAGE":
        return failure({
          errorCode: "INVALID_STAGE",
          message: "项目已经过了定金阶段，不能再次创建或确认。",
        });
      default:
        return failure({ errorCode: "PAYMENT_REQUIRED", message: "还没有成功的模拟定金。" });
    }
  }
  return failure({ errorCode: "PAYMENT_ACTION_FAILED", message: "暂时无法完成支付操作，请稍后再试。" });
}

function revalidatePaymentPages(projectId: string) {
  revalidatePath(`/enterprise/projects/${projectId}`);
  revalidatePath(`/enterprise/projects/${projectId}/spec`);
  revalidatePath(`/enterprise/projects/${projectId}/publish`);
}

/**
 * The project is the only input and it is bound into the action, so the
 * `(previousState, payload)` arguments React passes can be ignored.
 */
export async function createEnterpriseDepositAction(
  projectId: string,
): Promise<PaymentActionState> {
  try {
    const userId = await requireAuth();
    const payment = await createEnterpriseDeposit(userId, { projectId });
    revalidatePaymentPages(projectId);
    return {
      errorCode: null,
      message: null,
      successMessage: `已创建企业模拟定金 ${describeAmount(payment.amountMinor, payment.currency)}（模拟金额，不发生真实收付）。`,
    };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function simulatePaymentSuccessAction(
  projectId: string,
  _previous: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  try {
    const userId = await requireAuth();
    const payment = await simulatePaymentSuccess(userId, {
      projectId,
      paymentId: formData.get("paymentId"),
    });
    revalidatePaymentPages(projectId);
    return {
      errorCode: null,
      message: null,
      successMessage: `模拟支付成功（${describeAmount(payment.amountMinor, payment.currency)}）。发布仍需你在脱敏预览后手动确认。`,
    };
  } catch (error) {
    return actionFailure(error);
  }
}
