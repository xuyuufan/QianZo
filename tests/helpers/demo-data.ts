import type postgres from "postgres";

/**
 * Deletes the business rows the local demo and the tests create, in dependency
 * order: spec versions point at projects and at candidate messages, messages
 * point at sessions, and projects point back at their current spec version.
 *
 * Everything runs in one transaction because the two project→spec_version
 * foreign keys are deferrable: their checks run at commit, by which point both
 * sides are gone. The locked-scope guard is never bypassed, and only rows owned
 * by the given synthetic users are touched.
 */
export async function clearDemoBusinessData(
  sql: ReturnType<typeof postgres>,
  userIds: string[],
) {
  if (userIds.length === 0) {
    return;
  }

  await sql.begin(async (transaction) => {
    // Payments reference both the project and the payer, so they go first.
    await transaction`
      delete from app.payments
      where project_id in (select id from app.projects where owner_id in ${transaction(userIds)})
    `;
    await transaction`
      delete from app.spec_versions
      where project_id in (select id from app.projects where owner_id in ${transaction(userIds)})
    `;
    await transaction`
      delete from app.aipm_messages
      where session_id in (
        select id from app.aipm_sessions
        where project_id in (select id from app.projects where owner_id in ${transaction(userIds)})
      )
    `;
    await transaction`
      delete from app.aipm_sessions
      where project_id in (select id from app.projects where owner_id in ${transaction(userIds)})
    `;
    await transaction`delete from app.projects where owner_id in ${transaction(userIds)}`;
  });
}
