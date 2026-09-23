-- Drizzle lists every table column in INSERT statements (missing values become
-- `default`), which forced the table-level INSERT grants this migration used to
-- issue. Those grants let the runtime role set status, version, and timestamps
-- on insert. The application now inserts with explicit column lists, so this
-- migration restores the column-scoped INSERT grants from the foundation
-- migration as the authoritative grants. A table-level REVOKE also clears
-- column-level grants, hence the explicit re-grant.
revoke insert on app.users from qianzo_runtime;
revoke insert on app.user_roles from qianzo_runtime;
revoke insert on app.projects from qianzo_runtime;

grant insert (id, display_name) on app.users to qianzo_runtime;
grant insert (user_id, role) on app.user_roles to qianzo_runtime;
grant insert (id, owner_id, title, original_requirement) on app.projects to qianzo_runtime;
