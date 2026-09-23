import type postgres from "postgres";

/**
 * Deletes the business rows the local demo and the E2E tests create, in
 * dependency order: interview messages and sessions point at projects, so a
 * plain `delete from app.projects` would fail on the RESTRICT foreign keys.
 * Only the rows owned by the given synthetic users are touched.
 */
export async function clearDemoBusinessData(
  sql: ReturnType<typeof postgres>,
  userIds: string[],
) {
  if (userIds.length === 0) {
    return;
  }

  await sql`
    delete from app.aipm_messages
    where session_id in (
      select id from app.aipm_sessions
      where project_id in (select id from app.projects where owner_id in ${sql(userIds)})
    )
  `;
  await sql`
    delete from app.aipm_sessions
    where project_id in (select id from app.projects where owner_id in ${sql(userIds)})
  `;
  await sql`delete from app.projects where owner_id in ${sql(userIds)}`;
}
