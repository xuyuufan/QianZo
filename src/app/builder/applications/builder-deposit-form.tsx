"use client";

import { useActionState } from "react";

import { emptyPaymentActionState } from "@/app/actions/payment-state";
import type { PaymentActionState } from "@/app/actions/payment-state";
import { Button } from "@/components/ui/button";
import {
  createBuilderDepositAction,
  simulateBuilderDepositSuccessAction,
} from "@/app/actions/payments";
import type { BuilderDepositDTO } from "@/modules/payments/dto";
import { describeAmount } from "@/modules/projects/money";

export function BuilderDepositForm({ deposit }: { deposit: BuilderDepositDTO }) {
  const createAction = createBuilderDepositAction.bind(null, deposit.projectId);
  const [createState, createFormAction, creating] = useActionState(
    createAction,
    emptyPaymentActionState,
  );
  const simulateAction = simulateBuilderDepositSuccessAction.bind(null, deposit.projectId);
  const [simulateState, simulateFormAction, simulating] = useActionState(
    simulateAction,
    emptyPaymentActionState,
  );
  const payment = deposit.payment;
  const amount = payment
    ? describeAmount(payment.amountMinor, payment.currency)
    : describeAmount(100, "CNY");

  return (
    <section className="mt-5 border-t border-border pt-4" aria-label="Builder 模拟押金">
      <h3 className="font-zh text-sm">Builder Mock 押金 · {amount}</h3>
      <p className="mt-2 font-zh text-xs leading-5 text-muted-foreground">
        固定本地演示金额为 ¥1.00；模拟操作不发生真实收付，也不代表合同接受。
      </p>

      {payment?.status === "PENDING" ? (
        <p className="mt-3 font-zh text-xs text-muted-foreground" role="status" data-testid="builder-deposit-status">
          已创建模拟押金，等待你完成模拟支付。
        </p>
      ) : null}
      {payment?.status === "SUCCEEDED" ? (
        <p className="mt-3 font-zh text-xs text-builder" role="status" data-testid="builder-deposit-status">
          模拟押金成功，等待项目开工状态更新。
        </p>
      ) : null}

      {!payment ? (
        <form action={createFormAction} className="mt-4">
          <Button type="submit" size="sm" disabled={creating}>
            {creating ? "正在创建…" : "创建 Builder 模拟押金"}
          </Button>
        </form>
      ) : payment.status === "PENDING" ? (
        <form action={simulateFormAction} className="mt-4">
          <input name="paymentId" type="hidden" value={payment.id} />
          <Button type="submit" size="sm" disabled={simulating}>
            {simulating ? "正在模拟支付…" : "模拟押金支付成功"}
          </Button>
        </form>
      ) : null}

      <ActionMessages state={createState} />
      <ActionMessages state={simulateState} />
    </section>
  );
}

function ActionMessages({ state }: { state: PaymentActionState }) {
  return (
    <>
      {state.message ? (
        <p className="mt-3 font-zh text-xs leading-5 text-destructive" role="alert" data-error-code={state.errorCode ?? undefined}>
          {state.message}
        </p>
      ) : null}
      {state.successMessage ? (
        <p className="mt-3 font-zh text-xs leading-5 text-builder" role="status">
          {state.successMessage}
        </p>
      ) : null}
    </>
  );
}
