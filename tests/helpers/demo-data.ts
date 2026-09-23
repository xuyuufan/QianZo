import type postgres from "postgres";

/**
 * Deletes the business rows the local demo and the E2E tests create, in
 * dependency order: spec versions point at projects and at candidate messages,
 * messages point at sessions, and projects point back at their current spec
 * version. Only the rows owned by the given synthetic users are touched, and the
 * pointers are cleared instead of deleting anything a test did not create.
 */
export async function clearDemoBusinessData(
  sql: ReturnType<typeof postgres>,
  userIds: string[],
) {
  if (userIds.length === 0) {
    return;
  }

  await sql`
    update app.projects
    set current_spec_version_id = null
    where owner_id in ${sql(userIds)} and current_spec_version_id is not null
  `;
  await sql`
    delete from app.spec_versions
    where project_id in (select id from app.projects where owner_id in ${sql(userIds)})
  `;
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
