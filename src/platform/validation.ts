import type { z } from "zod";

/**
 * Turns a validation error into field-level messages such as
 * `milestones.0.dueAfterDays: ...`, shared by the server actions and the client
 * forms that run the same schemas.
 */
export function describeFieldIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
