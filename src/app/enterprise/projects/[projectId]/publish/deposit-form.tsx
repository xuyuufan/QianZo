"use client";

import { useActionState } from "react";

import { emptyPaymentActionState } from "@/app/actions/payment-state";
import type { PaymentActionState } from "@/app/actions/payment-state";
import {
  createEnterpriseDepositAction,
  simulatePaymentSuccessAction,
} from "@/app/actions/payments";

export type DepositSummary = {
  id: string;
  status: "PENDING" | "SUCCEEDED";
  amount: string;
  createdAt: string;
  succeededAt: string | null;
};

type DepositFormProps = {
  projectId: string;
  payment: DepositSummary | null;
  /** Fixed server-side demo amount, shown before any payment exists. */
  fixtureAmount: string;
};

export function DepositForm({ projectId, payment, fixtureAmount }: DepositFormProps) {
  const createAction = createEnterpriseDepositAction.bind(null, projectId);
  const [createState, createFormAction, creating] = useActionState(
    createAction,
    emptyPaymentActionState,
  );
  const simulateAction = simulatePaymentSuccessAction.bind(null, projectId);
  const [simulateState, simulateFormAction, simulating] = useActionState(
    simulateAction,
    emptyPaymentActionState,
  );

  return (
    <>
      <p className="spec-muted">
        本次演示的定金固定为 {payment?.amount ?? fixtureAmount}，由服务端 fixture 提供，
        不按预算比例计算，也不表示已经确定定金标准。
      </p>

      {payment ? (
        <p
          className={`form-message ${payment.status === "SUCCEEDED" ? "success" : "info"}`}
          role="status"
          data-payment-status={payment.status}
        >
          {payment.status === "SUCCEEDED"
            ? `模拟支付成功（${payment.succeededAt}）。付款只满足发布前置条件，仍需你在脱敏预览后显式执行发布。`
            : `已创建模拟定金（创建于 ${payment.createdAt}），等待模拟支付。`}
        </p>
      ) : null}

      {!payment ? (
        <form action={createFormAction} className="form-actions">
          <button className="button" type="submit" disabled={creating}>
            {creating ? "正在创建…" : "创建企业模拟定金"}
          </button>
        </form>
      ) : null}

      {payment?.status === "PENDING" ? (
        <form action={simulateFormAction} className="form-actions">
          <input name="paymentId" type="hidden" value={payment.id} />
          <button className="button" type="submit" disabled={simulating}>
            {simulating ? "正在模拟…" : "模拟支付成功"}
          </button>
        </form>
      ) : null}

      <ActionMessages state={createState} />
      <ActionMessages state={simulateState} />

      <p className="spec-muted">模拟支付不代表真实收付，也不构成合同接受。</p>
    </>
  );
}

function ActionMessages({ state }: { state: PaymentActionState }) {
  return (
    <>
      {state.message ? (
        <p className="form-message error" role="alert" data-error-code={state.errorCode ?? undefined}>
          {state.message}
        </p>
      ) : null}
      {state.successMessage ? (
        <p className="form-message success" role="status">
          {state.successMessage}
        </p>
      ) : null}
    </>
  );
}
