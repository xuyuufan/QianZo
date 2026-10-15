import { and, eq } from "drizzle-orm";

import type { Database } from "@/platform/db/client";
import { projects } from "@/platform/db/schema";

export type Project = typeof projects.$inferSelect;

/** The transaction handle Drizzle hands to `Database.transaction`. */
export type ProjectLockExecutor = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type ProjectLockErrors = {
  notFound: () => Error;
  /** When provided, a project whose scope is already locked is refused. */
  specLocked?: () => Error;
  /** When provided with `expectedVersion`, a version drift is refused. */
  versionConflict?: () => Error;
};

/**
 * Locks one owned project row (`select ... for update`) and runs `fn` with it.
 *
 * The row lock is always taken first, which is what serialises the concurrent
 * writers that share it: saving/locking a Spec version, creating or confirming
 * the deposit, and publishing all move the Project version token.
 *
 * The optional guards run in a fixed order — not found, then locked scope, then
 * version drift — which is exactly the order every caller that can use them
 * already relied on. Callers with a different order (for example `publish`,
 * which resolves a repeated published intent before checking the locked
 * pointer, or `lockSpec`, which inspects the current version first) pass only
 * the guards they need and run their own checks inside `fn`, so no caller's
 * decision order or error code changes.
 */
export async function withProjectLock<T>(
  executor: ProjectLockExecutor,
  params: { projectId: string; ownerId: string; expectedVersion?: number },
  errors: ProjectLockErrors,
  fn: (project: Project) => Promise<T>,
): Promise<T> {
  const [project] = await executor
    .select()
    .from(projects)
    .where(and(eq(projects.id, params.projectId), eq(projects.ownerId, params.ownerId)))
    .limit(1)
    .for("update");

  if (!project) {
    throw errors.notFound();
  }
  if (errors.specLocked && project.lockedSpecVersionId) {
    throw errors.specLocked();
  }
  if (
    errors.versionConflict &&
    params.expectedVersion !== undefined &&
    project.version !== params.expectedVersion
  ) {
    throw errors.versionConflict();
  }

  return fn(project);
}
