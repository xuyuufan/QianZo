"use client";

import { createContext, useContext } from "react";

export type SpecFieldIssue = { path: string; message: string };

const SpecFieldIssueContext = createContext<SpecFieldIssue[]>([]);

export function SpecFieldIssueProvider({
  value,
  children,
}: {
  value: SpecFieldIssue[];
  children: React.ReactNode;
}) {
  return <SpecFieldIssueContext.Provider value={value}>{children}</SpecFieldIssueContext.Provider>;
}

/** Shared text input for ordinary editing, masked editing, and read-only review. */
export function SpecField({
  label,
  path,
  value,
  onChange,
  multiline = false,
  optional = false,
  readOnly = false,
}: {
  label: string;
  path: string;
  value: string;
  onChange?: (value: string) => void;
  multiline?: boolean;
  optional?: boolean;
  readOnly?: boolean;
}) {
  const fieldId = `field-${path.replaceAll(/[^A-Za-z0-9_-]/g, "-")}`;
  const issue = useContext(SpecFieldIssueContext).find((entry) => entry.path === path);
  const errorId = issue ? `${fieldId}-error` : undefined;

  return (
    <label className="field" htmlFor={fieldId}>
      <span>{label}{optional ? <small>（可选）</small> : null}</span>
      {multiline ? (
        <textarea
          id={fieldId}
          value={value}
          readOnly={readOnly}
          aria-invalid={Boolean(issue)}
          aria-describedby={errorId}
          onChange={onChange ? (event) => onChange(event.currentTarget.value) : undefined}
          rows={3}
        />
      ) : (
        <input
          id={fieldId}
          value={value}
          readOnly={readOnly}
          aria-invalid={Boolean(issue)}
          aria-describedby={errorId}
          onChange={onChange ? (event) => onChange(event.currentTarget.value) : undefined}
        />
      )}
      {issue ? <small id={errorId} className="field-error">{issue.message}</small> : null}
    </label>
  );
}
