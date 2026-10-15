"use client";

import { useActionState, useMemo, useState } from "react";

import { emptyProjectActionState } from "@/app/actions/project-state";
import { saveReferenceBudgetAction } from "@/app/actions/projects";
import { DEMO_CURRENCY, formatMinorUnits, parseMinorUnits } from "@/modules/projects/money";

type BudgetFormProps = {
  projectId: string;
  version: number;
  minAmount: string;
  maxAmount: string;
};

function validateBudget(minAmount: string, maxAmount: string) {
  const min = parseMinorUnits(minAmount, DEMO_CURRENCY);
  const max = parseMinorUnits(maxAmount, DEMO_CURRENCY);
  const issues: string[] = [];

  if (min === null) {
    issues.push("预算下限必须是不超过两位小数的非负金额。");
  }
  if (max === null) {
    issues.push("预算上限必须是不超过两位小数的非负金额。");
  }
  if (min !== null && max !== null && max < min) {
    issues.push("预算上限不能低于预算下限。");
  }

  return { issues, min, max };
}

export function BudgetForm({ projectId, version, minAmount, maxAmount }: BudgetFormProps) {
  const action = saveReferenceBudgetAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, emptyProjectActionState);
  const [minInput, setMinInput] = useState(minAmount);
  const [maxInput, setMaxInput] = useState(maxAmount);

  const validation = useMemo(() => validateBudget(minInput, maxInput), [minInput, maxInput]);
  const issues = validation.issues.length > 0 ? validation.issues : state.issues;
  const preview =
    validation.min !== null && validation.max !== null
      ? `将精确保存为 ¥${formatMinorUnits(validation.min, DEMO_CURRENCY)} – ¥${formatMinorUnits(validation.max, DEMO_CURRENCY)}`
      : null;

  return (
    <form action={formAction} className="project-form">
      <input name="expectedVersion" type="hidden" value={version} />
      <div className="field-row">
        <label className="field">
          <span>参考预算下限（{DEMO_CURRENCY}）</span>
          <input
            name="minAmount"
            type="text"
            inputMode="decimal"
            value={minInput}
            onChange={(event) => setMinInput(event.target.value)}
            maxLength={20}
            required
          />
        </label>
        <label className="field">
          <span>参考预算上限（{DEMO_CURRENCY}）</span>
          <input
            name="maxAmount"
            type="text"
            inputMode="decimal"
            value={maxInput}
            onChange={(event) => setMaxInput(event.target.value)}
            maxLength={20}
            required
          />
        </label>
      </div>
      {preview && issues.length === 0 ? <p className="spec-muted">{preview}</p> : null}
      {issues.length > 0 ? (
        <ul className="issue-list" role="alert">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
      {state.message ? (
        <p
          className={`form-message ${state.errorCode ? "error" : "success"}`}
          role="status"
          data-error-code={state.errorCode ?? undefined}
        >
          {state.message}
        </p>
      ) : null}
      <p className="spec-muted">这是本地演示的参考金额，不是成交价，也不构成报价或合同条款。</p>
      <button className="button" type="submit" disabled={pending || validation.issues.length > 0}>
        {pending ? "正在保存…" : "保存参考预算"}
      </button>
    </form>
  );
}
